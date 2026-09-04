import proj4 from "proj4";

const VN2000_TM3_10530 =
  "+proj=tmerc +lat_0=0 +lon_0=105.5 +k=0.9999 " +
  "+x_0=500000 +y_0=0 +ellps=WGS84 " +
  "+towgs84=-192.873,-39.382,-111.202,0.00205,0.0005,-0.00335,0.0188 " +
  "+units=m +no_defs";
proj4.defs("EPSG:9209", VN2000_TM3_10530);

const VN2000 =
  "+proj=longlat " +
  "+ellps=WGS84 " +
  "+towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 " +
  "+no_defs " +
  "+type=crs";
proj4.defs("EPSG:4756", VN2000);

const VN2000_UTM_ZONE_48N =
  "+proj=utm " +
  "+zone=48 " +
  "+ellps=WGS84 " +
  "+towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 " +
  "+units=m " +
  "+no_defs " +
  "+type=crs";
proj4.defs("EPSG:3405", VN2000_UTM_ZONE_48N);

const VN2000_UTM_ZONE_49N =
  "+proj=utm " +
  "+zone=49 " +
  "+ellps=WGS84 " +
  "+towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 " +
  "+units=m " +
  "+no_defs " +
  "+type=crs";
proj4.defs("EPSG:3406", VN2000_UTM_ZONE_49N);

export const COORDINATE_SYSTEMS = {
  "EPSG:4326": {
    label: "WGS 84 (EPSG:4326)",
  },
  "EPSG:3857": {
    label: "Web Mercator (EPSG:3857)",
  },
  "EPSG:32648": {
    label: "WGS 84 / UTM zone 48N (EPSG:32648)",
  },
  "EPSG:32649": {
    label: "WGS 84 / UTM zone 49N (EPSG:32649)",
  },
  "EPSG:4756": {
    label: "VN-2000 (EPSG:4756)",
  },
  "EPSG:3405": {
    label: "VN-2000 / UTM zone 48N (EPSG:3405)",
  },
  "EPSG:3406": {
    label: "VN-2000 / UTM zone 49N (EPSG:3406)",
  },
  "EPSG:9209": {
    label: "VN-2000 / TM-3 105-30 (EPSG:9209)",
  },
} as const;

export type CoordinateReferenceSystem = keyof typeof COORDINATE_SYSTEMS;
export type Coordinate = [x: number, y: number];

export const DEFAULT_COORDINATE_REFERENCE_SYSTEM: CoordinateReferenceSystem =
  "EPSG:4326";

/**
 * Converts supported CRS input formats to the single format used by the app:
 * `EPSG:<code>`.
 */
export function normalizeCoordinateReferenceSystem(
  value: unknown
): CoordinateReferenceSystem | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (!normalized) return null;

  const directMatch = Object.keys(COORDINATE_SYSTEMS).find(
    crs => crs.toLowerCase() === normalized.toLowerCase()
  );
  if (directMatch) return directMatch as CoordinateReferenceSystem;

  const epsgCode = normalized.match(/^epsg\s*:\s*(\d+)$/i)?.[1]
    ?? normalized.match(/^\d+$/)?.[0];

  if (epsgCode) {
    const epsgCrs = `EPSG:${epsgCode}`;
    if (epsgCrs in COORDINATE_SYSTEMS) {
      return epsgCrs as CoordinateReferenceSystem;
    }
  }

  const isCrs84 = /^urn:ogc:def:crs:ogc(?::1\.3)?::?crs84$/i.test(normalized);
  return isCrs84 ? DEFAULT_COORDINATE_REFERENCE_SYSTEM : null;
}

export function transformFromWgs84(
  coordinate: Coordinate,
  targetCrs: CoordinateReferenceSystem
): Coordinate {
  return transformCoordinate(
    coordinate,
    DEFAULT_COORDINATE_REFERENCE_SYSTEM,
    targetCrs
  );
}

export function transformToWgs84(
  coordinate: Coordinate,
  sourceCrs: CoordinateReferenceSystem
): Coordinate {
  return transformCoordinate(
    coordinate,
    sourceCrs,
    DEFAULT_COORDINATE_REFERENCE_SYSTEM
  );
}

export function transformCoordinate(
  coordinate: Coordinate,
  sourceCrs: CoordinateReferenceSystem,
  targetCrs: CoordinateReferenceSystem
): Coordinate {
  if (sourceCrs === targetCrs) return coordinate;

  const transformed = proj4(
    sourceCrs,
    targetCrs,
    coordinate,
  );

  return [transformed[0], transformed[1]];
}
