import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  Position,
} from "geojson";
import {
  DEFAULT_COORDINATE_REFERENCE_SYSTEM,
  normalizeCoordinateReferenceSystem,
  transformCoordinate,
  type CoordinateReferenceSystem,
} from "../coordinate/CoordinateTool";
import {
  getGeometryMeasurementProperties,
  MEASURED_AREA_PROPERTY,
  MEASURED_LENGTH_PROPERTY,
} from "../measure/MeasureTool";

export type DrawCoordinate = [number, number];
export type DrawGeometry = Geometry;
export interface DrawGeoJSONCrs {
  type: "name";
  properties: {
    name: CoordinateReferenceSystem;
  };
}
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
  crs: DrawGeoJSONCrs;
};
export type DrawMode =
  | "select"
  | "point"
  | "multipoint"
  | "line"
  | "polygon"
  | "edit";

export function emptyDrawFeatureCollection(): DrawFeatureCollection {
  return {
    type: "FeatureCollection",
    crs: createDrawGeoJSONCrs(DEFAULT_COORDINATE_REFERENCE_SYSTEM),
    features: [],
  };
}

export function createPointFeature(
  coordinate: DrawCoordinate,
  existingIds: Iterable<DrawFeatureId> = []
): DrawFeature {
  return createFeature({
    type: "Point",
    coordinates: coordinate,
  }, existingIds);
}

export function createMultiPointFeature(
  coordinates: DrawCoordinate[],
  existingIds: Iterable<DrawFeatureId> = []
): DrawFeature {
  return createFeature({
    type: "MultiPoint",
    coordinates,
  }, existingIds);
}

export function createLineFeature(
  coordinates: DrawCoordinate[],
  existingIds: Iterable<DrawFeatureId> = []
): DrawFeature {
  return createFeature({
    type: "LineString",
    coordinates,
  }, existingIds);
}

export function createPolygonFeature(
  coordinates: DrawCoordinate[],
  existingIds: Iterable<DrawFeatureId> = []
): DrawFeature {
  const ring = closeRing(coordinates);

  return createFeature({
    type: "Polygon",
    coordinates: [ring],
  }, existingIds);
}

function createFeature(
  geometry: DrawGeometry,
  existingIds: Iterable<DrawFeatureId>
): DrawFeature {
  const id = createDrawId(geometry, existingIds);

  return syncDrawFeatureMeasurements({
    type: "Feature",
    id,
    properties: null,
    geometry,
  });
}

/**
 * Keeps derived measurement properties in sync with a feature's geometry.
 * Values are stored as numbers in meters and square meters so they remain
 * useful in exported GeoJSON; the property panel formats them for display.
 */
export function syncDrawFeatureMeasurements(
  feature: DrawFeature
): DrawFeature {
  const properties = feature.properties && !Array.isArray(feature.properties)
    ? feature.properties
    : {};
  const customProperties = { ...properties };
  delete customProperties[MEASURED_AREA_PROPERTY];
  delete customProperties[MEASURED_LENGTH_PROPERTY];
  const measurementProperties = getGeometryMeasurementProperties(feature.geometry);
  const nextProperties = { ...customProperties, ...measurementProperties };

  return {
    ...feature,
    properties: Object.keys(nextProperties).length > 0 ? nextProperties : null,
  };
}

export function syncDrawFeatureCollectionMeasurements(
  collection: DrawFeatureCollection
): DrawFeatureCollection {
  return {
    ...collection,
    features: collection.features.map(syncDrawFeatureMeasurements),
  };
}

const nextDrawIdByPrefix: Record<string, number> = {};

function createDrawId(
  geometry: DrawGeometry,
  existingIds: Iterable<DrawFeatureId>
): DrawFeatureId {
  const prefix = getDrawIdPrefix(geometry);
  const usedIds = new Set(existingIds);
  let nextNumber = nextDrawIdByPrefix[prefix] ?? 1;

  for (const id of usedIds) {
    const match = id.match(new RegExp(`^${prefix}(\\d+)$`));
    if (match) nextNumber = Math.max(nextNumber, Number(match[1]) + 1);
  }

  let id = `${prefix}${nextNumber}`;
  while (usedIds.has(id)) {
    nextNumber += 1;
    id = `${prefix}${nextNumber}`;
  }

  nextDrawIdByPrefix[prefix] = nextNumber + 1;
  return id;
}

