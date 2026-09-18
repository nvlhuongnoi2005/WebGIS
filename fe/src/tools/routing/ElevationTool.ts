import type { MapCoordinates } from "../../types/map";
import { authFetch } from "../../features/auth/authClient";

export interface ElevationPoint {
  distanceM: number;
  elevationM: number | null;
}

const MAX_INPUT_POINTS = 1000;
const MAX_CHART_POINTS = 400;

export async function fetchRouteElevation(
  coordinates: MapCoordinates[],
  distanceKm: number,
  signal?: AbortSignal
): Promise<ElevationPoint[]> {
  if (coordinates.length < 2) {
    return [];
  }

  const step = Math.max(1, Math.ceil(coordinates.length / MAX_INPUT_POINTS));
  const shape = coordinates.filter((_, index) =>
    index === 0 || index === coordinates.length - 1 || index % step === 0
  ).map(([longitude, latitude]) => ({ lat: latitude, lon: longitude }));
  const resampleDistance = Math.min(
    1000,
    Math.max(50, Math.ceil((Math.max(distanceKm, 0) * 1000) / MAX_CHART_POINTS))
  );

  let response: Response;
  try {
    response = await authFetch("/api/gateway/elevation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ shape, resample_distance: resampleDistance }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new Error("routing.errors.elevationFailed", { cause: error });
  }

  if (!response.ok) {
    throw new Error("routing.errors.elevationFailed");
  }

  const payload = await response.json() as { range_height?: unknown };
  if (!Array.isArray(payload.range_height)) {
    throw new Error("routing.errors.elevationFailed");
  }

  return payload.range_height.flatMap((value): ElevationPoint[] => {
    if (!Array.isArray(value) || typeof value[0] !== "number" ||
      (typeof value[1] !== "number" && value[1] !== null)) {
      return [];
    }
    return [{ distanceM: value[0], elevationM: value[1] }];
  });
}
