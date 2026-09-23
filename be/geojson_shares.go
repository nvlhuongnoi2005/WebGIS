package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

const maxSharedGeoJSONBytes = 2 << 20

type createGeoJSONShareInput struct {
	GeoJSON json.RawMessage `json:"geojson"`
}

type geoJSONShareRecipientsInput struct {
	RecipientIDs []string `json:"recipient_ids"`
}

func (server *Server) searchGeoJSONShareRecipients(response http.ResponseWriter, request *http.Request) {
	claims, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	query := strings.TrimSpace(request.URL.Query().Get("q"))
	if len([]rune(query)) < 2 {
		writeJSON(response, http.StatusOK, map[string]any{"users": []any{}})
		return
	}
	rows, err := server.repository.pool.Query(request.Context(), `
		SELECT id::text, COALESCE(NULLIF(full_name, ''), email), email
		FROM users WHERE status='ACTIVE' AND id<>$1
		AND (full_name ILIKE '%' || $2 || '%' OR email ILIKE '%' || $2 || '%')
		ORDER BY full_name NULLS LAST, email LIMIT 20`, claims.Subject, query)
	if err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to search users")
		return
	}
	defer rows.Close()
	type recipient struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	users := make([]recipient, 0)
	for rows.Next() {
		var user recipient
		if err := rows.Scan(&user.ID, &user.Name, &user.Email); err != nil {
			clientError(response, http.StatusInternalServerError, "Unable to search users")
			return
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to search users")
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"users": users})
}

func (server *Server) sendGeoJSONShare(response http.ResponseWriter, request *http.Request, id string) {
	claims, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	if !validShareID(id) {
		clientError(response, http.StatusBadRequest, "Invalid share id")
		return
	}
	request.Body = http.MaxBytesReader(response, request.Body, 16<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var input geoJSONShareRecipientsInput
	if err := decoder.Decode(&input); err != nil || len(input.RecipientIDs) == 0 || len(input.RecipientIDs) > 50 {
		clientError(response, http.StatusBadRequest, "Select between 1 and 50 recipients")
		return
	}
	unique := make(map[string]struct{}, len(input.RecipientIDs))
	ids := make([]string, 0, len(input.RecipientIDs))
	for _, recipientID := range input.RecipientIDs {
		if !validShareID(recipientID) {
			clientError(response, http.StatusBadRequest, "Invalid recipient")
			return
		}
		if _, exists := unique[recipientID]; !exists {
			unique[recipientID] = struct{}{}
			ids = append(ids, recipientID)
		}
	}
	sort.Strings(ids)
	tx, err := server.repository.pool.Begin(request.Context())
	if err != nil {
		slog.Error("unable to start GeoJSON share transaction", "error", err)
		clientError(response, http.StatusInternalServerError, "Unable to send share")
		return
	}
	defer func() { _ = tx.Rollback(request.Context()) }()
	var ownerID string
	err = tx.QueryRow(request.Context(), `SELECT owner_id::text FROM geojson_shares WHERE id=$1 AND expires_at>now() FOR UPDATE`, id).Scan(&ownerID)
	if err != nil || ownerID != claims.Subject {
		clientError(response, http.StatusNotFound, "Share not found")
		return
	}
	var eligibleCount int
	err = tx.QueryRow(request.Context(), `SELECT count(*) FROM users WHERE id::text=ANY($1::text[]) AND status='ACTIVE' AND id<>$2`, ids, claims.Subject).Scan(&eligibleCount)
	if err != nil || eligibleCount != len(ids) {
		clientError(response, http.StatusBadRequest, "One or more recipients are unavailable")
		return
	}
	_, err = tx.Exec(request.Context(), `INSERT INTO geojson_share_recipients (share_id, recipient_id) SELECT $1, recipient_id::uuid FROM unnest($2::text[]) AS ids(recipient_id) ON CONFLICT (share_id,recipient_id) DO NOTHING`, id, ids)
	if err != nil {
		slog.Error("unable to insert GeoJSON share recipients", "error", err)
		clientError(response, http.StatusInternalServerError, "Unable to send share")
		return
	}
	if err := tx.Commit(request.Context()); err != nil {
		slog.Error("unable to commit GeoJSON share recipients", "error", err)
		clientError(response, http.StatusInternalServerError, "Unable to send share")
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (server *Server) listReceivedGeoJSONShares(response http.ResponseWriter, request *http.Request) {
	claims, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	rows, err := server.repository.pool.Query(request.Context(), `
		SELECT s.id::text, s.created_at::text, s.expires_at::text,
		COALESCE(NULLIF(u.full_name,''),u.email), u.email
		FROM geojson_share_recipients r
		JOIN geojson_shares s ON s.id=r.share_id AND s.expires_at>now()
		JOIN users u ON u.id=s.owner_id
		WHERE r.recipient_id=$1 ORDER BY r.sent_at DESC`, claims.Subject)
	if err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to list received shares")
		return
	}
	defer rows.Close()
	type receivedShare struct {
		ID         string `json:"id"`
		CreatedAt  string `json:"created_at"`
		ExpiresAt  string `json:"expires_at"`
		OwnerName  string `json:"owner_name"`
		OwnerEmail string `json:"owner_email"`
	}
	shares := make([]receivedShare, 0)
	for rows.Next() {
		var share receivedShare
		if err := rows.Scan(&share.ID, &share.CreatedAt, &share.ExpiresAt, &share.OwnerName, &share.OwnerEmail); err != nil {
			clientError(response, http.StatusInternalServerError, "Unable to list received shares")
			return
		}
		shares = append(shares, share)
	}
	if err := rows.Err(); err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to list received shares")
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"shares": shares})
}

