-- GIS data management is intentionally separate from Nominatim.  Nominatim
-- remains a rebuildable search service; these tables describe application-owned
-- uploads, generated artifacts, publications, and their access rules.

CREATE TABLE IF NOT EXISTS datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS datasets_owner_idx ON datasets (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dataset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  original_filename text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL DEFAULT '',
  file_size bigint NOT NULL CHECK (file_size >= 0),
  checksum text NOT NULL,
  checksum_algorithm text NOT NULL DEFAULT 'sha256',
  format text NOT NULL,
  status text NOT NULL CHECK (status IN ('uploading','uploaded','validating','ready','failed','archived')),
  crs text,
  bbox jsonb,
  layers jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, version)
);
CREATE INDEX IF NOT EXISTS dataset_versions_dataset_idx ON dataset_versions (dataset_id, version DESC);

CREATE TABLE IF NOT EXISTS tilesets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tilesets_dataset_idx ON tilesets (dataset_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tileset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tileset_id uuid NOT NULL REFERENCES tilesets(id) ON DELETE CASCADE,
  dataset_version_id uuid NOT NULL REFERENCES dataset_versions(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  selected_layer text NOT NULL,
  source_layer text NOT NULL,
  build_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('processing','ready','failed','archived')),
  artifact_path text NOT NULL DEFAULT '',
  tilejson jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  build_log text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tileset_id, version)
);
CREATE INDEX IF NOT EXISTS tileset_versions_tileset_idx ON tileset_versions (tileset_id, version DESC);

CREATE TABLE IF NOT EXISTS map_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS map_style_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  style_id uuid NOT NULL REFERENCES map_styles(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  style_json jsonb NOT NULL,
  tileset_version_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('draft','ready','archived')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (style_id, version)
);
CREATE INDEX IF NOT EXISTS map_style_versions_style_idx ON map_style_versions (style_id, version DESC);

CREATE TABLE IF NOT EXISTS map_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL DEFAULT '',
  active_style_version_id uuid REFERENCES map_style_versions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','unpublished','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS map_publications_status_idx ON map_publications (status, created_at DESC);

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS group_memberships (
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS resource_acl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES map_publications(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('user','role','group')),
  subject_id text NOT NULL CHECK (btrim(subject_id) <> ''),
  action text NOT NULL CHECK (action IN ('map:read')),
  granted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publication_id, subject_type, subject_id, action)
);
CREATE INDEX IF NOT EXISTS resource_acl_lookup_idx ON resource_acl (publication_id, action, subject_type, subject_id);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN ('inspect_dataset','build_tileset')),
  dataset_version_id uuid REFERENCES dataset_versions(id) ON DELETE CASCADE,
  tileset_version_id uuid REFERENCES tileset_versions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','canceled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  claimed_by text,
  lease_expires_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  log text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((job_type = 'inspect_dataset' AND dataset_version_id IS NOT NULL) OR (job_type = 'build_tileset' AND tileset_version_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS processing_jobs_claim_idx ON processing_jobs (status, created_at) WHERE status = 'queued';

-- Reuse the existing trigger function installed by 001_auth.sql.
DO $$
DECLARE item text;
BEGIN
  FOREACH item IN ARRAY ARRAY['datasets','dataset_versions','tilesets','tileset_versions','map_styles','map_publications','processing_jobs']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON %I', item, item);
    EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_auth_updated_at()', item, item);
  END LOOP;
END;
$$;
