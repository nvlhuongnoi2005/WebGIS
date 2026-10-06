package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var gisSlugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}$`)
var gisUUIDPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type datasetInput struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Description string `json:"description"`
}
type tilesetInput struct {
	DatasetID string `json:"datasetId"`
	Slug      string `json:"slug"`
	Name      string `json:"name"`
}
type buildTilesetInput struct {
	DatasetVersionID string         `json:"datasetVersionId"`
	Layer            string         `json:"layer"`
	SourceLayer      string         `json:"sourceLayer"`
	BuildConfig      map[string]any `json:"buildConfig"`
}
type styleInput struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}
type styleVersionInput struct {
	StyleJSON         json.RawMessage `json:"styleJson"`
	TilesetVersionIDs []string        `json:"tilesetVersionIds"`
}
type publicationInput struct {
	Slug           string `json:"slug"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	StyleVersionID string `json:"styleVersionId"`
}
type publicationUpdateInput struct {
	Name           *string `json:"name"`
	Description    *string `json:"description"`
	StyleVersionID *string `json:"styleVersionId"`
}
type aclInput struct {
	SubjectType string `json:"subjectType"`
	SubjectID   string `json:"subjectId"`
	Action      string `json:"action"`
}

func validGISSlug(value string) bool { return gisSlugPattern.MatchString(value) }
func validGISUUID(value string) bool { return gisUUIDPattern.MatchString(strings.ToLower(value)) }
func nextVersion(ctx *http.Request, query string, id string) (int, error) {
	var version int
	err := ctx.Context().Value(gisVersionKey{}).(*Server).repository.pool.QueryRow(ctx.Context(), query, id).Scan(&version)
	return version, err
}

type gisVersionKey struct{}

func (server *Server) requireGISAdmin(response http.ResponseWriter, request *http.Request, permission string) (Claims, bool) {
	claims, ok := server.authenticate(response, request, permission)
	if !ok {
		return Claims{}, false
	}
	if !isAdmin(claims) {
		clientError(response, http.StatusForbidden, "Forbidden")
		return Claims{}, false
	}
	return claims, true
}

func validName(value string) bool { return strings.TrimSpace(value) != "" && len(value) <= 160 }
func gisBadInput(response http.ResponseWriter, message string) {
	clientError(response, http.StatusBadRequest, message)
}

func (server *Server) createDataset(response http.ResponseWriter, request *http.Request) {
	claims, ok := server.requireGISAdmin(response, request, permissionDatasetUpload)
	if !ok {
		return
	}
	var input datasetInput
	if err := decodeJSON(request, &input); err != nil || !validGISSlug(input.Slug) || !validName(input.Name) || len(input.Description) > 4000 {
		gisBadInput(response, "Invalid dataset")
		return
	}
	var id string
	err := server.repository.pool.QueryRow(request.Context(), `INSERT INTO datasets(owner_id,slug,name,description) VALUES($1,$2,$3,$4) RETURNING id`, claims.Subject, input.Slug, strings.TrimSpace(input.Name), strings.TrimSpace(input.Description)).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "unique") {
			clientError(response, http.StatusConflict, "Dataset slug already exists")
		} else {
			clientError(response, 500, "Internal server error")
		}
		return
	}
	server.gisAudit(request, claims.Subject, "dataset.created", "dataset", id, map[string]any{"slug": input.Slug})
	writeJSON(response, http.StatusCreated, map[string]any{"id": id, "slug": input.Slug, "name": strings.TrimSpace(input.Name)})
}

func (server *Server) listDatasets(response http.ResponseWriter, request *http.Request) {
	if _, ok := server.requireGISAdmin(response, request, permissionDatasetRead); !ok {
		return
	}
	rows, err := server.repository.pool.Query(request.Context(), `SELECT d.id,d.slug,d.name,d.description,d.created_at::text,COALESCE(max(v.version),0) FROM datasets d LEFT JOIN dataset_versions v ON v.dataset_id=d.id GROUP BY d.id ORDER BY d.created_at DESC`)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, slug, name, description, created string
		var version int
		if err := rows.Scan(&id, &slug, &name, &description, &created, &version); err != nil {
			clientError(response, 500, "Internal server error")
			return
		}
		items = append(items, map[string]any{"id": id, "slug": slug, "name": name, "description": description, "createdAt": created, "latestVersion": version})
	}
	if rows.Err() != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	writeJSON(response, 200, map[string]any{"datasets": items})
}

func (server *Server) getDataset(response http.ResponseWriter, request *http.Request, id string) {
	if _, ok := server.requireGISAdmin(response, request, permissionDatasetRead); !ok {
		return
	}
	var slug, name, description, created string
	if err := server.repository.pool.QueryRow(request.Context(), `SELECT slug,name,description,created_at::text FROM datasets WHERE id=$1`, id).Scan(&slug, &name, &description, &created); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			clientError(response, 404, "Dataset not found")
		} else {
			clientError(response, 500, "Internal server error")
		}
		return
	}
	writeJSON(response, 200, map[string]any{"id": id, "slug": slug, "name": name, "description": description, "createdAt": created})
}

