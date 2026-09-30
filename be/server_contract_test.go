package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newContractTestServer(t *testing.T) *Server {
	t.Helper()
	config := Config{
		AllowEphemeral: true,
		Issuer:         "webgis-test",
		Audience:       "webgis-test",
		AccessTTL:      60,
		AppOrigins:     "http://localhost:5173,http://localhost:8080",
	}
	tokens, err := NewTokenService(config)
	if err != nil {
		t.Fatalf("NewTokenService() error = %v", err)
	}
	revocations := NewRevocationStore()
	revocations.ready = true
	return &Server{config: config, tokens: tokens, revocations: revocations}
}

func TestHealthAndCORSContract(t *testing.T) {
	server := newContractTestServer(t)

	t.Run("health is ready when revocations are synchronized", func(t *testing.T) {
		response := httptest.NewRecorder()
		server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/health", nil))
		if response.Code != http.StatusOK || response.Body.String() != "{\"ok\":true}\n" {
			t.Fatalf("GET /health = status %d, body %q", response.Code, response.Body.String())
		}
	})

	t.Run("allowed origin receives credentialed CORS headers", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodOptions, "/api/gateway/route", nil)
		request.Header.Set("Origin", "http://localhost:8080")
		response := httptest.NewRecorder()
		server.ServeHTTP(response, request)
		if response.Code != http.StatusNoContent {
			t.Fatalf("OPTIONS status = %d, want %d", response.Code, http.StatusNoContent)
		}
		if response.Header().Get("Access-Control-Allow-Origin") != "http://localhost:8080" {
			t.Fatalf("unexpected allowed origin: %q", response.Header().Get("Access-Control-Allow-Origin"))
		}
		if response.Header().Get("Access-Control-Allow-Credentials") != "true" {
			t.Fatal("credentialed CORS header is missing")
		}
	})

	t.Run("unknown origin is rejected", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/health", nil)
		request.Header.Set("Origin", "https://untrusted.example")
		response := httptest.NewRecorder()
		server.ServeHTTP(response, request)
		if response.Code != http.StatusForbidden {
			t.Fatalf("untrusted origin status = %d, want %d", response.Code, http.StatusForbidden)
		}
	})
}

func TestProtectedWebGISAPIsRejectAnonymousRequests(t *testing.T) {
	server := newContractTestServer(t)
	paths := []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/api/gateway/route"},
		{http.MethodPost, "/api/gateway/elevation"},
		{http.MethodGet, "/api/nominatim/search?q=ha-noi"},
		{http.MethodPost, "/api/shares"},
		{http.MethodGet, "/api/admin/users"},
	}

	for _, test := range paths {
		t.Run(test.method+" "+test.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			server.ServeHTTP(response, httptest.NewRequest(test.method, test.path, nil))
			if response.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d; body=%s", response.Code, http.StatusUnauthorized, response.Body.String())
			}
		})
	}
}

func TestNominatimProxyRejectsUnsafeRequestsBeforeWorkerAccess(t *testing.T) {
	server := newContractTestServer(t)

	for _, test := range []struct {
		name       string
		method     string
		workerPath string
		wantStatus int
	}{
		{name: "write methods", method: http.MethodPost, workerPath: "/search", wantStatus: http.StatusMethodNotAllowed},
		{name: "parent path", method: http.MethodGet, workerPath: "/../status", wantStatus: http.StatusNotFound},
		{name: "windows separator", method: http.MethodGet, workerPath: "/search\\private", wantStatus: http.StatusNotFound},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			server.nominatimProxy(response, httptest.NewRequest(test.method, "/api/nominatim", nil), test.workerPath)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d", response.Code, test.wantStatus)
			}
		})
	}
}

func TestGeoJSONShareValidationContract(t *testing.T) {
	validPoint := []byte(`{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Hồ Tây"},"geometry":{"type":"Point","coordinates":[105.82,21.06]}}]}`)
	validCollection := []byte(`{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"GeometryCollection","geometries":[{"type":"Point","coordinates":[105.8,21.0]}]}}]}`)
	invalidInputs := []struct {
		name string
		value []byte
	}{
		{name: "empty collection", value: []byte(`{"type":"FeatureCollection","features":[]}`)},
		{name: "unsupported geometry", value: []byte(`{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Circle","coordinates":[1,2]}}]}`)},
		{name: "coordinates must be an array", value: []byte(`{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":"1,2"}}]}`)},
		{name: "invalid json", value: []byte(`{"type":"FeatureCollection"}`)},
	}

	if !validSharedGeoJSON(validPoint) || !validSharedGeoJSON(validCollection) {
		t.Fatal("valid GeoJSON share input was rejected")
	}
	for _, test := range invalidInputs {
		t.Run(test.name, func(t *testing.T) {
			if validSharedGeoJSON(test.value) {
				t.Fatalf("invalid GeoJSON was accepted: %s", test.value)
			}
		})
	}

	preview := createGeoJSONPreviewSVG(validPoint)
	if !strings.Contains(preview, "<svg") || !strings.Contains(preview, "<circle") {
		t.Fatalf("point preview was not generated: %q", preview)
	}
}

func TestShareIdentifiersAndOpenAPIContract(t *testing.T) {
	if !validShareID("b30e4c0b-6eae-437a-809c-d2fb78d2b1cc") {
		t.Fatal("valid UUID share id was rejected")
	}
	for _, id := range []string{"", "not-a-uuid", "b30e4c0b-6eae-437a-809c-d2fb78d2b1cg"} {
		if validShareID(id) {
			t.Fatalf("invalid share id was accepted: %q", id)
		}
	}

	paths, ok := openAPISpec()["paths"].(map[string]any)
	if !ok {
		t.Fatal("OpenAPI paths are missing")
	}
	for _, path := range []string{"/api/gateway/route", "/api/gateway/elevation", "/api/nominatim/search", "/api/shares", "/api/tiles/{path}"} {
		if paths[path] == nil {
			t.Fatalf("OpenAPI path is missing: %s", path)
		}
	}
}
