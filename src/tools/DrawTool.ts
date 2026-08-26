import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  LineString,
  Point,
  Polygon,
} from "geojson";

export type DrawCoordinate = [number, number];
export type DrawGeometry = Point | LineString | Polygon;
export type DrawFeatureId = string;
export type DrawProperties = GeoJsonProperties & {
  drawId: DrawFeatureId;
  kind: "point" | "line" | "polygon";
};
export type DrawFeature = Feature<DrawGeometry, DrawProperties>;
export type DrawFeatureCollection = FeatureCollection<DrawGeometry, DrawProperties>;
export type DrawMode = "select" | "point" | "line" | "polygon" | "edit";

export const DRAW_STORAGE_KEY = "webgis.drawings.v2";

export function emptyDrawFeatureCollection(): DrawFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export function createPointFeature(coordinate: DrawCoordinate): DrawFeature {
  return createFeature("point", {
    type: "Point",
    coordinates: coordinate,
  });
}

export function createLineFeature(coordinates: DrawCoordinate[]): DrawFeature {
  return createFeature("line", {
    type: "LineString",
    coordinates,
  });
}

export function createPolygonFeature(coordinates: DrawCoordinate[]): DrawFeature {
  const ring = closeRing(coordinates);

  return createFeature("polygon", {
    type: "Polygon",
    coordinates: [ring],
  });
}

export function readDrawFeatureCollection(): DrawFeatureCollection {
  if (typeof window === "undefined") return emptyDrawFeatureCollection();

  try {
    const stored = window.localStorage.getItem(DRAW_STORAGE_KEY);
    if (!stored) return emptyDrawFeatureCollection();

    const parsed: unknown = JSON.parse(stored);
    if (!isDrawFeatureCollection(parsed)) return emptyDrawFeatureCollection();

    return parsed;
  } catch {
    return emptyDrawFeatureCollection();
  }
}

export function writeDrawFeatureCollection(collection: DrawFeatureCollection) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(DRAW_STORAGE_KEY, JSON.stringify(collection));
  } catch {
    // Storage may be disabled or full; the editor still works in memory.
  }
}

function createFeature(
  kind: DrawProperties["kind"],
  geometry: DrawGeometry
): DrawFeature {
  const drawId = createDrawId();

  return {
    type: "Feature",
    id: drawId,
    properties: {
      drawId,
      kind,
    },
    geometry,
  };
}

function createDrawId(): DrawFeatureId {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `draw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function closeRing(coordinates: DrawCoordinate[]): DrawCoordinate[] {
  const first = coordinates[0];
  const last = coordinates.at(-1);

  if (!first || !last || (first[0] === last[0] && first[1] === last[1])) {
    return coordinates;
  }

  return [...coordinates, first];
}

function isDrawFeatureCollection(
  value: unknown
): value is DrawFeatureCollection {
  if (!value || typeof value !== "object") return false;

  const collection = value as { type?: unknown; features?: unknown };
  return (
    collection.type === "FeatureCollection" &&
    Array.isArray(collection.features) &&
    collection.features.every(isDrawFeature)
  );
}

function isDrawFeature(value: unknown): value is DrawFeature {
  if (!value || typeof value !== "object") return false;

  const feature = value as {
    type?: unknown;
    id?: unknown;
    properties?: unknown;
    geometry?: unknown;
  };
  if (
    feature.type !== "Feature" ||
    typeof feature.id !== "string" ||
    !feature.properties ||
    typeof feature.properties !== "object" ||
    !feature.geometry ||
    typeof feature.geometry !== "object"
  ) {
    return false;
  }

  const properties = feature.properties as { drawId?: unknown; kind?: unknown };
  const geometry = feature.geometry as Geometry;

  return (
    properties.drawId === feature.id &&
    (properties.kind === "point" || properties.kind === "line" || properties.kind === "polygon") &&
    isSupportedGeometry(geometry)
  );
}

function isSupportedGeometry(geometry: Geometry): geometry is DrawGeometry {
  if (geometry.type === "Point") return isCoordinate(geometry.coordinates);

  if (geometry.type === "LineString") {
    return geometry.coordinates.length >= 2 && geometry.coordinates.every(isCoordinate);
  }

  if (geometry.type === "Polygon") {
    return (
      geometry.coordinates.length > 0 &&
      geometry.coordinates.every(ring => ring.length >= 4 && ring.every(isCoordinate))
    );
  }

  return false;
}

function isCoordinate(value: unknown): value is DrawCoordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