func detectUploadFormat(filename string) string {
	lower := strings.ToLower(filename)
	switch {
	case strings.HasSuffix(lower, ".geojson") || strings.HasSuffix(lower, ".json"):
		return "geojson"
	case strings.HasSuffix(lower, ".gpkg"):
		return "gpkg"
	case strings.HasSuffix(lower, ".zip"):
		return "shapefile_zip"
	default:
		return ""
	}
}
func (server *Server) uploadDatasetVersion(response http.ResponseWriter, request *http.Request, datasetID string) {
	claims, ok := server.requireGISAdmin(response, request, permissionDatasetUpload)
	if !ok {
		return
	}
	request.Body = http.MaxBytesReader(response, request.Body, int64(server.config.GISUploadMaxBytes)+1024*1024)
	if err := request.ParseMultipartForm(16 << 20); err != nil {
		gisBadInput(response, "Invalid or oversized upload")
		return
	}
	file, header, err := request.FormFile("file")
	if err != nil {
		gisBadInput(response, "A file field is required")
		return
	}
	defer file.Close()
	format := detectUploadFormat(header.Filename)
	if format == "" {
		gisBadInput(response, "Supported formats are GeoJSON, GeoPackage, and Shapefile ZIP")
		return
	}
	if _, err = server.repository.pool.Exec(request.Context(), `SELECT 1 FROM datasets WHERE id=$1`, datasetID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			clientError(response, 404, "Dataset not found")
		} else {
			clientError(response, 500, "Internal server error")
		}
		return
	}
	key := fmt.Sprintf("datasets/%s/%d-%d-%s", datasetID, time.Now().UTC().UnixNano(), time.Now().UTC().Nanosecond(), sanitizeUploadName(header.Filename))
	hash := sha256.New()
	count := &countingReader{reader: file, limit: int64(server.config.GISUploadMaxBytes), writer: hash}
	if err = server.rawStorage.Put(request.Context(), key, count); err != nil {
		clientError(response, 500, "Upload failed")
		return
	}
	if count.n == 0 {
		_ = server.rawStorage.Delete(request.Context(), key)
		gisBadInput(response, "Upload is empty")
		return
	}
	var id string
	var version int
	tx, err := server.repository.pool.Begin(request.Context())
	if err != nil {
		_ = server.rawStorage.Delete(request.Context(), key)
		clientError(response, 500, "Internal server error")
		return
	}
	defer tx.Rollback(request.Context())
	err = tx.QueryRow(request.Context(), `SELECT COALESCE(max(version),0)+1 FROM dataset_versions WHERE dataset_id=$1 FOR UPDATE`, datasetID).Scan(&version)
	if err == nil {
		err = tx.QueryRow(request.Context(), `INSERT INTO dataset_versions(dataset_id,version,created_by,original_filename,storage_key,content_type,file_size,checksum,format,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'uploaded') RETURNING id`, datasetID, version, claims.Subject, sanitizeUploadName(header.Filename), key, header.Header.Get("Content-Type"), count.n, hex.EncodeToString(hash.Sum(nil)), format).Scan(&id)
	}
	if err != nil {
		_ = server.rawStorage.Delete(request.Context(), key)
		clientError(response, 500, "Could not create dataset version")
		return
	}
	if _, err = tx.Exec(request.Context(), `INSERT INTO processing_jobs(job_type,dataset_version_id,status,created_by) VALUES('inspect_dataset',$1,'queued',$2)`, id, claims.Subject); err != nil {
		_ = server.rawStorage.Delete(request.Context(), key)
		clientError(response, 500, "Could not queue inspection")
		return
	}
	if err = tx.Commit(request.Context()); err != nil {
		_ = server.rawStorage.Delete(request.Context(), key)
		clientError(response, 500, "Internal server error")
		return
	}
	server.gisAudit(request, claims.Subject, "dataset.version.uploaded", "dataset_version", id, map[string]any{"datasetId": datasetID, "version": version, "size": count.n})
	writeJSON(response, http.StatusCreated, map[string]any{"id": id, "version": version, "status": "uploaded"})
}

type countingReader struct {
	reader   io.Reader
	writer   io.Writer
	n, limit int64
}

func (reader *countingReader) Read(buffer []byte) (int, error) {
	n, err := reader.reader.Read(buffer)
	if n > 0 {
		reader.n += int64(n)
		if reader.n > reader.limit {
			return n, fmt.Errorf("upload too large")
		}
		_, _ = reader.writer.Write(buffer[:n])
	}
	return n, err
}
func sanitizeUploadName(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.TrimSpace(name)
	if name == "" {
		return "upload"
	}
	if len(name) > 180 {
		name = name[:180]
	}
	return name
}

func (server *Server) listDatasetVersions(response http.ResponseWriter, request *http.Request, datasetID string) {
	if _, ok := server.requireGISAdmin(response, request, permissionDatasetRead); !ok {
		return
	}
	rows, err := server.repository.pool.Query(request.Context(), `SELECT id,version,original_filename,file_size,checksum,format,status,COALESCE(crs,''),layers,error_message,created_at::text FROM dataset_versions WHERE dataset_id=$1 ORDER BY version DESC`, datasetID)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, filename, checksum, format, status, crs, errorMessage, created string
		var version int
		var size int64
		var layers json.RawMessage
		if err = rows.Scan(&id, &version, &filename, &size, &checksum, &format, &status, &crs, &layers, &errorMessage, &created); err != nil {
			clientError(response, 500, "Internal server error")
			return
		}
		items = append(items, map[string]any{"id": id, "version": version, "filename": filename, "size": size, "checksum": checksum, "format": format, "status": status, "crs": crs, "layers": layers, "error": errorMessage, "createdAt": created})
	}
	writeJSON(response, 200, map[string]any{"versions": items})
}

func (server *Server) downloadDatasetVersion(response http.ResponseWriter, request *http.Request, datasetID, versionText string) {
	if _, ok := server.requireGISAdmin(response, request, permissionDatasetRead); !ok {
		return
	}
	version, err := strconv.Atoi(versionText)
	if err != nil || version < 1 {
		gisBadInput(response, "Invalid version")
		return
	}
	var key, filename string
	if err = server.repository.pool.QueryRow(request.Context(), `SELECT storage_key,original_filename FROM dataset_versions WHERE dataset_id=$1 AND version=$2`, datasetID, version).Scan(&key, &filename); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			clientError(response, 404, "Dataset version not found")
		} else {
			clientError(response, 500, "Internal server error")
		}
		return
	}
	source, err := server.rawStorage.Open(request.Context(), key)
	if err != nil {
		clientError(response, 404, "Raw file unavailable")
		return
	}
	defer source.Close()
	response.Header().Set("Content-Disposition", `attachment; filename="`+strings.ReplaceAll(filename, `"`, "")+`"`)
	response.Header().Set("Content-Type", "application/octet-stream")
	_, _ = io.Copy(response, source)
}

