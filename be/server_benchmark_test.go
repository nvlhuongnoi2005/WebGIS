package main

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// BenchmarkSuggestionProxy measures the Controller's HTTP call to the
// Elasticsearch autocomplete worker. The worker is local and deterministic, so
// the result excludes network, PostgreSQL authentication/quota work, and the
// real Elasticsearch index. It is suitable for comparing code changes on the
// same machine.
func BenchmarkSuggestionProxy(b *testing.B) {
	payload := []byte(`{"hits":{"hits":[{"_id":"1","_source":{"name":"Hà Nội"}}]}}`)
	worker := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost || request.URL.Path != "/webgis-suggestions/_search" {
			http.NotFound(response, request)
			return
		}
		_, _ = io.Copy(io.Discard, request.Body)
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write(payload)
	}))
	b.Cleanup(worker.Close)

	query := map[string]any{
		"size": 6,
		"query": map[string]any{
			"match": map[string]any{"name_normalized": "ha noi"},
		},
	}

	b.SetBytes(int64(len(payload)))
	b.ReportAllocs()
	b.ResetTimer()
	b.RunParallel(func(parallel *testing.PB) {
		for parallel.Next() {
			response, err := elasticRequest(context.Background(), worker.Client(), http.MethodPost, worker.URL+"/webgis-suggestions/_search", query)
			if err != nil {
				b.Error(err)
				continue
			}
			if response.StatusCode != http.StatusOK {
				b.Errorf("suggestion worker status = %d", response.StatusCode)
			}
			_, _ = io.Copy(io.Discard, response.Body)
			_ = response.Body.Close()
		}
	})
	b.StopTimer()
	b.ReportMetric(float64(b.N)/b.Elapsed().Seconds(), "req/s")
}
