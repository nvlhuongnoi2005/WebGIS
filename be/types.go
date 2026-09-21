package main

import "time"

type User struct {
	ID, Email, PasswordHash, Status string
	AuthVersion                     int
	Scopes                          []string
	Plan, Role                      string
	Name, DateOfBirth               *string
	Phone, Organization, AvatarURL  *string
}

type Session struct {
	ID, UserID, RefreshTokenHash string
	ExpiresAt                    time.Time
	RevokedAt                    *time.Time
}

type Claims struct {
	Subject, SessionID, TokenID string
	AuthVersion                 int
	Scopes                      []string
	Plan, Role                  string
}

type RevocationEvent struct {
	Type        string `json:"type"`
	UserID      string `json:"user_id,omitempty"`
	SessionID   string `json:"sid,omitempty"`
	AuthVersion int    `json:"auth_version,omitempty"`
	KeyID       string `json:"key_id,omitempty"`
	Timestamp   string `json:"timestamp"`
}