func (server *Server) createTileset(response http.ResponseWriter, request *http.Request) {
	claims, ok := server.requireGISAdmin(response, request, permissionTilesetBuild)
	if !ok {
		return
	}
	var input tilesetInput
	if err := decodeJSON(request, &input); err != nil || !validGISUUID(input.DatasetID) || !validGISSlug(input.Slug) || !validName(input.Name) {
		gisBadInput(response, "Invalid tileset")
		return
	}
	var id string
	err := server.repository.pool.QueryRow(request.Context(), `INSERT INTO tilesets(dataset_id,owner_id,slug,name) VALUES($1,$2,$3,$4) RETURNING id`, input.DatasetID, claims.Subject, input.Slug, strings.TrimSpace(input.Name)).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "unique") {
			clientError(response, 409, "Tileset slug already exists")
		} else {
			clientError(response, 400, "Invalid dataset")
		}
		return
	}
	server.gisAudit(request, claims.Subject, "tileset.created", "tileset", id, map[string]any{"datasetId": input.DatasetID})
	writeJSON(response, 201, map[string]any{"id": id, "slug": input.Slug, "name": input.Name})
}

func (server *Server) listTilesets(response http.ResponseWriter, request *http.Request) {
	if _, ok := server.requireGISAdmin(response, request, permissionTilesetRead); !ok {
		return
	}
	rows, err := server.repository.pool.Query(request.Context(), `SELECT t.id,t.dataset_id,t.slug,t.name,COALESCE(max(v.version),0) FROM tilesets t LEFT JOIN tileset_versions v ON v.tileset_id=t.id GROUP BY t.id ORDER BY t.created_at DESC`)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, datasetID, slug, name string
		var version int
		if err = rows.Scan(&id, &datasetID, &slug, &name, &version); err != nil {
			clientError(response, 500, "Internal server error")
			return
		}
		items = append(items, map[string]any{"id": id, "datasetId": datasetID, "slug": slug, "name": name, "latestVersion": version})
	}
	writeJSON(response, 200, map[string]any{"tilesets": items})
}

func (server *Server) buildTileset(response http.ResponseWriter, request *http.Request, tilesetID string) {
	claims, ok := server.requireGISAdmin(response, request, permissionTilesetBuild)
	if !ok {
		return
	}
	var input buildTilesetInput
	if err := decodeJSON(request, &input); err != nil || !validGISUUID(input.DatasetVersionID) || strings.TrimSpace(input.Layer) == "" {
		gisBadInput(response, "Invalid build request")
		return
	}
	if input.SourceLayer == "" {
		input.SourceLayer = input.Layer
	}
	config, err := json.Marshal(input.BuildConfig)
	if err != nil {
		gisBadInput(response, "Invalid build configuration")
		return
	}
	tx, err := server.repository.pool.Begin(request.Context())
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer tx.Rollback(request.Context())
	var version int
	err = tx.QueryRow(request.Context(), `SELECT COALESCE(max(version),0)+1 FROM tileset_versions WHERE tileset_id=$1 FOR UPDATE`, tilesetID).Scan(&version)
	var versionID string
	if err == nil {
		err = tx.QueryRow(request.Context(), `INSERT INTO tileset_versions(tileset_id,dataset_version_id,version,selected_layer,source_layer,build_config,status,created_by) SELECT t.id,$2,$3,$4,$5,$6::jsonb,'processing',$7 FROM tilesets t JOIN dataset_versions d ON d.dataset_id=t.dataset_id WHERE t.id=$1 AND d.id=$2 AND d.status='ready' RETURNING id`, tilesetID, input.DatasetVersionID, version, input.Layer, input.SourceLayer, config, claims.Subject).Scan(&versionID)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		clientError(response, 409, "Dataset version is not ready or does not belong to tileset")
		return
	}
	if err != nil {
		clientError(response, 500, "Could not create tileset version")
		return
	}
	var jobID string
	err = tx.QueryRow(request.Context(), `INSERT INTO processing_jobs(job_type,tileset_version_id,status,payload,created_by) VALUES('build_tileset',$1,'queued',$2::jsonb,$3) RETURNING id`, versionID, config, claims.Subject).Scan(&jobID)
	if err != nil || tx.Commit(request.Context()) != nil {
		clientError(response, 500, "Could not queue tileset build")
		return
	}
	server.gisAudit(request, claims.Subject, "tileset.build.queued", "tileset_version", versionID, map[string]any{"tilesetId": tilesetID, "version": version, "jobId": jobID})
	writeJSON(response, 202, map[string]any{"jobId": jobID, "tilesetVersionId": versionID, "version": version, "status": "processing"})
}

func (server *Server) listTilesetVersions(response http.ResponseWriter, request *http.Request, tilesetID string) {
	if _, ok := server.requireGISAdmin(response, request, permissionTilesetRead); !ok {
		return
	}
	rows, err := server.repository.pool.Query(request.Context(), `SELECT id,version,dataset_version_id,selected_layer,source_layer,status,artifact_path,tilejson,error_message,created_at::text FROM tileset_versions WHERE tileset_id=$1 ORDER BY version DESC`, tilesetID)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, datasetVersionID, layer, sourceLayer, status, path, errorMessage, created string
		var version int
		var tilejson json.RawMessage
		if err = rows.Scan(&id, &version, &datasetVersionID, &layer, &sourceLayer, &status, &path, &tilejson, &errorMessage, &created); err != nil {
			clientError(response, 500, "Internal server error")
			return
		}
		items = append(items, map[string]any{"id": id, "version": version, "datasetVersionId": datasetVersionID, "layer": layer, "sourceLayer": sourceLayer, "status": status, "artifactPath": path, "tilejson": tilejson, "error": errorMessage, "createdAt": created})
	}
	writeJSON(response, 200, map[string]any{"versions": items})
}

