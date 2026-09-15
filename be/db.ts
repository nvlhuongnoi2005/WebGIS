import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import type { AuthConfig } from "./config.js";
import type { PublicUser, RevocationEvent, SessionRecord, UserRecord, UserStatus } from "./types.js";

type Db = Pool | PoolClient;

type UserRow = {
  id: string; email: string; password_hash: string; status: UserStatus; auth_version: number;
  scopes: string[]; plan: string; full_name: string | null; date_of_birth: string | null;
  phone: string | null; organization: string | null; avatar_url: string | null;
};

const userFields = `id, email, password_hash, status, auth_version, scopes, plan,
  full_name, date_of_birth::text, phone, organization, avatar_url`;

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id, email: row.email, passwordHash: row.password_hash, status: row.status,
    authVersion: row.auth_version, scopes: row.scopes, plan: row.plan,
    name: row.full_name, dateOfBirth: row.date_of_birth, phone: row.phone,
    organization: row.organization, avatarUrl: row.avatar_url,
  };
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id, email: user.email, name: user.name ?? user.email,
    ...(user.dateOfBirth ? { dateOfBirth: user.dateOfBirth } : {}),
    ...(user.phone ? { phone: user.phone } : {}),
    ...(user.organization ? { organization: user.organization } : {}),
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    plan: user.plan, scopes: user.scopes,
  };
}

export class AuthRepository {
  readonly pool: Pool;

  constructor(config: Pick<AuthConfig, "databaseUrl">) {
    this.pool = new Pool({ connectionString: config.databaseUrl, max: 12 });
  }

  async close() { await this.pool.end(); }

  async migrate(): Promise<void> {
    const sql = await readFile(resolve(import.meta.dirname, "migrations/001_auth.sql"), "utf8");
    await this.pool.query(sql);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserByEmail(email: string, db: Db = this.pool): Promise<UserRecord | null> {
    const result = await db.query<UserRow>(`SELECT ${userFields} FROM users WHERE lower(email) = lower($1)`, [email]);
    return result.rowCount ? toUser(result.rows[0]) : null;
  }

  async findUserById(id: string, db: Db = this.pool): Promise<UserRecord | null> {
    const result = await db.query<UserRow>(`SELECT ${userFields} FROM users WHERE id = $1`, [id]);
    return result.rowCount ? toUser(result.rows[0]) : null;
  }

  async createUser(input: {
    email: string; passwordHash: string; name?: string; dateOfBirth?: string; phone?: string; organization?: string;
  }, db: Db = this.pool): Promise<UserRecord> {
    const result = await db.query<UserRow>(
      `INSERT INTO users (email, password_hash, full_name, date_of_birth, phone, organization)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${userFields}`,
      [input.email, input.passwordHash, input.name ?? null, input.dateOfBirth ?? null, input.phone ?? null, input.organization ?? null],
    );
    return toUser(result.rows[0]);
  }

  async setLastLogin(userId: string, db: Db = this.pool): Promise<void> {
    await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [userId]);
  }

  async createSession(input: {
    userId: string; refreshTokenHash: string; expiresAt: Date; userAgent?: string; ipAddress?: string;
  }, db: Db = this.pool): Promise<SessionRecord> {
    const result = await db.query<{
      id: string; user_id: string; refresh_token_hash: string; expires_at: Date; revoked_at: Date | null;
    }>(`INSERT INTO sessions (user_id, refresh_token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, user_id, refresh_token_hash, expires_at, revoked_at`,
      [input.userId, input.refreshTokenHash, input.expiresAt, input.userAgent ?? null, input.ipAddress ?? null],
    );
    const row = result.rows[0];
    return { id: row.id, userId: row.user_id, refreshTokenHash: row.refresh_token_hash, expiresAt: row.expires_at, revokedAt: row.revoked_at };
  }

  async findSessionForRefresh(hash: string, db: Db): Promise<SessionRecord | null> {
    const result = await db.query<{
      id: string; user_id: string; refresh_token_hash: string; expires_at: Date; revoked_at: Date | null;
    }>(`SELECT id, user_id, refresh_token_hash, expires_at, revoked_at FROM sessions
       WHERE refresh_token_hash = $1 FOR UPDATE`, [hash]);
    if (!result.rowCount) return null;
    const row = result.rows[0];
    return { id: row.id, userId: row.user_id, refreshTokenHash: row.refresh_token_hash, expiresAt: row.expires_at, revokedAt: row.revoked_at };
  }

