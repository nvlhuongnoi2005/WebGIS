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
export type DrawProperties = GeoJsonProperties;
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