func (server *Server) createStyle(response http.ResponseWriter, request *http.Request) {
	claims, ok := server.requireGISAdmin(response, request, permissionStyleWrite)
	if !ok {
		return
	}
	var input styleInput
	if err := decodeJSON(request, &input); err != nil || !validGISSlug(input.Slug) || !validName(input.Name) {
		gisBadInput(response, "Invalid style")
		return
	}
	var id string
	err := server.repository.pool.QueryRow(request.Context(), `INSERT INTO map_styles(owner_id,slug,name) VALUES($1,$2,$3) RETURNING id`, claims.Subject, input.Slug, strings.TrimSpace(input.Name)).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "unique") {
			clientError(response, 409, "Style slug already exists")
		} else {
			clientError(response, 500, "Internal server error")
		}
		return
	}
	writeJSON(response, 201, map[string]any{"id": id, "slug": input.Slug, "name": input.Name})
}

func (server *Server) listStyles(response http.ResponseWriter, request *http.Request) {
	if _, ok := server.requireGISAdmin(response, request, permissionStyleRead); !ok {
		return
	}
	rows, err := server.repository.pool.Query(request.Context(), `SELECT s.id,s.slug,s.name,COALESCE(max(v.version),0) FROM map_styles s LEFT JOIN map_style_versions v ON v.style_id=s.id GROUP BY s.id ORDER BY s.created_at DESC`)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, slug, name string
		var version int
		if err = rows.Scan(&id, &slug, &name, &version); err != nil {
			clientError(response, 500, "Internal server error")
			return
		}
		items = append(items, map[string]any{"id": id, "slug": slug, "name": name, "latestVersion": version})
	}
	writeJSON(response, 200, map[string]any{"styles": items})
}

func (server *Server) createStyleVersion(response http.ResponseWriter, request *http.Request, styleID string) {
	claims, ok := server.requireGISAdmin(response, request, permissionStyleWrite)
	if !ok {
		return
	}
	var input styleVersionInput
	if err := decodeJSON(request, &input); err != nil || len(input.StyleJSON) == 0 || len(input.TilesetVersionIDs) == 0 {
		gisBadInput(response, "A style and tileset versions are required")
		return
	}
	sourceIDs, valid := gisStyleSourceIDs(input.StyleJSON)
	if !valid {
		gisBadInput(response, "Style may only use managed tileset sources")
		return
	}
	declared := map[string]bool{}
	for _, id := range input.TilesetVersionIDs {
		if !validGISUUID(id) {
			gisBadInput(response, "Invalid tileset version")
			return
		}
		declared[id] = true
	}
	for _, id := range sourceIDs {
		if !declared[id] {
			gisBadInput(response, "Style source is not declared")
			return
		}
	}
	tx, err := server.repository.pool.Begin(request.Context())
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer tx.Rollback(request.Context())
	var version int
	err = tx.QueryRow(request.Context(), `SELECT COALESCE(max(version),0)+1 FROM map_style_versions WHERE style_id=$1 FOR UPDATE`, styleID).Scan(&version)
	var id string
	if err == nil {
		err = tx.QueryRow(request.Context(), `INSERT INTO map_style_versions(style_id,version,style_json,tileset_version_ids,status,created_by) SELECT $1,$2,$3::jsonb,$4::uuid[],'ready',$5 WHERE EXISTS(SELECT 1 FROM map_styles WHERE id=$1) RETURNING id`, styleID, version, input.StyleJSON, "{"+strings.Join(input.TilesetVersionIDs, ",")+"}", claims.Subject).Scan(&id)
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			clientError(response, 404, "Style not found")
		} else {
			clientError(response, 400, "Invalid style version")
		}
		return
	}
	if err = tx.Commit(request.Context()); err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	writeJSON(response, 201, map[string]any{"id": id, "version": version, "status": "ready"})
}

func gisStyleSourceIDs(raw json.RawMessage) ([]string, bool) {
	var style struct {
		Version int                       `json:"version"`
		Sources map[string]map[string]any `json:"sources"`
	}
	if json.Unmarshal(raw, &style) != nil || style.Version != 8 || len(style.Sources) == 0 {
		return nil, false
	}
	ids := make([]string, 0, len(style.Sources))
	for _, source := range style.Sources {
		id, ok := source["tilesetVersionId"].(string)
		if !ok || !validGISUUID(id) {
			return nil, false
		}
		if _, hasURL := source["url"]; hasURL {
			return nil, false
		}
		if _, hasTiles := source["tiles"]; hasTiles {
			return nil, false
		}
		ids = append(ids, id)
	}
	return ids, true
}

func (server *Server) createPublication(response http.ResponseWriter, request *http.Request) {
	claims, ok := server.requireGISAdmin(response, request, permissionMapPublish)
	if !ok {
		return
	}
	var input publicationInput
	if err := decodeJSON(request, &input); err != nil || !validGISSlug(input.Slug) || !validName(input.Name) || (input.StyleVersionID != "" && !validGISUUID(input.StyleVersionID)) {
		gisBadInput(response, "Invalid map publication")
		return
	}
	var id string
	err := server.repository.pool.QueryRow(request.Context(), `INSERT INTO map_publications(owner_id,slug,name,description,active_style_version_id) VALUES($1,$2,$3,$4,NULLIF($5,'')::uuid) RETURNING id`, claims.Subject, input.Slug, strings.TrimSpace(input.Name), strings.TrimSpace(input.Description), input.StyleVersionID).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "unique") {
			clientError(response, 409, "Map slug already exists")
		} else {
			clientError(response, 400, "Invalid style version")
		}
		return
	}
	writeJSON(response, 201, map[string]any{"id": id, "slug": input.Slug, "status": "draft"})
}

