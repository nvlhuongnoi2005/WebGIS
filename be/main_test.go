package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

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

func TestTileProxyForwardsOnlySafeTilePaths(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/datas/asia_full/0/0/0.png" {
			t.Fatalf("unexpected worker path: %s", request.URL.Path)
		}
		if request.Header.Get("X-Request-Id") != "request-1" {
			t.Fatal("request id was not forwarded")
		}
		response.Header().Set("Cache-Control", "public, max-age=60")
		response.Header().Set("Content-Type", "image/png")
		_, _ = response.Write([]byte("tile"))
	}))
	defer upstream.Close()

	server := &Server{config: Config{TileServerURL: upstream.URL}, workerClient: upstream.Client()}
	request := httptest.NewRequest(http.MethodGet, "/api/tiles/datas/asia_full/0/0/0.png", nil)
	request.Header.Set("X-Request-Id", "request-1")
	response := httptest.NewRecorder()
	server.tileProxy(response, request, "/datas/asia_full/0/0/0.png")
	if response.Code != http.StatusOK || response.Body.String() != "tile" {
		t.Fatalf("unexpected tile response: status=%d body=%q", response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "public, max-age=60" {
		t.Fatal("cache header was not forwarded")
	}

	blocked := httptest.NewRecorder()
	server.tileProxy(blocked, httptest.NewRequest(http.MethodGet, "/api/tiles/../secret", nil), "/../secret")
	if blocked.Code != http.StatusNotFound {
		t.Fatalf("unsafe path returned %d, want 404", blocked.Code)
	}
}
