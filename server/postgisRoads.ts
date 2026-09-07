import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { Pool, type PoolConfig } from "pg";

type PostgisRoadsOptions = {
  databaseUrl?: string;
  host?: string;
  port?: string;
  database?: string;
  user?: string;
  password?: string;
  schema?: string;
  table?: string;
  maxFeatures?: string;
  ssl?: string;
};

type RoadRow = {
  way_id: string | number;
  name: string | null;
  tags: Record<string, unknown> | null;
  geometry: string;
};

const ROAD_API_PATH = "/api/osm/roads";
const MAJOR_HIGHWAYS = ["motorway", "trunk", "primary", "secondary"];
const MEDIUM_HIGHWAYS = [...MAJOR_HIGHWAYS, "tertiary"];
const DETAILED_HIGHWAYS = [
  ...MEDIUM_HIGHWAYS,
  "unclassified",
  "residential",
  "service",
];

function quoteIdentifier(identifier: string, label: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`${label} must contain only letters, numbers, and underscores.`);
  }

  return `"${identifier}"`;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function getQuery(request: IncomingMessage) {
  return new URL(request.url ?? ROAD_API_PATH, "http://localhost").searchParams;
}

function parseNumber(value: string | null, label: string) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new Error(`Invalid ${label}.`);
  }

  return numberValue;
}

function parseBbox(searchParams: URLSearchParams) {
  const bbox = searchParams.get("bbox")?.split(",").map(Number);

  if (!bbox || bbox.length !== 4 || bbox.some(value => !Number.isFinite(value))) {
    throw new Error("bbox must be minLng,minLat,maxLng,maxLat.");
  }

  const [minLng, minLat, maxLng, maxLat] = bbox;

  if (
    minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90 ||
    minLng >= maxLng || minLat >= maxLat
  ) {
    throw new Error("bbox is outside valid WGS84 bounds.");
  }

  return [minLng, minLat, maxLng, maxLat] as const;
}

function getHighwayClasses(searchParams: URLSearchParams) {
  const zoom = parseNumber(searchParams.get("zoom") ?? "7", "zoom");

  if (zoom < 0 || zoom > 24) {
    throw new Error("zoom must be between 0 and 24.");
  }

  if (zoom < 10) return MAJOR_HIGHWAYS;
  if (zoom < 13) return MEDIUM_HIGHWAYS;
  return DETAILED_HIGHWAYS;
}

function createPool(options: PostgisRoadsOptions) {
  if (options.databaseUrl) {
    return new Pool({ connectionString: options.databaseUrl });
  }

  const config: PoolConfig = {
    host: options.host ?? "localhost",
    port: options.port ? Number(options.port) : 5432,
    database: options.database,
    user: options.user,
    password: options.password,
  };

  if (options.ssl === "true") {
    config.ssl = { rejectUnauthorized: false };
  }

  return new Pool(config);
}

function createFeature(row: RoadRow) {
  const tags = row.tags ?? {};
  const name = row.name ?? (typeof tags.name === "string" ? tags.name : null);

  return {
    type: "Feature" as const,
    id: String(row.way_id),
    properties: {
      way_id: row.way_id,
      name,
      highway: tags.highway ?? null,
      ref: tags.ref ?? null,
      surface: tags.surface ?? null,
      lanes: tags.lanes ?? null,
      maxspeed: tags.maxspeed ?? null,
    },
    geometry: JSON.parse(row.geometry),
  };
}

export function postgisRoadsPlugin(options: PostgisRoadsOptions): Plugin {
  let pool: Pool | null = null;
  let tableName: string;

  try {
    const schema = quoteIdentifier(options.schema ?? "public", "POSTGIS_SCHEMA");
    const table = quoteIdentifier(options.table ?? "osm_lines", "POSTGIS_LINES_TABLE");
    tableName = `${schema}.${table}`;
  } catch (error) {
    tableName = "";
    console.error("PostGIS roads configuration error:", error);
  }

  return {
    name: "postgis-roads-api",
    configureServer(server) {
      server.middlewares.use(ROAD_API_PATH, async (request, response) => {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "Only GET is supported." });
          return;
        }

        if (!tableName) {
          sendJson(response, 500, { error: "Invalid PostGIS table configuration." });
          return;
        }

        try {
          const searchParams = getQuery(request);
          const [minLng, minLat, maxLng, maxLat] = parseBbox(searchParams);
          const requestedLimit = parseNumber(searchParams.get("limit") ?? "300", "limit");
          const highwayClasses = getHighwayClasses(searchParams);
          const configuredMax = options.maxFeatures ? Number(options.maxFeatures) : 1000;
          const maxFeatures = Number.isFinite(configuredMax)
            ? Math.min(Math.max(Math.trunc(configuredMax), 1), 1000)
            : 1000;
          const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), maxFeatures);

          pool ??= createPool(options);

          const result = await pool.query<RoadRow>(
            `
              WITH viewport AS (
                SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326) AS geom
              )
              SELECT
                l.way_id,
                l.name,
                l.tags,
                ST_AsGeoJSON(ST_Force2D(l.geom), 6) AS geometry
              FROM ${tableName} AS l CROSS JOIN viewport
              WHERE l.geom && viewport.geom
                AND ST_Intersects(l.geom, viewport.geom)
                AND l.tags->>'highway' = ANY($6::text[])
              ORDER BY CASE l.tags->>'highway'
                WHEN 'motorway' THEN 1
                WHEN 'trunk' THEN 2
                WHEN 'primary' THEN 3
                WHEN 'secondary' THEN 4
                WHEN 'tertiary' THEN 5
                ELSE 6
              END, l.way_id
              LIMIT $5
            `,
            [minLng, minLat, maxLng, maxLat, limit, highwayClasses],
          );

          sendJson(response, 200, {
            type: "FeatureCollection",
            features: result.rows.map(createFeature),
          });
        } catch (error) {
          console.error("PostGIS roads request failed:", error);
          sendJson(response, 500, {
            error: error instanceof Error ? error.message : "Unable to query PostGIS.",
          });
        }
      });

      server.httpServer?.once("close", () => {
        void pool?.end();
      });
    },
  };
}