func (server *Server) listPublications(response http.ResponseWriter, request *http.Request) {
	if _, ok := server.requireGISAdmin(response, request, permissionMapPublish); !ok {
		return
	}
	rows, err := server.repository.pool.Query(request.Context(), `SELECT id,slug,name,description,status,COALESCE(active_style_version_id::text,''),updated_at::text FROM map_publications ORDER BY updated_at DESC`)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, slug, name, description, status, styleID, updated string
		if err = rows.Scan(&id, &slug, &name, &description, &status, &styleID, &updated); err != nil {
			clientError(response, 500, "Internal server error")
			return
		}
		items = append(items, map[string]any{"id": id, "slug": slug, "name": name, "description": description, "status": status, "styleVersionId": styleID, "updatedAt": updated})
	}
	writeJSON(response, 200, map[string]any{"maps": items})
}

func (server *Server) updatePublication(response http.ResponseWriter, request *http.Request, id string) {
	claims, ok := server.requireGISAdmin(response, request, permissionMapPublish)
	if !ok {
		return
	}
	var input publicationUpdateInput
	if err := decodeJSON(request, &input); err != nil {
		gisBadInput(response, "Invalid map publication")
		return
	}
	if input.Name != nil && !validName(*input.Name) {
		gisBadInput(response, "Invalid name")
		return
	}
	if input.Description != nil && len(*input.Description) > 4000 {
		gisBadInput(response, "Invalid description")
		return
	}
	if input.StyleVersionID != nil && *input.StyleVersionID != "" && !validGISUUID(*input.StyleVersionID) {
		gisBadInput(response, "Invalid style version")
		return
	}
	result, err := server.repository.pool.Exec(request.Context(), `UPDATE map_publications SET name=COALESCE($2,name),description=COALESCE($3,description),active_style_version_id=CASE WHEN $4::text IS NULL THEN active_style_version_id WHEN $4='' THEN NULL ELSE $4::uuid END WHERE id=$1`, id, input.Name, input.Description, input.StyleVersionID)
	if err != nil {
		clientError(response, 400, "Invalid map publication")
		return
	}
	if result.RowsAffected() != 1 {
		clientError(response, 404, "Map not found")
		return
	}
	server.gisAudit(request, claims.Subject, "map.updated", "map", id, map[string]any{})
	response.WriteHeader(http.StatusNoContent)
}

func (server *Server) publishPublication(response http.ResponseWriter, request *http.Request, id string, publish bool) {
	claims, ok := server.requireGISAdmin(response, request, permissionMapPublish)
	if !ok {
		return
	}
	status := "unpublished"
	if publish {
		status = "published"
	}
	result, err := server.repository.pool.Exec(request.Context(), `UPDATE map_publications p SET status=$2 WHERE p.id=$1 AND ($2 <> 'published' OR EXISTS(SELECT 1 FROM map_style_versions s WHERE s.id=p.active_style_version_id AND s.status='ready' AND NOT EXISTS(SELECT 1 FROM unnest(s.tileset_version_ids) item LEFT JOIN tileset_versions tv ON tv.id=item AND tv.status='ready' WHERE tv.id IS NULL)))`, id, status)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	if result.RowsAffected() != 1 {
		clientError(response, 409, "Map needs a ready style and tileset versions before publishing")
		return
	}
	server.gisAudit(request, claims.Subject, "map."+status, "map", id, map[string]any{})
	response.WriteHeader(http.StatusNoContent)
}

func (server *Server) listACL(response http.ResponseWriter, request *http.Request, publicationID string) {
	if _, ok := server.requireGISAdmin(response, request, permissionMapManageAccess); !ok {
		return
	}
	rows, err := server.repository.pool.Query(request.Context(), `SELECT id,subject_type,subject_id,action,created_at::text FROM resource_acl WHERE publication_id=$1 ORDER BY created_at DESC`, publicationID)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, kind, subject, action, created string
		if err = rows.Scan(&id, &kind, &subject, &action, &created); err != nil {
			clientError(response, 500, "Internal server error")
			return
		}
		items = append(items, map[string]any{"id": id, "subjectType": kind, "subjectId": subject, "action": action, "createdAt": created})
	}
	writeJSON(response, 200, map[string]any{"entries": items})
}

func (server *Server) replaceACL(response http.ResponseWriter, request *http.Request, publicationID string) {
	claims, ok := server.requireGISAdmin(response, request, permissionMapManageAccess)
	if !ok {
		return
	}
	var input struct {
		Entries []aclInput `json:"entries"`
	}
	if err := decodeJSON(request, &input); err != nil || len(input.Entries) > 500 {
		gisBadInput(response, "Invalid ACL")
		return
	}
	for _, entry := range input.Entries {
		if (entry.SubjectType != "user" && entry.SubjectType != "role" && entry.SubjectType != "group") || strings.TrimSpace(entry.SubjectID) == "" || entry.Action != "map:read" {
			gisBadInput(response, "Invalid ACL entry")
			return
		}
		if entry.SubjectType != "role" && !validGISUUID(entry.SubjectID) {
			gisBadInput(response, "Invalid ACL subject")
			return
		}
	}
	tx, err := server.repository.pool.Begin(request.Context())
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer tx.Rollback(request.Context())
	var exists bool
	if err = tx.QueryRow(request.Context(), `SELECT EXISTS(SELECT 1 FROM map_publications WHERE id=$1)`, publicationID).Scan(&exists); err != nil || !exists {
		clientError(response, 404, "Map not found")
		return
	}
	if _, err = tx.Exec(request.Context(), `DELETE FROM resource_acl WHERE publication_id=$1`, publicationID); err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	for _, entry := range input.Entries {
		if _, err = tx.Exec(request.Context(), `INSERT INTO resource_acl(publication_id,subject_type,subject_id,action,granted_by) VALUES($1,$2,$3,$4,$5)`, publicationID, entry.SubjectType, entry.SubjectID, entry.Action, claims.Subject); err != nil {
			clientError(response, 400, "Invalid ACL subject")
			return
		}
	}
	if err = tx.Commit(request.Context()); err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	server.gisAudit(request, claims.Subject, "map.acl.replaced", "map", publicationID, map[string]any{"entries": len(input.Entries)})
	response.WriteHeader(http.StatusNoContent)
}

