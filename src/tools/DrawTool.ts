import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  Position,
} from "geojson";

export type DrawCoordinate = [number, number];
export type DrawGeometry = Geometry;
export type DrawFeatureId = string;
export type DrawProperties = GeoJsonProperties;
export const DRAW_FEATURE_ID_PROPERTY = "drawId";
export const DRAW_VERTEX_GEOMETRY_PATH_PROPERTY = "geometryPath";
export const DRAW_VERTEX_COORDINATE_PATH_PROPERTY = "coordinatePath";
export type DrawFeature = Feature<DrawGeometry, DrawProperties> & {
  id: DrawFeatureId;
};
export type DrawFeatureCollection = Omit<
  FeatureCollection<DrawGeometry, DrawProperties>,
  "features"
> & {
  features: DrawFeature[];
};
export type DrawMode = "select" | "point" | "line" | "polygon" | "edit";

export function emptyDrawFeatureCollection(): DrawFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export function createPointFeature(coordinate: DrawCoordinate): DrawFeature {
  return createFeature({
    type: "Point",
    coordinates: coordinate,
  });
}

export function createLineFeature(coordinates: DrawCoordinate[]): DrawFeature {
  return createFeature({
    type: "LineString",
    coordinates,
  });
}

export function createPolygonFeature(coordinates: DrawCoordinate[]): DrawFeature {
  const ring = closeRing(coordinates);

  return createFeature({
    type: "Polygon",
    coordinates: [ring],
  });
}

function createFeature(geometry: DrawGeometry): DrawFeature {
  const id = createDrawId();

  return {
    type: "Feature",
    id,
    properties: null,
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

export function isDrawFeatureCollection(
  value: unknown
): value is FeatureCollection<DrawGeometry, DrawProperties> {
  if (!value || typeof value !== "object") return false;

  const collection = value as { type?: unknown; features?: unknown };
  return (
    collection.type === "FeatureCollection" &&
    Array.isArray(collection.features) &&
    collection.features.every(isDrawFeature)
  );
}

function isDrawFeature(value: unknown): value is Feature<DrawGeometry, DrawProperties> {
  if (!value || typeof value !== "object") return false;

  const feature = value as {
    type?: unknown;
    id?: unknown;
    properties?: unknown;
    geometry?: unknown;
  };
  if (feature.type !== "Feature" || !feature.geometry || typeof feature.geometry !== "object") {
    return false;
  }

  if (
    feature.id !== undefined &&
    typeof feature.id !== "string" &&
    typeof feature.id !== "number"
  ) {
    return false;
  }

  if (
    feature.properties !== null &&
    (typeof feature.properties !== "object" || Array.isArray(feature.properties))
  ) {
    return false;
  }

  const geometry = feature.geometry as Geometry;

  return isSupportedGeometry(geometry);
}

export function normalizeDrawFeatureCollection(
  value: unknown
): DrawFeatureCollection | null {
  if (!isDrawFeatureCollection(value)) return null;

  const usedIds = new Set<string>();
  const features = value.features.map(feature => {
    let id = feature.id === undefined ? createDrawId() : String(feature.id);
    while (usedIds.has(id)) id = createDrawId();
    usedIds.add(id);

    return { ...feature, id };
  });

  return { ...value, features };
}

function isSupportedGeometry(value: unknown): value is DrawGeometry {
  if (!value || typeof value !== "object") return false;

  const geometry = value as {
    type?: unknown;
    coordinates?: unknown;
    geometries?: unknown;
  };

  switch (geometry.type) {
    case "Point":
      return isCoordinate(geometry.coordinates);
    case "MultiPoint":
      return isCoordinateArray(geometry.coordinates);
    case "LineString":
      return isLineStringCoordinates(geometry.coordinates);
    case "MultiLineString":
      return isMultiLineStringCoordinates(geometry.coordinates);
    case "Polygon":
      return isPolygonCoordinates(geometry.coordinates);
    case "MultiPolygon":
      return isMultiPolygonCoordinates(geometry.coordinates);
    case "GeometryCollection":
      return (
        Array.isArray(geometry.geometries) &&
        geometry.geometries.every(isSupportedGeometry)
      );
    default:
      return false;
  }
}

function isCoordinate(value: unknown): value is DrawCoordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every(item => typeof item === "number" && Number.isFinite(item))
  );
}

function isCoordinateArray(value: unknown): value is DrawCoordinate[] {
  return Array.isArray(value) && value.every(isCoordinate);
}

function isLineStringCoordinates(value: unknown): value is DrawCoordinate[] {
  return isCoordinateArray(value) && value.length >= 2;
}

function isMultiLineStringCoordinates(value: unknown): value is DrawCoordinate[][] {
  return Array.isArray(value) && value.every(isLineStringCoordinates);
}

function isPolygonCoordinates(value: unknown): value is DrawCoordinate[][] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(ring => isCoordinateArray(ring) && isClosedRing(ring))
  );
}

function isMultiPolygonCoordinates(value: unknown): value is DrawCoordinate[][][] {
  return Array.isArray(value) && value.every(isPolygonCoordinates);
}

function isClosedRing(ring: DrawCoordinate[]): boolean {
  if (ring.length < 4) return false;

  const first = ring[0];
  const last = ring.at(-1);
  return Boolean(
    first &&
      last &&
      first[0] === last[0] &&
      first[1] === last[1]
  );
}

export function encodeDrawPath(path: number[]): string {
  return path.join(".");
}

export function decodeDrawPath(value: unknown): number[] | null {
  if (typeof value !== "string") return null;
  if (value === "") return [];

  const path = value.split(".").map(Number);
  return path.every(index => Number.isInteger(index) && index >= 0) ? path : null;
}

export function replaceDrawCoordinate(
  current: Position,
  coordinate: DrawCoordinate
): Position {
  return current.length > 2
    ? [coordinate[0], coordinate[1], ...current.slice(2)]
    : coordinate;
}