function getDrawIdPrefix(geometry: DrawGeometry): string {
  if (geometry.type === "Point") return "P";
  if (geometry.type === "MultiPoint") return "MP";
  if (geometry.type === "LineString") return "L";
  if (geometry.type === "Polygon") return "PG";
  return "F";
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
  if (
    feature.type !== "Feature" ||
    !feature.geometry ||
    typeof feature.geometry !== "object"
  ) {
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

  const rawCrs = (value as { crs?: unknown }).crs;
  const crs = parseDrawGeoJSONCrs(rawCrs);
  if (rawCrs !== undefined && !crs) return null;

  const usedIds = new Set<string>();
  const features = value.features.map(feature => {
    let id = feature.id === undefined
      ? createDrawId(feature.geometry, usedIds)
      : String(feature.id);
    while (usedIds.has(id)) id = createDrawId(feature.geometry, usedIds);
    usedIds.add(id);

    return { ...feature, id };
  });

  return {
    ...value,
    crs: createDrawGeoJSONCrs(crs ?? DEFAULT_COORDINATE_REFERENCE_SYSTEM),
    features,
  };
}

export function createDrawGeoJSONCrs(
  crs: CoordinateReferenceSystem
): DrawGeoJSONCrs {
  return {
    type: "name",
    properties: { name: crs },
  };
}

export function getDrawGeoJSONCrs(
  value: unknown,
  fallback: CoordinateReferenceSystem = DEFAULT_COORDINATE_REFERENCE_SYSTEM
): CoordinateReferenceSystem {
  return parseDrawGeoJSONCrs(
    value && typeof value === "object"
      ? (value as { crs?: unknown }).crs
      : undefined
  ) ?? fallback;
}

function parseDrawGeoJSONCrs(value: unknown): CoordinateReferenceSystem | null {
  if (typeof value === "string") {
    return normalizeCoordinateReferenceSystem(value);
  }

  if (!value || typeof value !== "object") return null;

  const crs = value as {
    type?: unknown;
    properties?: { name?: unknown };
  };
  const name = crs.properties?.name;

  return crs.type === "name"
    ? normalizeCoordinateReferenceSystem(name)
    : null;
}

export function transformDrawFeatureCollection(
  collection: DrawFeatureCollection,
  sourceCrs: CoordinateReferenceSystem,
  targetCrs: CoordinateReferenceSystem
): DrawFeatureCollection {
  return {
    ...collection,
    crs: createDrawGeoJSONCrs(targetCrs),
    features: collection.features.map(feature => ({
      ...feature,
      geometry: transformDrawGeometry(feature.geometry, sourceCrs, targetCrs),
    })),
  };
}

function transformDrawGeometry(
  geometry: DrawGeometry,
  sourceCrs: CoordinateReferenceSystem,
  targetCrs: CoordinateReferenceSystem
): DrawGeometry {
  if (geometry.type === "GeometryCollection") {
    return {
      ...geometry,
      geometries: geometry.geometries.map(child =>
        transformDrawGeometry(child, sourceCrs, targetCrs)
      ),
    };
  }

  if (geometry.type === "Point") {
    return {
      ...geometry,
      coordinates: transformDrawPosition(
        geometry.coordinates,
        sourceCrs,
        targetCrs
      ),
    };
  }

  if (geometry.type === "MultiPoint" || geometry.type === "LineString") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(position =>
        transformDrawPosition(position, sourceCrs, targetCrs)
      ),
    };
  }

  if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(line =>
        line.map(position =>
          transformDrawPosition(position, sourceCrs, targetCrs)
        )
      ),
    };
  }

  return {
    ...geometry,
    coordinates: geometry.coordinates.map(polygon =>
      polygon.map(ring =>
        ring.map(position =>
          transformDrawPosition(position, sourceCrs, targetCrs)
        )
      )
    ),
  };
}

function transformDrawPosition(
  position: Position,
  sourceCrs: CoordinateReferenceSystem,
  targetCrs: CoordinateReferenceSystem
): Position {
  const [x, y] = transformCoordinate(
    [position[0], position[1]],
    sourceCrs,
    targetCrs
  );

  return position.length > 2 ? [x, y, ...position.slice(2)] : [x, y];
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