func (server *Server) canReadPublication(request *http.Request, claims Claims, publicationID string) bool {
	if isAdmin(claims) {
		return true
	}
	var allowed bool
	err := server.repository.pool.QueryRow(request.Context(), `SELECT EXISTS(SELECT 1 FROM resource_acl a WHERE a.publication_id=$1 AND a.action='map:read' AND ((a.subject_type='user' AND a.subject_id=$2) OR (a.subject_type='role' AND a.subject_id=$3) OR (a.subject_type='group' AND EXISTS(SELECT 1 FROM group_memberships gm WHERE gm.group_id::text=a.subject_id AND gm.user_id=$2::uuid))))`, publicationID, claims.Subject, claims.Role).Scan(&allowed)
	return err == nil && allowed
}

func (server *Server) mapCatalog(response http.ResponseWriter, request *http.Request) {
	claims, ok := server.authenticate(response, request, permissionMapRead)
	if !ok {
		return
	}
	rows, err := server.repository.pool.Query(request.Context(), `SELECT p.id,p.slug,p.name,p.description FROM map_publications p WHERE p.status='published' AND ($1='admin' OR EXISTS(SELECT 1 FROM resource_acl a WHERE a.publication_id=p.id AND a.action='map:read' AND ((a.subject_type='user' AND a.subject_id=$2) OR (a.subject_type='role' AND a.subject_id=$1) OR (a.subject_type='group' AND EXISTS(SELECT 1 FROM group_memberships gm WHERE gm.group_id::text=a.subject_id AND gm.user_id=$2::uuid))))) ORDER BY p.name`, claims.Role, claims.Subject)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, slug, name, description string
		if err = rows.Scan(&id, &slug, &name, &description); err != nil {
			clientError(response, 500, "Internal server error")
			return
		}
		items = append(items, map[string]any{"id": id, "slug": slug, "name": name, "description": description, "styleUrl": "/api/maps/" + id + "/style"})
	}
	response.Header().Set("Cache-Control", "private, no-cache")
	writeJSON(response, 200, map[string]any{"maps": items})
}

func (server *Server) publicationStyle(response http.ResponseWriter, request *http.Request, publicationID string) {
	claims, ok := server.authenticate(response, request, permissionMapRead)
	if !ok {
		return
	}
	if !server.canReadPublication(request, claims, publicationID) {
		clientError(response, 404, "Map not found")
		return
	}
	var raw json.RawMessage
	if err := server.repository.pool.QueryRow(request.Context(), `SELECT s.style_json FROM map_publications p JOIN map_style_versions s ON s.id=p.active_style_version_id WHERE p.id=$1 AND p.status='published'`, publicationID).Scan(&raw); err != nil {
		clientError(response, 404, "Map style not found")
		return
	}
	style, err := server.resolvePublicationStyle(request, raw, publicationID)
	if err != nil {
		clientError(response, 500, "Invalid published style")
		return
	}
	response.Header().Set("Cache-Control", "private, no-cache")
	writeJSON(response, 200, style)
}

func (server *Server) resolvePublicationStyle(request *http.Request, raw json.RawMessage, publicationID string) (map[string]any, error) {
	var style map[string]any
	if err := json.Unmarshal(raw, &style); err != nil {
		return nil, err
	}
	sources, ok := style["sources"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("style has no sources")
	}
	for name, value := range sources {
		source, ok := value.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("invalid source")
		}
		id, ok := source["tilesetVersionId"].(string)
		if !ok || !validGISUUID(id) {
			return nil, fmt.Errorf("invalid tileset source")
		}
		var version int
		if err := server.repository.pool.QueryRow(request.Context(), `SELECT version FROM tileset_versions WHERE id=$1`, id).Scan(&version); err != nil {
			return nil, fmt.Errorf("tileset version unavailable")
		}
		delete(source, "tilesetVersionId")
		source["type"] = "vector"
		source["tiles"] = []string{"/api/maps/" + publicationID + "/tilesets/" + id + "/versions/" + strconv.Itoa(version) + "/{z}/{x}/{y}.pbf"}
		sources[name] = source
	}
	return style, nil
}