func (server *Server) getReceivedGeoJSONShare(response http.ResponseWriter, request *http.Request, id string) {
	claims, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	if !validShareID(id) {
		clientError(response, http.StatusNotFound, "Share not found or expired")
		return
	}
	var geoJSON []byte
	var expiresAt string
	err := server.repository.pool.QueryRow(request.Context(), `
		SELECT s.geojson, s.expires_at::text FROM geojson_shares s
		JOIN geojson_share_recipients r ON r.share_id=s.id
		WHERE s.id=$1 AND r.recipient_id=$2 AND s.expires_at>now()`, id, claims.Subject).Scan(&geoJSON, &expiresAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			clientError(response, http.StatusNotFound, "Share not found or expired")
		} else {
			clientError(response, http.StatusInternalServerError, "Unable to load share")
		}
		return
	}
	response.Header().Set("Cache-Control", "no-store")
	writeJSON(response, http.StatusOK, map[string]any{"geojson": json.RawMessage(geoJSON), "expires_at": expiresAt})
}

func validShareID(id string) bool {
	compactID := strings.ReplaceAll(id, "-", "")
	if len(id) != 36 || len(compactID) != 32 || id[8] != '-' || id[13] != '-' || id[18] != '-' || id[23] != '-' {
		return false
	}
	_, err := hex.DecodeString(compactID)
	return err == nil
}

func (server *Server) createGeoJSONShare(response http.ResponseWriter, request *http.Request) {
	claims, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	_, _ = server.repository.pool.Exec(request.Context(), `DELETE FROM geojson_shares WHERE expires_at <= now()`)
	var activeShareCount int
	if err := server.repository.pool.QueryRow(request.Context(), `SELECT count(*) FROM geojson_shares WHERE owner_id=$1 AND expires_at > now()`, claims.Subject).Scan(&activeShareCount); err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to create share")
		return
	}
	if activeShareCount >= 50 {
		clientError(response, http.StatusTooManyRequests, "Too many active shares")
		return
	}

	request.Body = http.MaxBytesReader(response, request.Body, maxSharedGeoJSONBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var input createGeoJSONShareInput
	if err := decoder.Decode(&input); err != nil {
		clientError(response, http.StatusBadRequest, "Invalid GeoJSON share")
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		clientError(response, http.StatusBadRequest, "Invalid GeoJSON share")
		return
	}
	if !validSharedGeoJSON(input.GeoJSON) {
		clientError(response, http.StatusBadRequest, "Invalid GeoJSON share")
		return
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to create share")
		return
	}
	token := hex.EncodeToString(tokenBytes)
	tokenHash := sha256.Sum256([]byte(token))
	var id string
	var expiresAt string
	err := server.repository.pool.QueryRow(request.Context(), `
		INSERT INTO geojson_shares (owner_id, token_hash, geojson, expires_at)
		VALUES ($1, $2, $3::jsonb, now() + interval '30 days')
		RETURNING id::text, expires_at::text`, claims.Subject, hex.EncodeToString(tokenHash[:]), string(input.GeoJSON)).Scan(&id, &expiresAt)
	if err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to create share")
		return
	}
	writeJSON(response, http.StatusCreated, map[string]string{
		"id":         id,
		"token":      token,
		"expires_at": expiresAt,
	})
}

