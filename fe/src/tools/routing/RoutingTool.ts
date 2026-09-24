import type { Feature, LineString } from "geojson";

import type { MapCoordinates } from "../../types/map";
import { authFetch } from "../../features/auth/authClient";

export type RoutingVehicle =
  "auto" | "bicycle" | "pedestrian" | "motorcycle" | "truck" | "bus" | "taxi" | "hov";

export interface RouteSummary {
  distanceKm: number;
  timeSeconds: number;
}

export interface RouteInstruction {
  instruction: string;
  distanceKm: number;
  timeSeconds: number;
  type: number | null;
  beginShapeIndex: number | null;
  endShapeIndex: number | null;
}

export interface RouteResult {
  geometry: Feature<LineString>;
  summary: RouteSummary;
  instructions: RouteInstruction[];
}

const VALHALLA_URL = "/api/gateway/route";

export async function fetchValhallaRoute(
  origin: MapCoordinates,
  destination: MapCoordinates,
  costing: RoutingVehicle,
  signal?: AbortSignal,
  language = "en-US"
): Promise<RouteResult> {
  let response: Response;

  try {
    response = await authFetch(VALHALLA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        locations: [
          { lat: origin[1], lon: origin[0] },
          { lat: destination[1], lon: destination[0] },
        ],
        costing,
        units: "kilometers",
        language,
        directions_type: "instructions",
        shape_format: "polyline6",
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new Error("routing.errors.requestFailed", { cause: error });
  }

  if (!response.ok) {
    throw new Error("routing.errors.requestFailed");
  }

  const payload = (await response.json()) as ValhallaResponse;
  if (!payload.trip?.legs?.length) {
    throw new Error("routing.errors.noRoute");
  }

  const coordinates = payload.trip.legs.flatMap((leg, index) => {
    const legCoordinates = decodeShape(leg.shape);
    return index === 0 ? legCoordinates : legCoordinates.slice(1);
  });

  if (coordinates.length < 2) {
    throw new Error("routing.errors.invalidGeometry");
  }

  const summary = payload.trip.summary;
  const instructions = payload.trip.legs.flatMap((leg) =>
    (leg.maneuvers ?? [])
      .map((maneuver) => ({
        instruction: maneuver.instruction?.trim() || "",
        distanceKm: Number(maneuver.length ?? 0),
        timeSeconds: Number(maneuver.time ?? 0),
        type: typeof maneuver.type === "number" ? maneuver.type : null,
        beginShapeIndex:
          typeof maneuver.begin_shape_index === "number" ? maneuver.begin_shape_index : null,
        endShapeIndex:
          typeof maneuver.end_shape_index === "number" ? maneuver.end_shape_index : null,
      }))
      .filter((maneuver) => maneuver.instruction.length > 0)
  );

  return {
    geometry: {
      type: "Feature",
      properties: { costing },
      geometry: { type: "LineString", coordinates },
    },
    summary: {
      distanceKm: Number(summary?.length ?? 0),
      timeSeconds: Number(summary?.time ?? 0),
    },
    instructions,
  };
}

interface ValhallaResponse {
  trip?: {
    summary?: { length?: number; time?: number };
    legs?: Array<{
      shape?: string | { coordinates?: number[][] };
      maneuvers?: ValhallaManeuver[];
    }>;
  };
}

interface ValhallaManeuver {
  type?: number;
  instruction?: string;
  length?: number;
  time?: number;
  begin_shape_index?: number;
  end_shape_index?: number;
}

function decodeShape(shape: string | { coordinates?: number[][] } | undefined): MapCoordinates[] {
  if (!shape) {
    return [];
  }

  if (typeof shape !== "string") {
    return (shape.coordinates ?? [])
      .filter((coordinate) => coordinate.length >= 2)
      .map((coordinate) => [coordinate[0], coordinate[1]]);
  }

  const coordinates: MapCoordinates[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < shape.length) {
    const latitudeDelta = decodeValue(shape, () => index++);
    const longitudeDelta = decodeValue(shape, () => index++);

    if (latitudeDelta === null || longitudeDelta === null) {
      break;
    }

    latitude += latitudeDelta;
    longitude += longitudeDelta;
    coordinates.push([longitude / 1_000_000, latitude / 1_000_000]);
  }

  return coordinates;
}

function decodeValue(shape: string, nextIndex: () => number): number | null {
  let result = 0;
  let shift = 0;

  while (true) {
    const currentIndex = nextIndex();
    if (currentIndex >= shape.length) {
      return null;
    }

    const byte = shape.charCodeAt(currentIndex) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;

    if (byte < 0x20) {
      break;
    }
  }

  return result & 1 ? ~(result >> 1) : result >> 1;
}

export function formatRouteDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  return {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  };
}
