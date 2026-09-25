package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const maxSharedGeoJSONBytes = 2 << 20

type createGeoJSONShareInput struct {
	GeoJSON  json.RawMessage `json:"geojson"`
	MapState sharedMapState  `json:"map_state"`
}

type sharedMapState struct {
	BaseMapID  string   `json:"basemap_id,omitempty"`
	OverlayIDs []string `json:"overlay_ids,omitempty"`
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
	var ownerID, ownerName string
	err = tx.QueryRow(request.Context(), `
		SELECT s.owner_id::text, COALESCE(NULLIF(u.full_name,''),u.email)
		FROM geojson_shares s JOIN users u ON u.id=s.owner_id
		WHERE s.id=$1 AND s.expires_at>now() FOR UPDATE`, id).Scan(&ownerID, &ownerName)
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
	rows, err := tx.Query(request.Context(), `
		INSERT INTO geojson_share_recipients (share_id, recipient_id)
		SELECT $1, recipient_id::uuid FROM unnest($2::text[]) AS ids(recipient_id)
		ON CONFLICT (share_id,recipient_id) DO NOTHING
		RETURNING recipient_id::text`, id, ids)
	if err != nil {
		slog.Error("unable to insert GeoJSON share recipients", "error", err)
		clientError(response, http.StatusInternalServerError, "Unable to send share")
		return
	}
	newRecipientIDs := make([]string, 0, len(ids))
	for rows.Next() {
		var recipientID string
		if err := rows.Scan(&recipientID); err != nil {
			rows.Close()
			clientError(response, http.StatusInternalServerError, "Unable to send share")
			return
		}
		newRecipientIDs = append(newRecipientIDs, recipientID)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		clientError(response, http.StatusInternalServerError, "Unable to send share")
		return
	}
	rows.Close()
	events := make([]RevocationEvent, 0, len(newRecipientIDs))
	for _, recipientID := range newRecipientIDs {
		event := RevocationEvent{Type: "ShareReceived", UserID: recipientID, ShareID: id, OwnerName: ownerName, Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}
		if err := server.repository.Publish(request.Context(), tx, event); err != nil {
			slog.Error("unable to publish GeoJSON share notification", "error", err)
			clientError(response, http.StatusInternalServerError, "Unable to send share")
			return
		}
		events = append(events, event)
	}
	if err := tx.Commit(request.Context()); err != nil {
		slog.Error("unable to commit GeoJSON share recipients", "error", err)
		clientError(response, http.StatusInternalServerError, "Unable to send share")
		return
	}
	for _, event := range events {
		server.revocations.Apply(event)
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
	var mapState []byte
	var expiresAt string
	err := server.repository.pool.QueryRow(request.Context(), `
		SELECT s.geojson, s.map_state, s.expires_at::text FROM geojson_shares s
		JOIN geojson_share_recipients r ON r.share_id=s.id
		WHERE s.id=$1 AND r.recipient_id=$2 AND s.expires_at>now()`, id, claims.Subject).Scan(&geoJSON, &mapState, &expiresAt)
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
		"map_state":  json.RawMessage(mapState),
		"expires_at": expiresAt,
	})
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
	if !validSharedMapState(input.MapState) {
		clientError(response, http.StatusBadRequest, "Invalid shared map state")
		return
	}
	mapState, err := json.Marshal(input.MapState)
	if err != nil {
		clientError(response, http.StatusBadRequest, "Invalid shared map state")
		return
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to create share")
		return
	}
	token := hex.EncodeToString(tokenBytes)
	previewSVG := createGeoJSONPreviewSVG(input.GeoJSON)
	var id string
	var expiresAt string
	err = server.repository.pool.QueryRow(request.Context(), `
		INSERT INTO geojson_shares (owner_id, token, geojson, map_state, preview_svg, expires_at)
		VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, now() + interval '30 days')
		RETURNING id::text, expires_at::text`, claims.Subject, token, string(input.GeoJSON), string(mapState), previewSVG).Scan(&id, &expiresAt)
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

func validSharedMapState(state sharedMapState) bool {
	if state.BaseMapID != "" && !validSharedDatasetID(state.BaseMapID) {
		return false
	}
	if len(state.OverlayIDs) > 32 {
		return false
	}
	seen := make(map[string]struct{}, len(state.OverlayIDs))
	for _, id := range state.OverlayIDs {
		if !validSharedDatasetID(id) {
			return false
		}
		if _, exists := seen[id]; exists {
			return false
		}
		seen[id] = struct{}{}
	}
	return true
}