func validSharedGeoJSON(raw json.RawMessage) bool {
	if len(raw) == 0 || !json.Valid(raw) {
		return false
	}
	var collection struct {
		Type     string            `json:"type"`
		Features []json.RawMessage `json:"features"`
	}
	if err := json.Unmarshal(raw, &collection); err != nil || collection.Type != "FeatureCollection" || len(collection.Features) == 0 || len(collection.Features) > 5000 {
		return false
	}
	for _, rawFeature := range collection.Features {
		var feature struct {
			Type     string          `json:"type"`
			Geometry json.RawMessage `json:"geometry"`
		}
		if err := json.Unmarshal(rawFeature, &feature); err != nil || feature.Type != "Feature" || len(feature.Geometry) == 0 || !json.Valid(feature.Geometry) {
			return false
		}
		var geometry struct {
			Type        string          `json:"type"`
			Coordinates json.RawMessage `json:"coordinates"`
			Geometries  json.RawMessage `json:"geometries"`
		}
		if err := json.Unmarshal(feature.Geometry, &geometry); err != nil {
			return false
		}
		switch geometry.Type {
		case "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon":
			if len(geometry.Coordinates) == 0 || !json.Valid(geometry.Coordinates) || geometry.Coordinates[0] != '[' {
				return false
			}
		case "GeometryCollection":
			if len(geometry.Geometries) == 0 || !json.Valid(geometry.Geometries) || geometry.Geometries[0] != '[' {
				return false
			}
		default:
			return false
		}
	}
	return true
}

func (server *Server) listGeoJSONShares(response http.ResponseWriter, request *http.Request) {
	claims, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	rows, err := server.repository.pool.Query(request.Context(), `
		SELECT id::text, created_at::text, expires_at::text
		FROM geojson_shares WHERE owner_id=$1 AND expires_at > now() ORDER BY created_at DESC`, claims.Subject)
	if err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to list shares")
		return
	}
	defer rows.Close()
	type share struct {
		ID        string `json:"id"`
		CreatedAt string `json:"created_at"`
		ExpiresAt string `json:"expires_at"`
	}
	shares := make([]share, 0)
	for rows.Next() {
		var item share
		if err := rows.Scan(&item.ID, &item.CreatedAt, &item.ExpiresAt); err != nil {
			clientError(response, http.StatusInternalServerError, "Unable to list shares")
			return
		}
		shares = append(shares, item)
	}
	if err := rows.Err(); err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to list shares")
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"shares": shares})
}

func (server *Server) revokeGeoJSONShare(response http.ResponseWriter, request *http.Request, id string) {
	claims, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	compactID := strings.ReplaceAll(id, "-", "")
	if len(id) != 36 || len(compactID) != 32 || id[8] != '-' || id[13] != '-' || id[18] != '-' || id[23] != '-' {
		clientError(response, http.StatusBadRequest, "Invalid share id")
		return
	}
	if _, err := hex.DecodeString(compactID); err != nil {
		clientError(response, http.StatusBadRequest, "Invalid share id")
		return
	}
	result, err := server.repository.pool.Exec(request.Context(), `DELETE FROM geojson_shares WHERE id=$1 AND owner_id=$2`, id, claims.Subject)
	if err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to revoke share")
		return
	}
	if result.RowsAffected() == 0 {
		clientError(response, http.StatusNotFound, "Share not found")
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (server *Server) getGeoJSONShare(response http.ResponseWriter, request *http.Request, token string) {
	if len(token) != 64 {
		clientError(response, http.StatusNotFound, "Share not found or expired")
		return
	}
	tokenHash := sha256.Sum256([]byte(token))
	var geoJSON []byte
	var expiresAt string
	err := server.repository.pool.QueryRow(request.Context(), `
		SELECT geojson, expires_at::text
		FROM geojson_shares
		WHERE token_hash=$1 AND expires_at > now()`, hex.EncodeToString(tokenHash[:])).Scan(&geoJSON, &expiresAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			clientError(response, http.StatusNotFound, "Share not found or expired")
		} else {
			clientError(response, http.StatusInternalServerError, "Unable to load share")
		}
		return
	}
	response.Header().Set("Cache-Control", "no-store")
	writeJSON(response, http.StatusOK, map[string]any{
		"geojson":    json.RawMessage(geoJSON),
		"expires_at": expiresAt,
	})
}
