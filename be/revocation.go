package main

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

type RevocationStore struct {
	mu                                            sync.RWMutex
	revokedSessions, revokedTokens, disabledUsers map[string]struct{}
	minAuthVersion                                map[string]int
	ready                                         bool
	lastEventID                                   int64
	onApplied                                     func(RevocationEvent)
}

func NewRevocationStore() *RevocationStore {
	return &RevocationStore{revokedSessions: map[string]struct{}{}, revokedTokens: map[string]struct{}{}, disabledUsers: map[string]struct{}{}, minAuthVersion: map[string]int{}}
}

func (store *RevocationStore) Apply(event RevocationEvent) {
	store.mu.Lock()
	switch event.Type {
	case "SessionRevoked":
		store.revokedSessions[event.SessionID] = struct{}{}
	case "UserDisabled":
		store.disabledUsers[event.UserID] = struct{}{}
		if event.AuthVersion > store.minAuthVersion[event.UserID] {
			store.minAuthVersion[event.UserID] = event.AuthVersion
		}
	case "PasswordChanged", "UserSessionsRevoked", "UserAccessChanged":
		if event.AuthVersion > store.minAuthVersion[event.UserID] {
			store.minAuthVersion[event.UserID] = event.AuthVersion
		}
	}
	onApplied := store.onApplied
	store.mu.Unlock()
	if onApplied != nil {
		onApplied(event)
	}
}

func (store *RevocationStore) SetOnApplied(callback func(RevocationEvent)) {
	store.mu.Lock()
	store.onApplied = callback
	store.mu.Unlock()
}

func (store *RevocationStore) Rejects(claims Claims) bool {
	store.mu.RLock()
	defer store.mu.RUnlock()
	_, sessionRevoked := store.revokedSessions[claims.SessionID]
	_, tokenRevoked := store.revokedTokens[claims.TokenID]
	_, disabled := store.disabledUsers[claims.Subject]
	return sessionRevoked || tokenRevoked || disabled || claims.AuthVersion < store.minAuthVersion[claims.Subject]
}

func (store *RevocationStore) Ready() bool {
	store.mu.RLock()
	defer store.mu.RUnlock()
	return store.ready
}
func (store *RevocationStore) Unavailable() { store.mu.Lock(); store.ready = false; store.mu.Unlock() }

func (store *RevocationStore) Synchronize(ctx context.Context, repository *Repository, consumer string) error {
	store.mu.RLock()
	cursor := store.lastEventID
	store.mu.RUnlock()
	if cursor == 0 {
		if err := repository.pool.QueryRow(ctx, `SELECT event_id FROM auth_event_checkpoints WHERE consumer_name=$1`, consumer).Scan(&cursor); err != nil && err != pgx.ErrNoRows {
			return err
		}
	}
	for {
		rows, err := repository.pool.Query(ctx, `SELECT id,payload FROM auth_events WHERE id > $1 ORDER BY id ASC LIMIT 1000`, cursor)
		if err != nil {
			return err
		}
		count := 0
		for rows.Next() {
			var id int64
			var payload []byte
			if err := rows.Scan(&id, &payload); err != nil {
				rows.Close()
				return err
			}
			var event RevocationEvent
			if err := json.Unmarshal(payload, &event); err != nil {
				rows.Close()
				return err
			}
			store.Apply(event)
			cursor = id
			count++
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return err
		}
		rows.Close()
		if count == 0 {
			break
		}
	}
	_, err := repository.pool.Exec(ctx, `INSERT INTO auth_event_checkpoints (consumer_name,event_id) VALUES ($1,$2) ON CONFLICT (consumer_name) DO UPDATE SET event_id=EXCLUDED.event_id,updated_at=now()`, consumer, cursor)
	if err != nil {
		return err
	}
	store.mu.Lock()
	store.lastEventID = cursor
	store.ready = true
	store.mu.Unlock()
	return nil
}

func startRevocationSynchronizer(ctx context.Context, repository *Repository, store *RevocationStore, consumer string) error {
	if err := store.Synchronize(ctx, repository, consumer); err != nil {
		return err
	}
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := store.Synchronize(ctx, repository, consumer); err != nil {
					store.Unavailable()
				}
			}
		}
	}()
	return nil
}
