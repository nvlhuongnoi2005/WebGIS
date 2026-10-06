package main

import "testing"

func TestDetectUploadFormatStoresUnknownExtensionAsRaw(t *testing.T) {
	if got := detectUploadFormat("survey.bpf"); got != "raw/bpf" {
		t.Fatalf("detectUploadFormat() = %q, want raw/bpf", got)
	}
	if got := detectUploadFormat("roads.shp"); got != "raw/shp" {
		t.Fatalf("detectUploadFormat() = %q, want raw/shp", got)
	}
}

func TestGISStyleRejectsDirectTileURLs(t *testing.T) {
	_, ok := gisStyleSourceIDs([]byte(`{"version":8,"sources":{"private":{"type":"vector","tilesetVersionId":"550e8400-e29b-41d4-a716-446655440000","tiles":["https://example.invalid/{z}"]}}}`))
	if ok {
		t.Fatal("style with direct tile URL must be rejected")
	}
}

func TestGISStyleRequiresManagedUUID(t *testing.T) {
	ids, ok := gisStyleSourceIDs([]byte(`{"version":8,"sources":{"private":{"type":"vector","tilesetVersionId":"550e8400-e29b-41d4-a716-446655440000"}}}`))
	if !ok || len(ids) != 1 {
		t.Fatalf("managed style was rejected: %v %v", ids, ok)
	}
}

func TestTilePathValidation(t *testing.T) {
	if !validTilePath("8/190/101.pbf") {
		t.Fatal("valid tile path rejected")
	}
	for _, value := range []string{"../secret.pbf", "8/../x.pbf", "8/190/101.png", "8/190/101/extra.pbf"} {
		if validTilePath(value) {
			t.Fatalf("invalid tile path accepted: %s", value)
		}
	}
}
