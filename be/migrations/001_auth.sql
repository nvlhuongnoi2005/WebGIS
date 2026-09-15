-- This schema is safe to apply to the existing PostGIS database. It does not
-- alter spatial tables. pgcrypto is used only for UUID defaults.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED', 'LOCKED')),
  auth_version integer NOT NULL DEFAULT 1 CHECK (auth_version >= 1),
  scopes text[] NOT NULL DEFAULT ARRAY['map:read', 'route:calculate', 'service-a:use'],
  plan text NOT NULL DEFAULT 'free',
  full_name text,
  date_of_birth date,
  phone text,
  organization text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_address inet
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_refresh_token_hash_idx ON sessions (refresh_token_hash);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

-- Rotated refresh hashes are retained until their original expiry solely to
-- detect token replay. No plaintext refresh token is ever stored.
CREATE TABLE IF NOT EXISTS refresh_token_history (
  refresh_token_hash text PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_token_history_session_id_idx ON refresh_token_history (session_id);
CREATE INDEX IF NOT EXISTS refresh_token_history_expires_at_idx ON refresh_token_history (expires_at);

-- Durable event log: gateways replay this table after restart before accepting
-- traffic. Replace its consumer with Redis Streams/NATS/Kafka in multi-region.
CREATE TABLE IF NOT EXISTS auth_events (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  type text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_event_checkpoints (
  consumer_name text PRIMARY KEY,
  event_id bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Quota is intentionally separate from identity. A paid gateway route makes
-- one atomic quota update, but authentication itself does not query users.
CREATE TABLE IF NOT EXISTS user_quotas (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  limit_units integer NOT NULL CHECK (limit_units >= 0),
  used_units integer NOT NULL DEFAULT 0 CHECK (used_units >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_auth_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_auth_updated_at();
