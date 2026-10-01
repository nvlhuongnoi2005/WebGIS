package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const poiSyncBatchSize = 500

func nominatimReadDatabaseURL() (string, error) {
	if databaseURL := env("NOMINATIM_DB_URL", ""); databaseURL != "" {
		return databaseURL, nil
	}

	user := strings.TrimSpace(os.Getenv("NOMINATIM_DB_USER"))
	password := os.Getenv("NOMINATIM_DB_PASSWORD")
	if user == "" || password == "" {
		return "", fmt.Errorf("NOMINATIM_DB_URL or NOMINATIM_DB_USER and NOMINATIM_DB_PASSWORD are required")
	}

	return (&url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(user, password),
		Host:     env("NOMINATIM_DB_HOST", "nominatim-db:5432"),
		Path:     env("NOMINATIM_DB_NAME", "nominatim"),
		RawQuery: "sslmode=disable",
	}).String(), nil
}

// runPOISync copies the product-supported POI categories out of Nominatim's
// internal placex table. search_pois is then safe for low-latency application
// queries even when Nominatim is rebuilt or upgraded.
func runPOISync(ctx context.Context, config Config) error {
	sourceURL, err := nominatimReadDatabaseURL()
	if err != nil {
		return err
	}
	source, err := pgxpool.New(ctx, sourceURL)
	if err != nil {
		return fmt.Errorf("connect to Nominatim database: %w", err)
	}
	defer source.Close()
	target, err := pgxpool.New(ctx, config.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect to application database: %w", err)
	}
	defer target.Close()

	var syncStarted time.Time
	if err := target.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&syncStarted); err != nil {
		return err
	}

	rows, err := source.Query(ctx, `
		SELECT p.place_id, p.osm_type, p.osm_id, p.name ->> 'name',
			CASE
				WHEN p.class = 'amenity' AND p.type IN ('restaurant', 'fast_food') THEN 'restaurant'
				WHEN p.class = 'amenity' AND p.type = 'cafe' THEN 'cafe'
				WHEN p.class = 'amenity' AND p.type IN ('hospital', 'clinic', 'doctors') THEN 'hospital'
				WHEN p.class = 'amenity' AND p.type = 'pharmacy' THEN 'pharmacy'
				WHEN p.class = 'amenity' AND p.type IN ('school', 'college', 'university', 'kindergarten') THEN 'school'
				WHEN p.class = 'amenity' AND p.type = 'atm' THEN 'atm'
				WHEN p.class = 'amenity' AND p.type = 'bank' THEN 'bank'
				WHEN p.class = 'tourism' THEN 'tourism'
			END AS category,
			p.type,
			COALESCE(NULLIF(CONCAT_WS(', ', p.address ->> 'housenumber', p.address ->> 'street', p.address ->> 'ward', p.address ->> 'district', p.address ->> 'city'), ''), ''),
			ST_X(p.centroid), ST_Y(p.centroid)
		FROM placex p
		WHERE p.centroid IS NOT NULL
			AND p.osm_id IS NOT NULL
			AND NULLIF(BTRIM(p.name -> 'name'), '') IS NOT NULL
			AND (
				(p.class = 'amenity' AND p.type IN ('restaurant', 'fast_food', 'cafe', 'hospital', 'clinic', 'doctors', 'pharmacy', 'school', 'college', 'university', 'kindergarten', 'atm', 'bank'))
				OR p.class = 'tourism'
			)`)
	if err != nil {
		return fmt.Errorf("query Nominatim POIs: %w", err)
	}
	defer rows.Close()

	const upsert = `
		INSERT INTO search_pois (source_place_id, source_osm_type, source_osm_id, name, category, kind, address, tags, location, synced_at)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), $8::jsonb, ST_SetSRID(ST_MakePoint($9, $10), 4326), $11)
		ON CONFLICT (source_place_id) DO UPDATE
		SET source_osm_type = EXCLUDED.source_osm_type,
			source_osm_id = EXCLUDED.source_osm_id,
			name = EXCLUDED.name,
			category = EXCLUDED.category,
			kind = EXCLUDED.kind,
			address = EXCLUDED.address,
			tags = EXCLUDED.tags,
			location = EXCLUDED.location,
			synced_at = EXCLUDED.synced_at`

	batch := &pgx.Batch{}
	queued, synced := 0, 0
	flush := func() error {
		if queued == 0 {
			return nil
		}
		results := target.SendBatch(ctx, batch)
		for index := 0; index < queued; index++ {
			if _, err := results.Exec(); err != nil {
				results.Close()
				return err
			}
		}
		if err := results.Close(); err != nil {
			return err
		}
		synced += queued
		queued = 0
		batch = &pgx.Batch{}
		return nil
	}

	for rows.Next() {
		var placeID, osmID int64
		var osmType, name, category, kind, address string
		var longitude, latitude float64
		if err := rows.Scan(&placeID, &osmType, &osmID, &name, &category, &kind, &address, &longitude, &latitude); err != nil {
			return err
		}
		batch.Queue(upsert, placeID, osmType, osmID, strings.TrimSpace(name), category, kind, address, json.RawMessage(`{}`), longitude, latitude, syncStarted)
		queued++
		if queued == poiSyncBatchSize {
			if err := flush(); err != nil {
				return fmt.Errorf("upsert search POIs: %w", err)
			}
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if err := flush(); err != nil {
		return fmt.Errorf("upsert search POIs: %w", err)
	}
	if _, err := target.Exec(ctx, "DELETE FROM search_pois WHERE synced_at < $1", syncStarted); err != nil {
		return fmt.Errorf("remove stale search POIs: %w", err)
	}
	slog.Info("POI synchronization completed", "count", synced)
	return nil
}