func (server *Server) publicationTileJSON(response http.ResponseWriter, request *http.Request, publicationID, tilesetVersionID, versionText string) {
	server.publicationTile(response, request, publicationID, tilesetVersionID, versionText, "", true)
}
func (server *Server) publicationTile(response http.ResponseWriter, request *http.Request, publicationID, tilesetVersionID, versionText, tilePath string, tileJSON bool) {
	claims, ok := server.authenticate(response, request, permissionMapRead)
	if !ok {
		return
	}
	if !server.canReadPublication(request, claims, publicationID) {
		clientError(response, 404, "Map not found")
		return
	}
	if tilesetVersionID == "" || !validGISUUID(tilesetVersionID) {
		gisBadInput(response, "Invalid tileset version")
		return
	}
	var upstreamPath string
	err := server.repository.pool.QueryRow(request.Context(), `SELECT tv.artifact_path FROM map_publications p JOIN map_style_versions s ON s.id=p.active_style_version_id JOIN tileset_versions tv ON tv.id=ANY(s.tileset_version_ids) WHERE p.id=$1 AND p.status='published' AND tv.id=$2 AND tv.status='ready'`, publicationID, tilesetVersionID).Scan(&upstreamPath)
	if err != nil {
		clientError(response, 404, "Tileset not found")
		return
	}
	version, err := strconv.Atoi(versionText)
	if err != nil || version < 1 {
		gisBadInput(response, "Invalid tileset version")
		return
	}
	var actual int
	if err = server.repository.pool.QueryRow(request.Context(), `SELECT version FROM tileset_versions WHERE id=$1`, tilesetVersionID).Scan(&actual); err != nil || actual != version {
		clientError(response, 404, "Tileset not found")
		return
	}
	if tileJSON {
		var tilejson json.RawMessage
		if err = server.repository.pool.QueryRow(request.Context(), `SELECT tilejson FROM tileset_versions WHERE id=$1`, tilesetVersionID).Scan(&tilejson); err != nil {
			clientError(response, 404, "Tileset not found")
			return
		}
		var document map[string]any
		if json.Unmarshal(tilejson, &document) != nil {
			clientError(response, 500, "Invalid TileJSON")
			return
		}
		document["tiles"] = []string{"/api/maps/" + publicationID + "/tilesets/" + tilesetVersionID + "/versions/" + versionText + "/{z}/{x}/{y}.pbf"}
		response.Header().Set("Cache-Control", "private, no-cache")
		writeJSON(response, 200, document)
		return
	}
	if !validTilePath(tilePath) {
		clientError(response, 404, "Tile not found")
		return
	}
	_ = upstreamPath // Worker publishes a dataset id that Tile Server exposes as the tileset-version UUID.
	server.tileProxy(response, request, "/datas/"+tilesetVersionID+"/"+tilePath)
}
func validTilePath(value string) bool {
	parts := strings.Split(value, "/")
	if len(parts) != 3 {
		return false
	}
	for _, part := range parts {
		if part == "" || strings.Contains(part, "\\") || strings.Contains(part, "..") {
			return false
		}
	}
	return strings.HasSuffix(parts[2], ".pbf")
}

func (server *Server) listJobs(response http.ResponseWriter, request *http.Request) {
	if _, ok := server.requireGISAdmin(response, request, permissionGISJobRead); !ok {
		return
	}
	rows, err := server.repository.pool.Query(request.Context(), `SELECT id,job_type,status,attempt,max_attempts,COALESCE(claimed_by,''),COALESCE(started_at::text,''),COALESCE(finished_at::text,''),error_message,created_at::text FROM processing_jobs ORDER BY created_at DESC LIMIT 200`)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, kind, status, claimed, started, finished, message, created string
		var attempt, max int
		if err = rows.Scan(&id, &kind, &status, &attempt, &max, &claimed, &started, &finished, &message, &created); err != nil {
			clientError(response, 500, "Internal server error")
			return
		}
		items = append(items, map[string]any{"id": id, "type": kind, "status": status, "attempt": attempt, "maxAttempts": max, "claimedBy": claimed, "startedAt": started, "finishedAt": finished, "error": message, "createdAt": created})
	}
	writeJSON(response, 200, map[string]any{"jobs": items})
}
func (server *Server) getJob(response http.ResponseWriter, request *http.Request, id string, logs bool) {
	if _, ok := server.requireGISAdmin(response, request, permissionGISJobRead); !ok {
		return
	}
	var status, log, message string
	if err := server.repository.pool.QueryRow(request.Context(), `SELECT status,log,error_message FROM processing_jobs WHERE id=$1`, id).Scan(&status, &log, &message); err != nil {
		clientError(response, 404, "Job not found")
		return
	}
	if logs {
		writeJSON(response, 200, map[string]any{"id": id, "status": status, "log": log, "error": message})
	} else {
		writeJSON(response, 200, map[string]any{"id": id, "status": status, "error": message})
	}
}
func (server *Server) retryJob(response http.ResponseWriter, request *http.Request, id string) {
	claims, ok := server.requireGISAdmin(response, request, permissionGISJobRetry)
	if !ok {
		return
	}
	result, err := server.repository.pool.Exec(request.Context(), `UPDATE processing_jobs SET status='queued',claimed_by=NULL,lease_expires_at=NULL,started_at=NULL,finished_at=NULL,error_message='' WHERE id=$1 AND status IN ('failed','canceled') AND attempt < max_attempts`, id)
	if err != nil {
		clientError(response, 500, "Internal server error")
		return
	}
	if result.RowsAffected() != 1 {
		clientError(response, 409, "Job cannot be retried")
		return
	}
	server.gisAudit(request, claims.Subject, "job.retried", "job", id, map[string]any{})
	response.WriteHeader(http.StatusNoContent)
}

func (server *Server) gisAudit(request *http.Request, actor, action, resourceType, resourceID string, details map[string]any) {
	details["resourceType"] = resourceType
	details["resourceId"] = resourceID
	payload, err := json.Marshal(details)
	if err == nil {
		_, _ = server.repository.pool.Exec(request.Context(), `INSERT INTO admin_audit_logs(actor_id,action,details) VALUES($1,$2,$3::jsonb)`, actor, action, payload)
	}
}

