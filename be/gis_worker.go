package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type gisJob struct {
	ID, Type, DatasetVersionID, TilesetVersionID string
	Payload                                      json.RawMessage
}

// runGDALWorker is invoked as `controller gdal-worker`. It deliberately keeps
// database transactions short: a transaction only claims a lease, while GDAL
// runs outside the transaction.
func runGDALWorker(ctx context.Context, config Config) error {
	repository, err := NewRepository(ctx, config)
	if err != nil {
		return err
	}
	defer repository.Close()
	storage, err := newRawStorage(config)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(config.GISWorkspacePath, 0o750); err != nil {
		return err
	}
	if err = os.MkdirAll(config.GISPublishedPath, 0o750); err != nil {
		return err
	}
	workerID, err := randomURLToken(12)
	if err != nil {
		return err
	}
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		job, err := claimGISJob(ctx, repository, workerID, config.GISJobLeaseSeconds)
		if err != nil {
			return err
		}
		if job != nil {
			err = processGISJob(ctx, repository, storage, config, *job)
			if err != nil {
				_ = failGISJob(ctx, repository, *job, err)
			}
			continue
		}
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}

func claimGISJob(ctx context.Context, repository *Repository, workerID string, leaseSeconds int) (*gisJob, error) {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var job gisJob
	err = tx.QueryRow(ctx, `WITH candidate AS (
  SELECT id FROM processing_jobs
  WHERE (status='queued' OR (status='running' AND lease_expires_at < now()))
    AND attempt < max_attempts
  ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
)
UPDATE processing_jobs job SET status='running',attempt=job.attempt+1,claimed_by=$1,
  lease_expires_at=now()+make_interval(secs => $2),started_at=COALESCE(job.started_at,now()),
  finished_at=NULL,error_message=''
FROM candidate WHERE job.id=candidate.id
RETURNING job.id,job.job_type,COALESCE(job.dataset_version_id::text,''),COALESCE(job.tileset_version_id::text,''),job.payload`, workerID, leaseSeconds).Scan(&job.ID, &job.Type, &job.DatasetVersionID, &job.TilesetVersionID, &job.Payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, tx.Commit(ctx)
	}
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &job, nil
}

func processGISJob(ctx context.Context, repository *Repository, storage RawStorage, config Config, job gisJob) error {
	if job.Type == "inspect_dataset" {
		return inspectDatasetJob(ctx, repository, storage, config, job)
	}
	if job.Type == "build_tileset" {
		return buildTilesetJob(ctx, repository, storage, config, job)
	}
	return fmt.Errorf("unknown GIS job type %q", job.Type)
}

func jobWorkspace(config Config, jobID string) (string, error) {
	if !validGISUUID(jobID) {
		return "", fmt.Errorf("invalid job id")
	}
	path := filepath.Join(config.GISWorkspacePath, jobID)
	if err := os.MkdirAll(path, 0o750); err != nil {
		return "", err
	}
	return path, nil
}

func copyRawToWorkspace(ctx context.Context, storage RawStorage, key, target string) error {
	input, err := storage.Open(ctx, key)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, input)
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func runGDAL(ctx context.Context, log *strings.Builder, name string, args ...string) error {
	command := exec.CommandContext(ctx, name, args...)
	output, err := command.CombinedOutput()
	log.WriteString("$ " + name + " " + strings.Join(args, " ") + "\n" + string(output) + "\n")
	if err != nil {
		return fmt.Errorf("%s failed: %w", name, err)
	}
	return nil
}

func inspectDatasetJob(ctx context.Context, repository *Repository, storage RawStorage, config Config, job gisJob) error {
	var key, format, filename string
	err := repository.pool.QueryRow(ctx, `SELECT storage_key,format,original_filename FROM dataset_versions WHERE id=$1`, job.DatasetVersionID).Scan(&key, &format, &filename)
	if err != nil {
		return err
	}
	workspace, err := jobWorkspace(config, job.ID)
	if err != nil {
		return err
	}
	input := filepath.Join(workspace, sanitizeUploadName(filename))
	if err = copyRawToWorkspace(ctx, storage, key, input); err != nil {
		return err
	}
	var log strings.Builder
	// ogrinfo validates the actual vector payload rather than trusting the
	// filename supplied during upload. A ZIP is inspected without extraction;
	// GDAL rejects invalid archives and missing Shapefile components.
	if err = runGDAL(ctx, &log, "ogrinfo", "-ro", "-so", "-json", input); err != nil {
		return err
	}
	layers := []map[string]any{{"name": strings.TrimSuffix(sanitizeUploadName(filename), filepath.Ext(filename)), "format": format}}
	encodedLayers, _ := json.Marshal(layers)
	_, err = repository.pool.Exec(ctx, `UPDATE dataset_versions SET status='ready',layers=$2::jsonb,error_message='' WHERE id=$1`, job.DatasetVersionID, encodedLayers)
	if err != nil {
		return err
	}
	return succeedGISJob(ctx, repository, job, log.String())
}

