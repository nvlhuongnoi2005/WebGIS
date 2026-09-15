package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DB interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(ctx context.Context, config Config) (*Repository, error) {
	pool, err := pgxpool.New(ctx, config.DatabaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Repository{pool: pool}, nil
}

func (repository *Repository) Close() { repository.pool.Close() }

const userColumns = `id, email, password_hash, status, auth_version, scopes, plan, full_name, date_of_birth::text, phone, organization, avatar_url`

func scanUser(row pgx.Row) (User, error) {
	var user User
	err := row.Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Status, &user.AuthVersion, &user.Scopes, &user.Plan, &user.Name, &user.DateOfBirth, &user.Phone, &user.Organization, &user.AvatarURL)
	return user, err
}

func (repository *Repository) UserByEmail(ctx context.Context, q DB, email string) (User, error) {
	return scanUser(q.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE lower(email) = lower($1)`, email))
}
func (repository *Repository) UserByID(ctx context.Context, q DB, id string) (User, error) {
	return scanUser(q.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id))
}

func (repository *Repository) CreateUser(ctx context.Context, q DB, email, hash string, input registerInput) (User, error) {
	return scanUser(q.QueryRow(ctx, `INSERT INTO users (email, password_hash, full_name, date_of_birth, phone, organization) VALUES ($1,$2,$3,$4,$5,$6) RETURNING `+userColumns, email, hash, input.Name, nullable(input.DateOfBirth), nullable(input.Phone), nullable(input.Organization)))
}

func (repository *Repository) CreateSession(ctx context.Context, q DB, userID, hash, agent, ip string, expires time.Time) (Session, error) {
	var session Session
	err := q.QueryRow(ctx, `INSERT INTO sessions (user_id, refresh_token_hash, expires_at, user_agent, ip_address) VALUES ($1,$2,$3,$4,$5) RETURNING id,user_id,refresh_token_hash,expires_at,revoked_at`, userID, hash, expires, nullable(agent), nullable(ip)).Scan(&session.ID, &session.UserID, &session.RefreshTokenHash, &session.ExpiresAt, &session.RevokedAt)
	return session, err
}

func (repository *Repository) SessionForRefresh(ctx context.Context, q DB, hash string) (Session, error) {
	var session Session
	err := q.QueryRow(ctx, `SELECT id,user_id,refresh_token_hash,expires_at,revoked_at FROM sessions WHERE refresh_token_hash=$1 FOR UPDATE`, hash).Scan(&session.ID, &session.UserID, &session.RefreshTokenHash, &session.ExpiresAt, &session.RevokedAt)
	return session, err
}

func (repository *Repository) RefreshHistory(ctx context.Context, q DB, hash string) (string, string, error) {
	var sessionID, userID string
	err := q.QueryRow(ctx, `SELECT session_id,user_id FROM refresh_token_history WHERE refresh_token_hash=$1 AND expires_at > now()`, hash).Scan(&sessionID, &userID)
	return sessionID, userID, err
}

func (repository *Repository) RotateRefresh(ctx context.Context, q DB, session Session, nextHash string) error {
	if _, err := q.Exec(ctx, `INSERT INTO refresh_token_history (refresh_token_hash,session_id,user_id,expires_at) VALUES ($1,$2,$3,$4)`, session.RefreshTokenHash, session.ID, session.UserID, session.ExpiresAt); err != nil {
		return err
	}
	result, err := q.Exec(ctx, `UPDATE sessions SET refresh_token_hash=$1,last_used_at=now() WHERE id=$2 AND refresh_token_hash=$3 AND revoked_at IS NULL`, nextHash, session.ID, session.RefreshTokenHash)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return fmt.Errorf("refresh rotation race")
	}
	return nil
}

func (repository *Repository) Publish(ctx context.Context, q DB, event RevocationEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}
	_, err = q.Exec(ctx, `INSERT INTO auth_events (type,payload) VALUES ($1,$2::jsonb)`, event.Type, payload)
	return err
}

func (repository *Repository) Migrate(ctx context.Context) error {
	paths := []string{"be/migrations/001_auth.sql", "migrations/001_auth.sql", "/migrations/001_auth.sql"}
	for _, path := range paths {
		if sql, err := os.ReadFile(filepath.Clean(path)); err == nil {
			_, err = repository.pool.Exec(ctx, string(sql))
			return err
		}
	}
	return fmt.Errorf("cannot find migrations/001_auth.sql")
}

func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func publicUser(user User) map[string]any {
	result := map[string]any{"id": user.ID, "email": user.Email, "plan": user.Plan, "scopes": user.Scopes}
	if user.Name != nil {
		result["name"] = *user.Name
	} else {
		result["name"] = user.Email
	}
	if user.DateOfBirth != nil {
		result["dateOfBirth"] = *user.DateOfBirth
	}
	if user.Phone != nil {
		result["phone"] = *user.Phone
	}
	if user.Organization != nil {
		result["organization"] = *user.Organization
	}
	if user.AvatarURL != nil {
		result["avatarUrl"] = *user.AvatarURL
	}
	return result
}