// routeGIS keeps the main router readable while preserving its existing
// method/path dispatch style. It returns false only when the path is outside
// the GIS API namespace.
func (server *Server) routeGIS(response http.ResponseWriter, request *http.Request) bool {
	path := strings.Trim(request.URL.Path, "/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 || parts[0] != "api" || (parts[1] != "admin" && parts[1] != "maps") {
		return false
	}
	if parts[1] == "maps" {
		if request.Method == http.MethodGet && len(parts) == 3 && parts[2] == "catalog" {
			server.mapCatalog(response, request)
			return true
		}
		if len(parts) >= 4 && validGISUUID(parts[2]) {
			publicationID := parts[2]
			if request.Method == http.MethodGet && len(parts) == 4 && parts[3] == "style" {
				server.publicationStyle(response, request, publicationID)
				return true
			}
			// /api/maps/{publication}/tilesets/{tileset-version}/versions/{version}/tilejson.json
			if request.Method == http.MethodGet && len(parts) == 8 && parts[3] == "tilesets" && parts[5] == "versions" && parts[7] == "tilejson.json" {
				server.publicationTileJSON(response, request, publicationID, parts[4], parts[6])
				return true
			}
			// /api/maps/{publication}/tilesets/{tileset-version}/versions/{version}/{z}/{x}/{y}.pbf
			if (request.Method == http.MethodGet || request.Method == http.MethodHead) && len(parts) == 10 && parts[3] == "tilesets" && parts[5] == "versions" {
				server.publicationTile(response, request, publicationID, parts[4], parts[6], strings.Join(parts[7:], "/"), false)
				return true
			}
		}
		clientError(response, http.StatusNotFound, "Not found")
		return true
	}
	if len(parts) < 3 || parts[2] != "admin" {
		return false
	}
	// Admin endpoints use /api/admin/... . The above split has api/admin as
	// parts[0:2], so this branch is intentionally unreachable; retained for
	// clarity should a future /api/maps/admin namespace be added.
	return false
}

func (server *Server) routeGISAdmin(response http.ResponseWriter, request *http.Request) bool {
	path := strings.Trim(request.URL.Path, "/")
	parts := strings.Split(path, "/")
	if len(parts) < 3 || parts[0] != "api" || parts[1] != "admin" {
		return false
	}
	resource := parts[2]
	if resource != "datasets" && resource != "tilesets" && resource != "styles" && resource != "maps" && resource != "jobs" {
		return false
	}
	if resource == "datasets" {
		if len(parts) == 3 && request.Method == http.MethodPost {
			server.createDataset(response, request)
			return true
		}
		if len(parts) == 3 && request.Method == http.MethodGet {
			server.listDatasets(response, request)
			return true
		}
		if len(parts) >= 4 && validGISUUID(parts[3]) {
			if len(parts) == 4 && request.Method == http.MethodGet {
				server.getDataset(response, request, parts[3])
				return true
			}
			if len(parts) == 5 && parts[4] == "versions" && request.Method == http.MethodPost {
				server.uploadDatasetVersion(response, request, parts[3])
				return true
			}
			if len(parts) == 5 && parts[4] == "versions" && request.Method == http.MethodGet {
				server.listDatasetVersions(response, request, parts[3])
				return true
			}
			if len(parts) == 7 && parts[4] == "versions" && parts[6] == "download" && request.Method == http.MethodGet {
				server.downloadDatasetVersion(response, request, parts[3], parts[5])
				return true
			}
		}
	}
	if resource == "tilesets" {
		if len(parts) == 3 && request.Method == http.MethodPost {
			server.createTileset(response, request)
			return true
		}
		if len(parts) == 3 && request.Method == http.MethodGet {
			server.listTilesets(response, request)
			return true
		}
		if len(parts) >= 4 && validGISUUID(parts[3]) {
			if len(parts) == 5 && parts[4] == "build" && request.Method == http.MethodPost {
				server.buildTileset(response, request, parts[3])
				return true
			}
			if len(parts) == 5 && parts[4] == "versions" && request.Method == http.MethodGet {
				server.listTilesetVersions(response, request, parts[3])
				return true
			}
		}
	}
	if resource == "styles" {
		if len(parts) == 3 && request.Method == http.MethodPost {
			server.createStyle(response, request)
			return true
		}
		if len(parts) == 3 && request.Method == http.MethodGet {
			server.listStyles(response, request)
			return true
		}
		if len(parts) == 5 && validGISUUID(parts[3]) && parts[4] == "versions" && request.Method == http.MethodPost {
			server.createStyleVersion(response, request, parts[3])
			return true
		}
	}
	if resource == "maps" {
		if len(parts) == 3 && request.Method == http.MethodPost {
			server.createPublication(response, request)
			return true
		}
		if len(parts) == 3 && request.Method == http.MethodGet {
			server.listPublications(response, request)
			return true
		}
		if len(parts) >= 4 && validGISUUID(parts[3]) {
			if len(parts) == 4 && request.Method == http.MethodPatch {
				server.updatePublication(response, request, parts[3])
				return true
			}
			if len(parts) == 5 && parts[4] == "publish" && request.Method == http.MethodPost {
				server.publishPublication(response, request, parts[3], true)
				return true
			}
			if len(parts) == 5 && parts[4] == "unpublish" && request.Method == http.MethodPost {
				server.publishPublication(response, request, parts[3], false)
				return true
			}
			if len(parts) == 5 && parts[4] == "acl" && request.Method == http.MethodGet {
				server.listACL(response, request, parts[3])
				return true
			}
			if len(parts) == 5 && parts[4] == "acl" && request.Method == http.MethodPut {
				server.replaceACL(response, request, parts[3])
				return true
			}
		}
	}
	if resource == "jobs" {
		if len(parts) == 3 && request.Method == http.MethodGet {
			server.listJobs(response, request)
			return true
		}
		if len(parts) >= 4 && validGISUUID(parts[3]) {
			if len(parts) == 4 && request.Method == http.MethodGet {
				server.getJob(response, request, parts[3], false)
				return true
			}
			if len(parts) == 5 && parts[4] == "logs" && request.Method == http.MethodGet {
				server.getJob(response, request, parts[3], true)
				return true
			}
			if len(parts) == 5 && parts[4] == "retry" && request.Method == http.MethodPost {
				server.retryJob(response, request, parts[3])
				return true
			}
		}
	}
	clientError(response, http.StatusNotFound, "Not found")
	return true
}

// Keep multipart imported in this file so Go documents the intended upload
// mechanism even when callers provide a multipart.File directly in tests.
var _ multipart.File
var _ = os.ErrNotExist
