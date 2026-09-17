package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
	"unicode"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/text/unicode/norm"
)

const suggestionIndex = "webgis-suggestions"

type suggestionDocument struct {
	ID         int64     `json:"-"`
	Name       string    `json:"name"`
	Normalized string    `json:"name_normalized"`
	Aliases    []string  `json:"aliases"`
	Category   string    `json:"category"`
	Importance float64   `json:"importance"`
	Rank       float64   `json:"rank"`
	Address    string    `json:"address"`
	Location   []float64 `json:"location"`
}

func normalizeSuggestion(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.NewReplacer("\u0111", "d", "\u00f0", "d").Replace(value)
	value = strings.ReplaceAll(value, "đ", "d")
	value = strings.ReplaceAll(value, "ð", "d")
	decomposed := norm.NFD.String(value)
	var result strings.Builder
	for _, character := range decomposed {
		if unicode.Is(unicode.Mn, character) {
			continue
		}
		if unicode.IsLetter(character) || unicode.IsDigit(character) {
			result.WriteRune(character)
		} else {
			result.WriteByte(' ')
		}
	}
	return strings.Join(strings.Fields(result.String()), " ")
}

func suggestionAliases(name string) []string {
	normalized := normalizeSuggestion(name)
	aliases := []string{normalized}
	switch normalized {
	case "ha noi":
		aliases = append(aliases, "hn", "hanoi", "thu do ha noi")
	case "ho chi minh":
		aliases = append(aliases, "hcm", "tphcm", "tp hcm", "sai gon", "saigon")
	case "ho tay":
		aliases = append(aliases, "west lake")
	}
	return aliases
}

// suggestionRank adds product relevance that Nominatim's importance does not
// express: a capital/city or well-known lake should beat similarly named POIs.
func suggestionRank(category string, importance float64) float64 {
	rank := importance + 0.01
	switch category {
	case "place:city":
		rank += 100
	case "place:town", "boundary:administrative":
		rank += 40
	case "water:lake":
		rank += 20
	case "water:reservoir":
		rank += 5
	}
	return rank
}

func suggestionPlaceName(name, address string) string {
	address = strings.TrimSpace(address)
	if address == "" {
		return name
	}
	return name + ", " + address
}

func elasticRequest(ctx context.Context, client *http.Client, method, target string, body any) (*http.Response, error) {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, target, reader)
	if err != nil {
		return nil, err
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	return client.Do(request)
}

func elasticStatusError(response *http.Response) error {
	defer response.Body.Close()
	message, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
	return fmt.Errorf("elasticsearch returned %s: %s", response.Status, strings.TrimSpace(string(message)))
}

