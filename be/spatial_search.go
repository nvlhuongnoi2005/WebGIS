package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const spatialSearchIntent = "poi_within_distance_of_place"

var spatialSearchCategories = map[string]struct{}{
	"restaurant": {},
	"cafe":       {},
	"hospital":   {},
	"pharmacy":   {},
	"school":     {},
	"atm":        {},
	"bank":       {},
	"tourism":    {},
}

type spatialSearchInput struct {
	Intent         string `json:"intent"`
	Category       string `json:"category"`
	ReferencePlace string `json:"referencePlace"`
	DistanceMeters int    `json:"distanceMeters"`
	Limit          int    `json:"limit"`
}

type spatialReference struct {
	Name       string          `json:"name"`
	Category   string          `json:"category"`
	Kind       string          `json:"type"`
	Importance float64         `json:"importance"`
	Geometry   json.RawMessage `json:"geojson"`
}

func (input *spatialSearchInput) validate() error {
	input.Intent = strings.TrimSpace(input.Intent)
	input.Category = strings.ToLower(strings.TrimSpace(input.Category))
	input.ReferencePlace = strings.TrimSpace(input.ReferencePlace)
	if input.Intent != spatialSearchIntent {
		return fmt.Errorf("unsupported intent")
	}
	if _, ok := spatialSearchCategories[input.Category]; !ok {
		return fmt.Errorf("unsupported POI category")
	}
	if length := len([]rune(input.ReferencePlace)); length < 2 || length > 120 {
		return fmt.Errorf("referencePlace must contain 2 to 120 characters")
	}
	if input.DistanceMeters < 1 || input.DistanceMeters > 20_000 {
		return fmt.Errorf("distanceMeters must be between 1 and 20000")
	}
	if input.Limit == 0 {
		input.Limit = 50
	}
	if input.Limit < 1 || input.Limit > 100 {
		return fmt.Errorf("limit must be between 1 and 100")
	}
	return nil
}

func (server *Server) resolveSpatialReference(request *http.Request, place string) (spatialReference, error) {
	query := url.Values{
		"q":               []string{place},
		"format":          []string{"jsonv2"},
		"polygon_geojson": []string{"1"},
		"addressdetails":  []string{"0"},
		"limit":           []string{"10"},
		"accept-language": []string{"vi,en"},
	}
	upstream, err := http.NewRequestWithContext(request.Context(), http.MethodGet, server.config.NominatimURL+"/search?"+query.Encode(), nil)
	if err != nil {
		return spatialReference{}, err
	}
	response, err := server.workerClient.Do(upstream)
	if err != nil {
		return spatialReference{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return spatialReference{}, fmt.Errorf("Nominatim returned %s", response.Status)
	}

	var candidates []spatialReference
	if err := json.NewDecoder(io.LimitReader(response.Body, 1024*1024)).Decode(&candidates); err != nil {
		return spatialReference{}, err
	}

	wantedName := normalizeSuggestion(place)
	bestIndex, bestScore := -1, -1.0
	for index, candidate := range candidates {
		if !json.Valid(candidate.Geometry) || string(candidate.Geometry) == "null" {
			continue
		}
		score := candidate.Importance
		if normalizeSuggestion(candidate.Name) == wantedName {
			score += 100
		}
		if candidate.Category == "water" && (candidate.Kind == "lake" || candidate.Kind == "reservoir") {
			score += 200
		}
		if score > bestScore {
			bestIndex, bestScore = index, score
		}
	}
	if bestIndex == -1 {
		return spatialReference{}, nil
	}
	return candidates[bestIndex], nil
}

func (server *Server) spatialSearch(response http.ResponseWriter, request *http.Request) {
	claims, ok := server.authenticate(response, request, "map:read")
	if !ok {
		return
	}
	var input spatialSearchInput
	if err := decodeJSON(request, &input); err != nil || input.validate() != nil {
		clientError(response, http.StatusBadRequest, "Invalid spatial search request")
		return
	}
	if err := server.consumeQuota(request.Context(), claims.Subject, "search"); err != nil {
		if err.Error() == "quota exceeded" {
			clientError(response, http.StatusTooManyRequests, "Quota exceeded")
		} else {
			clientError(response, http.StatusInternalServerError, "Internal server error")
		}
		return
	}

	reference, err := server.resolveSpatialReference(request, input.ReferencePlace)
	if err != nil {
		clientError(response, http.StatusBadGateway, "Place resolution temporarily unavailable")
		return
	}
	if len(reference.Geometry) == 0 {
		clientError(response, http.StatusNotFound, "Reference place not found")
		return
	}

	rows, err := server.repository.pool.Query(request.Context(), `
		WITH reference AS (
			SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geometry
		)
		SELECT source_place_id, name, category, kind, COALESCE(address, ''),
			ST_X(location), ST_Y(location),
			ST_Distance(location::geography, reference.geometry::geography)
		FROM search_pois
		CROSS JOIN reference
		WHERE category = $2
			AND ST_DWithin(location::geography, reference.geometry::geography, $3)
		ORDER BY ST_Distance(location::geography, reference.geometry::geography), source_place_id
		LIMIT $4`, string(reference.Geometry), input.Category, input.DistanceMeters, input.Limit)
	if err != nil {
		clientError(response, http.StatusInternalServerError, "Spatial search unavailable")
		return
	}
	defer rows.Close()

	features := make([]map[string]any, 0)
	for rows.Next() {
		var placeID int64
		var name, category, kind, address string
		var longitude, latitude, distanceMeters float64
		if err := rows.Scan(&placeID, &name, &category, &kind, &address, &longitude, &latitude, &distanceMeters); err != nil {
			clientError(response, http.StatusInternalServerError, "Spatial search unavailable")
			return
		}
		features = append(features, map[string]any{
			"type": "Feature",
			"id":   placeID,
			"geometry": map[string]any{
				"type":        "Point",
				"coordinates": []float64{longitude, latitude},
			},
			"properties": map[string]any{
				"name":           name,
				"category":       category,
				"kind":           kind,
				"address":        address,
				"distanceMeters": distanceMeters,
			},
		})
	}
	if err := rows.Err(); err != nil {
		clientError(response, http.StatusInternalServerError, "Spatial search unavailable")
		return
	}

	writeJSON(response, http.StatusOK, map[string]any{
		"type":     "FeatureCollection",
		"features": features,
		"reference": map[string]any{
			"name":     reference.Name,
			"category": reference.Category,
			"kind":     reference.Kind,
		},
	})
}
