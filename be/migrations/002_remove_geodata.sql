-- Remove the retired administrator-managed GeoData feature from installations
-- that previously applied its schema.  Each statement is idempotent because
-- migrations are re-applied when the controller starts.
DELETE FROM admin_audit_logs
WHERE action LIKE 'dataset.%'
   OR action LIKE 'tileset.%'
   OR action LIKE 'map.%'
   OR action LIKE 'job.%';

DROP TABLE IF EXISTS processing_jobs;
DROP TABLE IF EXISTS resource_acl;
DROP TABLE IF EXISTS group_memberships;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS map_publications;
DROP TABLE IF EXISTS map_style_versions;
DROP TABLE IF EXISTS map_styles;
DROP TABLE IF EXISTS tileset_versions;
DROP TABLE IF EXISTS tilesets;
DROP TABLE IF EXISTS dataset_versions;
DROP TABLE IF EXISTS datasets;