func waitForElasticsearch(ctx context.Context, client *http.Client, endpoint string) error {
	deadline := time.Now().Add(2 * time.Minute)
	var lastError error
	for time.Now().Before(deadline) {
		response, err := elasticRequest(ctx, client, http.MethodGet, endpoint+"/_cluster/health", nil)
		if err == nil && response.StatusCode == http.StatusOK {
			response.Body.Close()
			return nil
		}
		if err != nil {
			lastError = err
		} else {
			lastError = elasticStatusError(response)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	return fmt.Errorf("elasticsearch did not become ready: %w", lastError)
}

func (server *Server) suggestions(response http.ResponseWriter, request *http.Request) {
	query := strings.TrimSpace(request.URL.Query().Get("q"))
	if len([]rune(query)) < 2 || len([]rune(query)) > 120 {
		clientError(response, http.StatusBadRequest, "Query must contain 2 to 120 characters")
		return
	}
	if server.config.ElasticsearchURL == "" {
		clientError(response, http.StatusServiceUnavailable, "Suggestions temporarily unavailable")
		return
	}
	normalized := normalizeSuggestion(query)
	search := map[string]any{
		"size":    6,
		"_source": []string{"name", "address", "category", "importance", "location"},
		"query": map[string]any{
			"function_score": map[string]any{
				"query": map[string]any{
					"bool": map[string]any{
						"minimum_should_match": 1,
						"should": []any{
							map[string]any{"match": map[string]any{"aliases": map[string]any{"query": normalized, "operator": "and", "boost": 16}}},
							map[string]any{"match": map[string]any{"name_normalized": map[string]any{"query": normalized, "operator": "and", "boost": 12}}},
							map[string]any{"match_phrase_prefix": map[string]any{"name_normalized": map[string]any{"query": normalized, "boost": 8}}},
							map[string]any{"match": map[string]any{"name_normalized": map[string]any{"query": normalized, "fuzziness": "AUTO", "prefix_length": 1, "boost": 2}}},
						},
					},
				},
				"field_value_factor": map[string]any{"field": "rank", "modifier": "sqrt", "missing": 1},
			},
		},
		"sort": []any{"_score", map[string]any{"importance": map[string]string{"order": "desc"}}},
	}
	upstream, err := elasticRequest(request.Context(), server.workerClient, http.MethodPost, server.config.ElasticsearchURL+"/"+suggestionIndex+"/_search", search)
	if err != nil {
		clientError(response, http.StatusBadGateway, "Suggestions temporarily unavailable")
		return
	}
	if upstream.StatusCode != http.StatusOK {
		_ = elasticStatusError(upstream)
		clientError(response, http.StatusBadGateway, "Suggestions temporarily unavailable")
		return
	}
	defer upstream.Body.Close()
	var payload struct {
		Hits struct {
			Hits []struct {
				ID     string             `json:"_id"`
				Source suggestionDocument `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.NewDecoder(io.LimitReader(upstream.Body, 1024*1024)).Decode(&payload); err != nil {
		clientError(response, http.StatusBadGateway, "Suggestions temporarily unavailable")
		return
	}
	results := make([]map[string]any, 0, len(payload.Hits.Hits))
	for _, hit := range payload.Hits.Hits {
		if len(hit.Source.Location) != 2 {
			continue
		}
		results = append(results, map[string]any{
			"id": "es-" + hit.ID, "type": "Feature", "place_name": suggestionPlaceName(hit.Source.Name, hit.Source.Address), "text": hit.Source.Name, "context": hit.Source.Address,
			"center": hit.Source.Location, "geometry": map[string]any{"type": "Point", "coordinates": hit.Source.Location},
		})
	}
	writeJSON(response, http.StatusOK, results)
}

func runSuggestionIndexer(ctx context.Context, config Config) error {
	if config.ElasticsearchURL == "" {
		return fmt.Errorf("ELASTICSEARCH_URL is required")
	}
	user, password := strings.TrimSpace(os.Getenv("NOMINATIM_DB_USER")), os.Getenv("NOMINATIM_DB_PASSWORD")
	if user == "" || password == "" {
		return fmt.Errorf("NOMINATIM_DB_USER and NOMINATIM_DB_PASSWORD are required")
	}
	dsn := (&url.URL{Scheme: "postgres", User: url.UserPassword(user, password), Host: "nominatim-db:5432", Path: "nominatim", RawQuery: "sslmode=disable"}).String()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return err
	}
	defer pool.Close()
	client := &http.Client{Timeout: 60 * time.Second}
	if err := waitForElasticsearch(ctx, client, config.ElasticsearchURL); err != nil {
		return err
	}
	if existing, err := elasticRequest(ctx, client, http.MethodDelete, config.ElasticsearchURL+"/"+suggestionIndex, nil); err != nil {
		return err
	} else if existing.StatusCode != http.StatusNotFound && existing.StatusCode >= 300 {
		return elasticStatusError(existing)
	} else {
		existing.Body.Close()
	}
	mapping := map[string]any{
		"settings": map[string]any{"analysis": map[string]any{"analyzer": map[string]any{"folded": map[string]any{"tokenizer": "standard", "filter": []string{"lowercase", "asciifolding"}}}}},
		"mappings": map[string]any{"dynamic": "strict", "properties": map[string]any{
			"name": map[string]any{"type": "text", "analyzer": "folded"}, "name_normalized": map[string]any{"type": "text", "analyzer": "folded"},
			"aliases": map[string]any{"type": "text", "analyzer": "folded"}, "category": map[string]any{"type": "keyword"},
			"importance": map[string]any{"type": "float"}, "rank": map[string]any{"type": "float"},
			"address": map[string]any{"type": "keyword", "index": false, "doc_values": false}, "location": map[string]any{"type": "geo_point"},
		}},
	}
	created, err := elasticRequest(ctx, client, http.MethodPut, config.ElasticsearchURL+"/"+suggestionIndex, mapping)
	if err != nil {
		return err
	}
	if created.StatusCode >= 300 {
		return elasticStatusError(created)
	}
	created.Body.Close()
	rows, err := pool.Query(ctx, `SELECT p.place_id, p.name -> 'name', p.class, p.type, p.importance, ST_X(p.centroid), ST_Y(p.centroid),
		COALESCE(address_context.address, NULLIF(CONCAT_WS(', ',
			NULLIF(CONCAT_WS(' ', p.address -> 'housenumber', p.address -> 'street'), ''),
			p.address -> 'ward', p.address -> 'subdistrict', p.address -> 'commune', p.address -> 'district', p.address -> 'city', p.address -> 'town', p.address -> 'province'
		), ''), '')
		FROM placex p
		LEFT JOIN LATERAL (
			SELECT string_agg(location.name, ', ' ORDER BY location.rank_address DESC) AS address
			FROM (
				SELECT DISTINCT ON (parent.rank_address) parent.name -> 'name' AS name, parent.rank_address
				FROM place_addressline line
				JOIN placex parent ON parent.place_id = line.address_place_id
				WHERE line.place_id = p.place_id
					AND parent.place_id <> p.place_id
					AND parent.name ? 'name'
					AND parent.rank_address BETWEEN 8 AND 25
				ORDER BY parent.rank_address DESC, line.fromarea DESC, line.distance ASC, parent.rank_search DESC
			) AS location
		) AS address_context ON TRUE
		WHERE p.name ? 'name' AND p.centroid IS NOT NULL`)
	if err != nil {
		return err
	}
	defer rows.Close()
	bulk := &bytes.Buffer{}
	indexed := 0
	flush := func() error {
		if bulk.Len() == 0 {
			return nil
		}
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, config.ElasticsearchURL+"/_bulk", bytes.NewReader(bulk.Bytes()))
		if err != nil {
			return err
		}
		request.Header.Set("Content-Type", "application/x-ndjson")
		response, err := client.Do(request)
		if err != nil {
			return err
		}
		if response.StatusCode >= 300 {
			return elasticStatusError(response)
		}
		var result struct {
			Errors bool `json:"errors"`
		}
		err = json.NewDecoder(io.LimitReader(response.Body, 1024*1024)).Decode(&result)
		response.Body.Close()
		if err != nil {
			return err
		}
		if result.Errors {
			return fmt.Errorf("elasticsearch bulk indexing reported errors")
		}
		bulk.Reset()
		return nil
	}
	for rows.Next() {
		var document suggestionDocument
		var class, kind string
		var longitude, latitude float64
		if err := rows.Scan(&document.ID, &document.Name, &class, &kind, &document.Importance, &longitude, &latitude, &document.Address); err != nil {
			return err
		}
		document.Name = strings.TrimSpace(document.Name)
		if document.Name == "" {
			continue
		}
		document.Normalized, document.Aliases = normalizeSuggestion(document.Name), suggestionAliases(document.Name)
		document.Category, document.Location = class+":"+kind, []float64{longitude, latitude}
		document.Rank = suggestionRank(document.Category, document.Importance)
		metadata, _ := json.Marshal(map[string]any{"index": map[string]any{"_index": suggestionIndex, "_id": document.ID}})
		body, _ := json.Marshal(document)
		bulk.Write(metadata)
		bulk.WriteByte('\n')
		bulk.Write(body)
		bulk.WriteByte('\n')
		indexed++
		if indexed%500 == 0 {
			if err := flush(); err != nil {
				return err
			}
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if err := flush(); err != nil {
		return err
	}
	_, _ = elasticRequest(ctx, client, http.MethodPost, config.ElasticsearchURL+"/"+suggestionIndex+"/_refresh", nil)
	return nil
}
