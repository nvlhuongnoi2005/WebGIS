package main

import "testing"

func TestSpatialSearchInputValidate(t *testing.T) {
	tests := []struct {
		name    string
		input   spatialSearchInput
		wantErr bool
	}{
		{
			name: "valid request applies default limit",
			input: spatialSearchInput{
				Intent: spatialSearchIntent, Category: " Restaurant ", ReferencePlace: "Hồ Tây", DistanceMeters: 500,
			},
		},
		{
			name: "unsupported category",
			input: spatialSearchInput{
				Intent: spatialSearchIntent, Category: "bar", ReferencePlace: "Hồ Tây", DistanceMeters: 500,
			},
			wantErr: true,
		},
		{
			name: "distance outside accepted range",
			input: spatialSearchInput{
				Intent: spatialSearchIntent, Category: "cafe", ReferencePlace: "Hồ Tây", DistanceMeters: 20_001,
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
