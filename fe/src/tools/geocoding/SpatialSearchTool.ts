import type { FeatureCollection, Point } from "geojson";

import { authFetch } from "../../features/auth/authClient";

export interface SpatialSearchInput {
  referencePlace: string;
  distanceMeters: number;
  limit?: number;
}

export interface SpatialSearchProperties {
  name: string;
  category: string;
  kind: string;
  address: string;
  distanceMeters: number;
}

export interface SpatialSearchResult extends FeatureCollection<Point, SpatialSearchProperties> {
  reference: {
    name: string;
    category: string;
    kind: string;
  };
}

export async function fetchSpatialSearch(
  input: SpatialSearchInput,
  signal?: AbortSignal
): Promise<SpatialSearchResult> {
  const response = await authFetch("/api/spatial-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      intent: "poi_within_distance_of_place",
      referencePlace: input.referencePlace.trim(),
      distanceMeters: input.distanceMeters,
      limit: input.limit ?? 50,
    }),
  });

  if (!response.ok) {
    throw new Error(`Spatial search failed with status: ${response.status}`);
  }

  return (await response.json()) as SpatialSearchResult;
}