func buildTilesetJob(ctx context.Context, repository *Repository, storage RawStorage, config Config, job gisJob) error {
	var storageKey, filename, selectedLayer, sourceLayer, tilesetID string
	var version int
	err := repository.pool.QueryRow(ctx, `SELECT d.storage_key,d.original_filename,tv.selected_layer,tv.source_layer,tv.version,tv.tileset_id::text
FROM tileset_versions tv JOIN dataset_versions d ON d.id=tv.dataset_version_id WHERE tv.id=$1`, job.TilesetVersionID).Scan(&storageKey, &filename, &selectedLayer, &sourceLayer, &version, &tilesetID)
	if err != nil {
		return err
	}
	workspace, err := jobWorkspace(config, job.ID)
	if err != nil {
		return err
	}
	input := filepath.Join(workspace, sanitizeUploadName(filename))
	if err = copyRawToWorkspace(ctx, storage, storageKey, input); err != nil {
		return err
	}
	staging := filepath.Join(workspace, "output")
	if err = os.MkdirAll(staging, 0o750); err != nil {
		return err
	}
	artifact := filepath.Join(staging, "data.mbtiles")
	var log strings.Builder
	if err = runGDAL(ctx, &log, "ogr2ogr", "-f", "MVT", artifact, input, selectedLayer, "-nln", sourceLayer); err != nil {
		return err
	}
	if info, statErr := os.Stat(artifact); statErr != nil || info.Size() == 0 {
		return fmt.Errorf("GDAL produced no MBTiles artifact")
	}
	tileJSON := map[string]any{"tilejson": "3.0.0", "name": tilesetID, "format": "pbf", "minzoom": 0, "maxzoom": 14, "vector_layers": []map[string]any{{"id": sourceLayer}}}
	tileJSONRaw, _ := json.Marshal(tileJSON)
	metadata := map[string]any{"tilesetId": tilesetID, "version": version, "sourceLayer": sourceLayer, "builtAt": time.Now().UTC().Format(time.RFC3339)}
	metadataRaw, _ := json.Marshal(metadata)
	if err = os.WriteFile(filepath.Join(staging, "tilejson.json"), tileJSONRaw, 0o640); err != nil {
		return err
	}
	if err = os.WriteFile(filepath.Join(staging, "metadata.json"), metadataRaw, 0o640); err != nil {
		return err
	}
	if err = os.WriteFile(filepath.Join(staging, "build.log"), []byte(log.String()), 0o640); err != nil {
		return err
	}
	final := filepath.Join(config.GISPublishedPath, "tilesets", tilesetID, "v"+strconv.Itoa(version))
	if _, err = os.Stat(final); err == nil {
		return fmt.Errorf("published tileset version already exists")
	}
	if err = os.MkdirAll(filepath.Dir(final), 0o750); err != nil {
		return err
	}
	if err = os.Rename(staging, final); err != nil {
		return fmt.Errorf("promote tileset artifact: %w", err)
	}
	_, err = repository.pool.Exec(ctx, `UPDATE tileset_versions SET status='ready',artifact_path=$2,tilejson=$3::jsonb,metadata=$4::jsonb,build_log=$5,error_message='' WHERE id=$1`, job.TilesetVersionID, final, tileJSONRaw, metadataRaw, log.String())
	if err != nil {
		return err
	}
	return succeedGISJob(ctx, repository, job, log.String())
}

func succeedGISJob(ctx context.Context, repository *Repository, job gisJob, log string) error {
	_, err := repository.pool.Exec(ctx, `UPDATE processing_jobs SET status='succeeded',finished_at=now(),lease_expires_at=NULL,log=$2 WHERE id=$1`, job.ID, log)
	return err
}
func failGISJob(ctx context.Context, repository *Repository, job gisJob, cause error) error {
	message := cause.Error()
	_, _ = repository.pool.Exec(ctx, `UPDATE processing_jobs SET status='failed',finished_at=now(),lease_expires_at=NULL,error_message=$2,log=log || E'\nERROR: ' || $2 WHERE id=$1`, job.ID, message)
	if job.DatasetVersionID != "" {
		_, _ = repository.pool.Exec(ctx, `UPDATE dataset_versions SET status='failed',error_message=$2 WHERE id=$1`, job.DatasetVersionID, message)
	}
	if job.TilesetVersionID != "" {
		_, _ = repository.pool.Exec(ctx, `UPDATE tileset_versions SET status='failed',error_message=$2 WHERE id=$1`, job.TilesetVersionID, message)
	}
	return nil
}
