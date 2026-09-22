package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBillingDays(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		url  string
		want int
	}{
		{name: "one day", url: "/api/billing?range=1", want: 1},
		{name: "seven days is default", url: "/api/billing?range=7", want: 7},
		{name: "thirty days", url: "/api/billing?range=30", want: 30},
		{name: "unknown range is default", url: "/api/billing?range=365", want: 7},
		{name: "missing range is default", url: "/api/billing", want: 7},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, test.url, nil)
			if got := billingDays(request); got != test.want {
				t.Fatalf("billingDays() = %d, want %d", got, test.want)
			}
		})
	}
}

func TestAdminBillingAPIsRequireAuthentication(t *testing.T) {
	t.Parallel()
	config := Config{AllowEphemeral: true, Issuer: "test", Audience: "test", AccessTTL: 60}
	tokens, err := NewTokenService(config)
	if err != nil {
		t.Fatalf("NewTokenService() error = %v", err)
	}
	revocations := NewRevocationStore()
	revocations.ready = true
	server := &Server{config: config, tokens: tokens, revocations: revocations}

	for _, path := range []string{"/api/admin/dashboard", "/api/admin/billing", "/api/admin/billing/account-123"} {
		t.Run(path, func(t *testing.T) {
			response := httptest.NewRecorder()
			server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
			if response.Code != http.StatusUnauthorized {
				t.Fatalf("GET %s status = %d, want %d; body=%s", path, response.Code, http.StatusUnauthorized, response.Body.String())
			}
			if got := response.Header().Get("Content-Type"); got != "application/json; charset=utf-8" {
				t.Fatalf("GET %s Content-Type = %q, want JSON", path, got)
			}
		})
	}
}