func validSharedDatasetID(id string) bool {
	if len(id) == 0 || len(id) > 128 {
		return false
	}
	for _, character := range id {
		if (character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			character == '.' || character == '_' || character == '-' {
			continue
		}
		return false
	}
	return true
}

func (server *Server) listGeoJSONShares(response http.ResponseWriter, request *http.Request) {
	claims, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	rows, err := server.repository.pool.Query(request.Context(), `
		SELECT id::text, created_at::text, expires_at::text, COALESCE(token,''),
		jsonb_array_length(geojson->'features'), preview_svg,
		CASE WHEN preview_svg='' THEN geojson ELSE NULL END
		FROM geojson_shares WHERE owner_id=$1 AND expires_at > now() ORDER BY created_at DESC`, claims.Subject)
	if err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to list shares")
		return
	}
	defer rows.Close()
	type share struct {
		ID           string `json:"id"`
		CreatedAt    string `json:"created_at"`
		ExpiresAt    string `json:"expires_at"`
		Token        string `json:"token,omitempty"`
		FeatureCount int    `json:"feature_count"`
		PreviewSVG   string `json:"preview_svg"`
	}
	shares := make([]share, 0)
	for rows.Next() {
		var item share
		var geoJSON []byte
		if err := rows.Scan(&item.ID, &item.CreatedAt, &item.ExpiresAt, &item.Token, &item.FeatureCount, &item.PreviewSVG, &geoJSON); err != nil {
			clientError(response, http.StatusInternalServerError, "Unable to list shares")
			return
		}
		if item.PreviewSVG == "" && len(geoJSON) > 0 {
			item.PreviewSVG = createGeoJSONPreviewSVG(geoJSON)
			_, _ = server.repository.pool.Exec(request.Context(), `UPDATE geojson_shares SET preview_svg=$1 WHERE id=$2 AND preview_svg=''`, item.PreviewSVG, item.ID)
		}
		shares = append(shares, item)
	}
	if err := rows.Err(); err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to list shares")
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"shares": shares})
}

type previewGeometry struct {
	Type        string            `json:"type"`
	Coordinates json.RawMessage   `json:"coordinates"`
	Geometries  []previewGeometry `json:"geometries"`
}

type previewPosition struct {
	lon float64
	lat float64
}

const sharePreviewWidth = 160
const sharePreviewHeight = 96

func createGeoJSONPreviewSVG(raw json.RawMessage) string {
	var collection struct {
		Features []struct {
			Geometry previewGeometry `json:"geometry"`
		} `json:"features"`
	}
	if json.Unmarshal(raw, &collection) != nil {
		return ""
	}
	allPositions := make([]previewPosition, 0)
	for _, feature := range collection.Features {
		allPositions = appendGeometryPreviewPositions(allPositions, feature.Geometry)
	}
	if len(allPositions) == 0 {
		return ""
	}
	minLon, maxLon := allPositions[0].lon, allPositions[0].lon
	minLat, maxLat := allPositions[0].lat, allPositions[0].lat
	for _, position := range allPositions[1:] {
		minLon = math.Min(minLon, position.lon)
		maxLon = math.Max(maxLon, position.lon)
		minLat = math.Min(minLat, position.lat)
		maxLat = math.Max(maxLat, position.lat)
	}
	width, height, padding := float64(sharePreviewWidth), float64(sharePreviewHeight), 10.0
	lonRange, latRange := maxLon-minLon, maxLat-minLat
	if lonRange == 0 {
		lonRange = 0.0001
	}
	if latRange == 0 {
		latRange = 0.0001
	}
	scale := math.Min((width-2*padding)/lonRange, (height-2*padding)/latRange)
	project := func(position previewPosition) (float64, float64) {
		x := (width-(maxLon-minLon)*scale)/2 + (position.lon-minLon)*scale
		y := (height-(maxLat-minLat)*scale)/2 + (maxLat-position.lat)*scale
		return x, y
	}

	var svg strings.Builder
	fmt.Fprintf(&svg, `<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d"><rect width="100%%" height="100%%" rx="10" fill="#eef6f8"/><path d="M0 32H160 M0 64H160 M40 0V96 M80 0V96 M120 0V96" stroke="#dbe8ec" stroke-width="1"/>`, sharePreviewWidth, sharePreviewHeight, sharePreviewWidth, sharePreviewHeight)
	for _, feature := range collection.Features {
		renderGeometryPreview(&svg, feature.Geometry, project)
	}
	svg.WriteString(`</svg>`)
	return svg.String()
}

func appendGeometryPreviewPositions(positions []previewPosition, geometry previewGeometry) []previewPosition {
	if geometry.Type == "GeometryCollection" {
		for _, child := range geometry.Geometries {
			positions = appendGeometryPreviewPositions(positions, child)
		}
		return positions
	}
	return append(positions, coordinatePreviewPositions(geometry.Coordinates)...)
}

func coordinatePreviewPositions(raw json.RawMessage) []previewPosition {
	var coordinates any
	if json.Unmarshal(raw, &coordinates) != nil {
		return nil
	}
	positions := make([]previewPosition, 0)
	var visit func(any)
	visit = func(value any) {
		items, ok := value.([]any)
		if !ok {
			return
		}
		if len(items) >= 2 {
			lon, lonOK := items[0].(float64)
			lat, latOK := items[1].(float64)
			if lonOK && latOK {
				positions = append(positions, previewPosition{lon: lon, lat: lat})
				return
			}
		}
		for _, item := range items {
			visit(item)
		}
	}
	visit(coordinates)
	return positions
}

