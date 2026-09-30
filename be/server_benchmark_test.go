package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func newBenchmarkServer(b *testing.B) *Server {
	b.Helper()
	config := Config{
		AllowEphemeral: true,
		Issuer:         "webgis-benchmark",
		Audience:       "webgis-benchmark",
		AccessTTL:      60,
		AppOrigins:     "http://localhost:8080",
	}
	tokens, err := NewTokenService(config)
	if err != nil {
		b.Fatalf("NewTokenService() error = %v", err)
	}
	revocations := NewRevocationStore()
	revocations.ready = true
	return &Server{config: config, tokens: tokens, revocations: revocations}
}

// BenchmarkHealthEndpoint measures the in-process Controller request path.
// It includes request and response-recorder allocation, but excludes TCP,
// Docker, database, and map-worker latency.
func BenchmarkHealthEndpoint(b *testing.B) {
	server := newBenchmarkServer(b)
	response := httptest.NewRecorder()
	server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/health", nil))
	if response.Code != http.StatusOK {
		b.Fatalf("health check status = %d", response.Code)
	}

	b.ReportAllocs()
	b.ResetTimer()
	b.RunParallel(func(parallel *testing.PB) {
		for parallel.Next() {
			server.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/health", nil))
		}
	})
	b.StopTimer()
	b.ReportMetric(float64(b.N)/b.Elapsed().Seconds(), "req/s")
}

// BenchmarkTileProxy measures a full Controller-to-worker HTTP proxy request
// against a local in-memory Tile Server. The synthetic response is 1 KiB and
// allows the gateway's forwarding overhead to be measured reproducibly.
func BenchmarkTileProxy(b *testing.B) {
	payload := make([]byte, 1024)
	for index := range payload {
		payload[index] = byte(index % 251)
	}
	worker := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/datas/benchmark/0/0/0.png" {
			http.NotFound(response, request)
			return
		}
		response.Header().Set("Content-Type", "image/png")
		response.Header().Set("Cache-Control", "public, max-age=60")
		_, _ = response.Write(payload)
	}))
	b.Cleanup(worker.Close)

	server := newBenchmarkServer(b)
	server.config.TileServerURL = worker.URL
	server.workerClient = worker.Client()
	response := httptest.NewRecorder()
	server.tileProxy(response, httptest.NewRequest(http.MethodGet, "/api/tiles/datas/benchmark/0/0/0.png", nil), "/datas/benchmark/0/0/0.png")
	if response.Code != http.StatusOK || response.Body.Len() != len(payload) {
		b.Fatalf("tile proxy response = status %d, bytes %d", response.Code, response.Body.Len())
	}

	b.SetBytes(int64(len(payload)))
	b.ReportAllocs()
	b.ResetTimer()
	b.RunParallel(func(parallel *testing.PB) {
		for parallel.Next() {
			server.tileProxy(
				httptest.NewRecorder(),
				httptest.NewRequest(http.MethodGet, "/api/tiles/datas/benchmark/0/0/0.png", nil),
				"/datas/benchmark/0/0/0.png",
			)
		}
	})
	b.StopTimer()
	b.ReportMetric(float64(b.N)/b.Elapsed().Seconds(), "req/s")
}