  async findRefreshHistory(hash: string, db: Db): Promise<{ sessionId: string; userId: string } | null> {
    const result = await db.query<{ session_id: string; user_id: string }>(
      "SELECT session_id, user_id FROM refresh_token_history WHERE refresh_token_hash = $1 AND expires_at > now()",
      [hash],
    );
    return result.rowCount ? { sessionId: result.rows[0].session_id, userId: result.rows[0].user_id } : null;
  }

  async rotateRefreshToken(session: SessionRecord, nextHash: string, db: Db): Promise<void> {
    await db.query(
      `INSERT INTO refresh_token_history (refresh_token_hash, session_id, user_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [session.refreshTokenHash, session.id, session.userId, session.expiresAt],
    );
    const update = await db.query(
      `UPDATE sessions SET refresh_token_hash = $1, last_used_at = now()
       WHERE id = $2 AND refresh_token_hash = $3 AND revoked_at IS NULL`,
      [nextHash, session.id, session.refreshTokenHash],
    );
    if (update.rowCount !== 1) throw new Error("Refresh rotation race detected.");
  }

  async revokeSession(sessionId: string, db: Db = this.pool): Promise<{ userId: string } | null> {
    const result = await db.query<{ user_id: string }>(
      "UPDATE sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 RETURNING user_id", [sessionId],
    );
    return result.rowCount ? { userId: result.rows[0].user_id } : null;
  }

  async revokeAllSessions(userId: string, db: Db): Promise<void> {
    await db.query("UPDATE sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
  }

  async incrementAuthVersion(userId: string, db: Db): Promise<number> {
    const result = await db.query<{ auth_version: number }>(
      "UPDATE users SET auth_version = auth_version + 1 WHERE id = $1 RETURNING auth_version", [userId],
    );
    if (!result.rowCount) throw new Error("User not found.");
    return result.rows[0].auth_version;
  }

  async updatePassword(userId: string, passwordHash: string, db: Db): Promise<number> {
    const result = await db.query<{ auth_version: number }>(
      `UPDATE users SET password_hash = $1, auth_version = auth_version + 1
       WHERE id = $2 RETURNING auth_version`, [passwordHash, userId],
    );
    if (!result.rowCount) throw new Error("User not found.");
    return result.rows[0].auth_version;
  }

  async disableUser(userId: string, db: Db): Promise<number | null> {
    const result = await db.query<{ auth_version: number }>(
      `UPDATE users SET status = 'DISABLED', auth_version = auth_version + 1
       WHERE id = $1 AND status <> 'DISABLED' RETURNING auth_version`, [userId],
    );
    return result.rowCount ? result.rows[0].auth_version : null;
  }

  async updateProfile(userId: string, input: { email?: string; phone?: string; avatarUrl?: string }, db: Db = this.pool): Promise<UserRecord> {
    const result = await db.query<UserRow>(
      `UPDATE users SET email = COALESCE($1, email), phone = COALESCE($2, phone), avatar_url = COALESCE($3, avatar_url)
       WHERE id = $4 RETURNING ${userFields}`,
      [input.email ?? null, input.phone ?? null, input.avatarUrl ?? null, userId],
    );
    if (!result.rowCount) throw new Error("User not found.");
    return toUser(result.rows[0]);
  }

  async reserveQuota(userId: string, units: number, db: Db = this.pool): Promise<boolean> {
    const result = await db.query(
      `UPDATE user_quotas SET used_units = used_units + $2, updated_at = now()
       WHERE user_id = $1 AND period_start <= now() AND period_end > now()
       AND used_units + $2 <= limit_units`, [userId, units],
    );
    return result.rowCount === 1;
  }

  async publish(event: RevocationEvent, db: Db): Promise<void> {
    await db.query("INSERT INTO auth_events (type, payload) VALUES ($1, $2::jsonb)", [event.type, JSON.stringify(event)]);
  }

  async eventsAfter(id: number): Promise<Array<{ id: number; event: RevocationEvent }>> {
    const result = await this.pool.query<{ id: string; payload: RevocationEvent }>(
      "SELECT id, payload FROM auth_events WHERE id > $1 ORDER BY id ASC", [id],
    );
    return result.rows.map(row => ({ id: Number(row.id), event: row.payload }));
  }

  async checkpoint(consumerName: string): Promise<number> {
    const result = await this.pool.query<{ event_id: string }>(
      "SELECT event_id FROM auth_event_checkpoints WHERE consumer_name = $1", [consumerName],
    );
    return result.rowCount ? Number(result.rows[0].event_id) : 0;
  }

  async saveCheckpoint(consumerName: string, eventId: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_event_checkpoints (consumer_name, event_id) VALUES ($1, $2)
       ON CONFLICT (consumer_name) DO UPDATE SET event_id = EXCLUDED.event_id, updated_at = now()`, [consumerName, eventId],
    );
  }
}