func renderGeometryPreview(svg *strings.Builder, geometry previewGeometry, project func(previewPosition) (float64, float64)) {
	if geometry.Type == "GeometryCollection" {
		for _, child := range geometry.Geometries {
			renderGeometryPreview(svg, child, project)
		}
		return
	}
	lines := coordinatePreviewLines(geometry.Coordinates)
	switch geometry.Type {
	case "Point", "MultiPoint":
		for _, line := range lines {
			for _, position := range line {
				x, y := project(position)
				fmt.Fprintf(svg, `<circle cx="%.1f" cy="%.1f" r="4" fill="#e0002b" stroke="#ffffff" stroke-width="1.5"/>`, x, y)
			}
		}
	case "LineString", "MultiLineString":
		for _, line := range lines {
			writePreviewPath(svg, line, project, false)
		}
	case "Polygon", "MultiPolygon":
		for _, ring := range lines {
			writePreviewPath(svg, ring, project, true)
		}
	}
}

func coordinatePreviewLines(raw json.RawMessage) [][]previewPosition {
	var coordinates any
	if json.Unmarshal(raw, &coordinates) != nil {
		return nil
	}
	lines := make([][]previewPosition, 0)
	var visit func(any)
	visit = func(value any) {
		items, ok := value.([]any)
		if !ok {
			return
		}
		if len(items) >= 2 {
			if _, ok := items[0].(float64); ok {
				if lat, ok := items[1].(float64); ok {
					lines = append(lines, []previewPosition{{lon: items[0].(float64), lat: lat}})
					return
				}
			}
		}
		line := make([]previewPosition, 0)
		allPositions := len(items) > 0
		for _, item := range items {
			position, ok := item.([]any)
			if !ok || len(position) < 2 {
				allPositions = false
				break
			}
			lon, lonOK := position[0].(float64)
			lat, latOK := position[1].(float64)
			if !lonOK || !latOK {
				allPositions = false
				break
			}
			line = append(line, previewPosition{lon: lon, lat: lat})
		}
		if allPositions {
			lines = append(lines, line)
			return
		}
		for _, item := range items {
			visit(item)
		}
	}
	visit(coordinates)
	return lines
}

func writePreviewPath(svg *strings.Builder, positions []previewPosition, project func(previewPosition) (float64, float64), closePath bool) {
	if len(positions) == 0 {
		return
	}
	for index, position := range positions {
		x, y := project(position)
		if index == 0 {
			fmt.Fprintf(svg, `<path d="M%.1f %.1f`, x, y)
		} else {
			fmt.Fprintf(svg, ` L%.1f %.1f`, x, y)
		}
	}
	if closePath {
		svg.WriteString(` Z" fill="#e0002b" fill-opacity="0.24" fill-rule="evenodd" stroke="#e0002b" stroke-width="2" stroke-linejoin="round"/>`)
	} else {
		svg.WriteString(`" fill="none" stroke="#e0002b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`)
	}
}

func (server *Server) getOrCreateGeoJSONShareLink(response http.ResponseWriter, request *http.Request, id string) {
	claims, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	if !validShareID(id) {
		clientError(response, http.StatusBadRequest, "Invalid share id")
		return
	}
	tx, err := server.repository.pool.Begin(request.Context())
	if err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to show share link")
		return
	}
	defer func() { _ = tx.Rollback(request.Context()) }()
	var token string
	err = tx.QueryRow(request.Context(), `SELECT COALESCE(token,'') FROM geojson_shares WHERE id=$1 AND owner_id=$2 AND expires_at>now() FOR UPDATE`, id, claims.Subject).Scan(&token)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			clientError(response, http.StatusNotFound, "Share not found or expired")
		} else {
			clientError(response, http.StatusInternalServerError, "Unable to show share link")
		}
		return
	}
	if token == "" {
		tokenBytes := make([]byte, 32)
		if _, err := rand.Read(tokenBytes); err != nil {
			clientError(response, http.StatusInternalServerError, "Unable to show share link")
			return
		}
		token = hex.EncodeToString(tokenBytes)
		if _, err := tx.Exec(request.Context(), `UPDATE geojson_shares SET token=$1 WHERE id=$2`, token, id); err != nil {
			clientError(response, http.StatusInternalServerError, "Unable to show share link")
			return
		}
	}
	if err := tx.Commit(request.Context()); err != nil {
		clientError(response, http.StatusInternalServerError, "Unable to show share link")
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{"token": token})
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
	var mapState []byte
	var expiresAt string
	err := server.repository.pool.QueryRow(request.Context(), `
		SELECT geojson, map_state, expires_at::text
		FROM geojson_shares
		WHERE (token=$1 OR token_hash=$2) AND expires_at > now()`, token, hex.EncodeToString(tokenHash[:])).Scan(&geoJSON, &mapState, &expiresAt)
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
		"map_state":  json.RawMessage(mapState),
		"expires_at": expiresAt,
	})
}
