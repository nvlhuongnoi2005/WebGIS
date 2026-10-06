package main

import (
	"encoding/json"
	"testing"
)

func TestSpatialReferenceDecodesNominatimType(t *testing.T) {
	var reference spatialReference
	if err := json.Unmarshal([]byte(`{"name":"Hồ Tây","category":"water","type":"lake","geojson":{"type":"Polygon","coordinates":[]}}`), &reference); err != nil {
		t.Fatal(err)
	}
	if reference.Kind != "lake" {
		t.Fatalf("Kind = %q, want lake", reference.Kind)
	}
}

func TestSpatialSearchInputValidate(t *testing.T) {
	tests := []struct {
		name    string
		input   spatialSearchInput
		wantErr bool
	}{
		{
			name: "valid request applies default limit",
			input: spatialSearchInput{
				Intent: spatialSearchIntent, ReferencePlace: "Hồ Tây", DistanceMeters: 500,
			},
		},
		{
			name: "distance outside accepted range",
			input: spatialSearchInput{
				Intent: spatialSearchIntent, ReferencePlace: "Hồ Tây", DistanceMeters: 20_001,
			},
			wantErr: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := test.input.validate()
			if (err != nil) != test.wantErr {
				t.Fatalf("validate() error = %v, wantErr %t", err, test.wantErr)
			}
			if !test.wantErr && test.input.Limit != 50 {
				t.Fatalf("Limit = %d, want 50", test.input.Limit)
			}
		})
	}
}
