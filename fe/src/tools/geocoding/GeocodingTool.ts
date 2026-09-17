import type { MapCoordinates } from "../../types/map";

export interface GeocodingFeature {
  id: string;
  type: string;
  place_name: string;
  text: string;
  context?: string;
  center: MapCoordinates;
  geometry: {
    type: string;
    coordinates: MapCoordinates;
  };
  bbox?: [number, number, number, number];
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
}

const NOMINATIM_URL = "/api/nominatim";
const SUGGESTIONS_URL = "/api/suggestions";

export function getGeocodingLanguage(language?: string) {
  return (language || "vi").toLowerCase().startsWith("vi") ? "vi,en" : "en,vi";
}

export async function fetchGeocoding(
  searchQuery: string,
  acceptLanguage: string,
  signal?: AbortSignal
): Promise<GeocodingFeature[]> {
  const normalizedQuery = searchQuery.trim();
  if (normalizedQuery.length >= 2) {
    try {
      const suggestionResponse = await fetch(`${SUGGESTIONS_URL}?${new URLSearchParams({ q: normalizedQuery })}`, { signal });
      if (suggestionResponse.ok) {
        const suggestions = await suggestionResponse.json() as GeocodingFeature[];
        if (suggestions.length > 0) return suggestions;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      // Nominatim remains the source-of-truth fallback while ES is unavailable.
    }
  }
  const params = new URLSearchParams({
    q: normalizedQuery,
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
    "accept-language": acceptLanguage,
  });
  const response = await fetch(`${NOMINATIM_URL}/search?${params.toString()}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed with status: ${response.status}`);
  }

  const data = (await response.json()) as NominatimResult[];

  return data.map(result => {
    const longitude = Number(result.lon);
    const latitude = Number(result.lat);
    const coordinates: MapCoordinates = [longitude, latitude];
    const bbox: [number, number, number, number] | undefined =
      result.boundingbox && [
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
      center: coordinates,
      geometry: {
        type: "Point",
        coordinates,
      },
      bbox,
    };
  });
}
