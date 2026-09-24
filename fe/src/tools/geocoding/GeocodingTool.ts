import type { Geometry } from "geojson";

import { authFetch } from "../../features/auth/authClient";
import type { MapCoordinates } from "../../types/map";

export interface GeocodingFeature {
  id: string;
  type: string;
  place_name: string;
  text: string;
  context?: string;
  center: MapCoordinates;
  /** Native GeoJSON geometry returned by Nominatim, not only a centroid. */
  geometry: Geometry;
  bbox?: [number, number, number, number];
  isArea: boolean;
  nominatim: {
    osmType?: string;
    osmId?: number;
    address?: Record<string, string>;
    namedetails?: Record<string, string>;
    extratags?: Record<string, string>;
  };
}

/** Lightweight Elasticsearch result; resolve it with Nominatim after selection. */
export interface GeocodingSuggestion {
  id: string;
  place_name: string;
  text: string;
  context?: string;
  center: MapCoordinates;
  isArea: boolean;
  resolveQuery: string;
}

interface NominatimResult {
  place_id: number;
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  boundingbox?: [string, string, string, string];
  address?: Record<string, string>;
  namedetails?: Record<string, string>;
  extratags?: Record<string, string>;
  geojson?: Geometry;
}

interface SuggestionResult {
  id?: string;
  place_name?: string;
  text?: string;
  context?: string;
  center?: unknown;
  is_area?: boolean;
}

const NOMINATIM_URL = "/api/nominatim";
const SUGGESTIONS_URL = "/api/suggestions";

const ADDRESS_FIELDS = [
  "house_number",
  "road",
  "neighbourhood",
  "suburb",
  "quarter",
  "village",
  "town",
  "city_district",
  "county",
  "city",
  "state_district",
  "state",
  "country",
] as const;

export function getGeocodingLanguage(language?: string) {
  return (language || "vi").toLowerCase().startsWith("vi") ? "vi,en" : "en,vi";
}

function isGeoJSONGeometry(value: unknown): value is Geometry {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }

  const geometry = value as { type?: unknown };
  return typeof geometry.type === "string";
}

function isVietnameseLanguage(acceptLanguage: string) {
  return acceptLanguage
    .toLowerCase()
    .split(",")
    .some((language) => language.trim().startsWith("vi"));
}

export function formatGeocodingAddress(address: Record<string, string> | undefined, fallback = "") {
  if (!address) return fallback;

  const seen = new Set<string>();
  const parts = ADDRESS_FIELDS.flatMap((field) => {
    const value = address[field]?.trim();
    const key = value?.toLocaleLowerCase();
    if (!value || !key || seen.has(key)) return [];
    seen.add(key);
    return [value];
  });

  return parts.join(", ") || fallback;
}

function isAreaGeometry(geometry: Geometry) {
  return geometry.type === "Polygon" || geometry.type === "MultiPolygon";
}

function isMapCoordinates(value: unknown): value is MapCoordinates {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
  );
}

export async function fetchGeocodingSuggestions(
  searchQuery: string,
  signal?: AbortSignal
): Promise<GeocodingSuggestion[]> {
  const query = searchQuery.trim();
  if (!query) return [];

  const response = await authFetch(`${SUGGESTIONS_URL}?${new URLSearchParams({ q: query })}`, {
    signal,
  });
  if (!response.ok) {
    throw new Error(`Suggestions failed with status: ${response.status}`);
  }

  const data = (await response.json()) as SuggestionResult[];
  return data.flatMap((result) => {
    const placeName = result.place_name?.trim();
    if (!result.id || !placeName || !isMapCoordinates(result.center)) return [];

    return [
      {
        id: result.id,
        place_name: placeName,
        text: result.text?.trim() || placeName,
        context: result.context?.trim(),
        center: result.center,
        isArea: result.is_area === true,
        resolveQuery: placeName,
      },
    ];
  });
}

export async function fetchGeocoding(
  searchQuery: string,
  acceptLanguage: string,
  signal?: AbortSignal
): Promise<GeocodingFeature[]> {
  const normalizedQuery = searchQuery.trim();
  const params = new URLSearchParams({
    q: normalizedQuery,
    format: "jsonv2",
    addressdetails: "1",
    namedetails: "1",
    extratags: "1",
    // GeoJSON retains every geometry Nominatim can return: points, lines,
    // polygons, multipolygons and geometry collections.
    polygon_geojson: "1",
    limit: "6",
    "accept-language": acceptLanguage,
  });
  const response = await authFetch(`${NOMINATIM_URL}/search?${params.toString()}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error("Could not connect to the server.");
  }

  const data = (await response.json()) as NominatimResult[];

  return data.map((result) => {
    const longitude = Number(result.lon);
    const latitude = Number(result.lat);
    const coordinates: MapCoordinates = [longitude, latitude];
    const fallbackGeometry: Geometry = {
      type: "Point",
      coordinates,
    };
    const geometry = isGeoJSONGeometry(result.geojson) ? result.geojson : fallbackGeometry;
    const isArea = isAreaGeometry(geometry);
    const address = formatGeocodingAddress(result.address, result.display_name);
    const label = isArea
      ? isVietnameseLanguage(acceptLanguage)
        ? "Khu vực"
        : "Area"
      : isVietnameseLanguage(acceptLanguage)
        ? "Địa chỉ"
        : "Address";
    const bbox: [number, number, number, number] | undefined = result.boundingbox && [
      Number(result.boundingbox[2]),
      Number(result.boundingbox[0]),
      Number(result.boundingbox[3]),
      Number(result.boundingbox[1]),
    ];

    return {
      id: `${result.osm_type || "place"}-${result.osm_id || result.place_id}`,
      type: "Feature",
      place_name: result.display_name,
      text: result.name || result.display_name,
      context: `${label}: ${address}`,
      center: coordinates,
      geometry,
      isArea,
      nominatim: {
        osmType: result.osm_type,
        osmId: result.osm_id,
        address: result.address,
        namedetails: result.namedetails,
        extratags: result.extratags,
      },
      bbox,
    };
  });
}
