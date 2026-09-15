package main

import "testing"

func TestArgon2idPasswordRoundTrip(t *testing.T) {
	service := NewPasswordService(Config{ArgonMemory: 8192, ArgonTime: 1, ArgonParallelism: 1, ArgonHashLength: 32})
	hash, err := service.Hash("Lapnv@2005")
	if err != nil {
		t.Fatal(err)
	}
	if !service.Verify(hash, "Lapnv@2005") {
		t.Fatal("valid password was rejected")
	}
	if service.Verify(hash, "wrong-password") {
		t.Fatal("invalid password was accepted")
	}
	if hash[:10] != "$argon2id$" {
		t.Fatalf("unexpected hash format: %s", hash)
	}
}

func TestPasswordPolicy(t *testing.T) {
	if got := validatePassword("Lapnv@2005"); got != "" {
		t.Fatalf("expected valid password, got %q", got)
	}
	if got := validatePassword("short"); got == "" {
		t.Fatal("expected weak password rejection")
	}
}

func TestEdDSAAccessToken(t *testing.T) {
	config := Config{Issuer: "auth-service", Audience: "api-gateway", KeyID: "test-key", AccessTTL: 60, AllowEphemeral: true}
	service, err := NewTokenService(config)
	if err != nil {
		t.Fatal(err)
	}
	user := User{ID: "user-1", AuthVersion: 1, Scopes: []string{"map:read"}, Plan: "free"}
	token, _, err := service.Issue(user, "session-1")
	if err != nil {
		t.Fatal(err)
	}
	claims, err := service.Verify(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.Subject != user.ID || claims.SessionID != "session-1" || !hasScope(claims, "map:read") {
		t.Fatal("token claims did not round-trip")
	}
}
