import type { StyleSpecification } from "maplibre-gl";

export interface TileServerBaseMap {
  id: string;
  label: string;
  tilePath: string;
  maxzoom: number;
  tileSize: number;
  kind: "raster" | "vector";
  sourceLayer?: string;
}

export const DEFAULT_TILE_SERVER_BASE_MAP: TileServerBaseMap = {
  id: "asia_full",
  label: "Asia Full",
  tilePath: "/datas/asia_full/{z}/{x}/{y}.png",
  maxzoom: 7,
  tileSize: 256,
  kind: "raster",
};

const TILE_SERVER_URL = (
  import.meta.env.VITE_TILE_SERVER_URL || "http://localhost:8080"
).replace(/\/$/, "");

export const TILE_SERVER_CATALOG_URL =
  import.meta.env.VITE_TILE_SERVER_CATALOG_URL || TILE_SERVER_URL;

export function getEmptyMapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: "empty-map-background",
        type: "background",
        paint: {
          "background-color": "#ffffff",
        },
      },
    ],
  };
}

type TileServerCatalogItem = {
  id?: unknown;
  name?: unknown;
  label?: unknown;
  tilePath?: unknown;
  tileUrl?: unknown;
  path?: unknown;
  url?: unknown;
  maxzoom?: unknown;
  maxZoom?: unknown;
  tileSize?: unknown;
  type?: unknown;
  format?: unknown;
  sourceLayer?: unknown;
  source_layer?: unknown;
};

const TILE_SERVER_OVERLAY_IDS = new Set(
  (import.meta.env.VITE_TILE_SERVER_OVERLAY_IDS || "vietnam_osm")
    .split(",")
    .map((id: string) => id.trim())
    .filter(Boolean)
);

function getCatalogItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    for (const key of ["datasets", "data", "items", "tilesets"]) {
      if (Array.isArray(record[key])) {
        return record[key];
      }
    }
  }

  throw new Error("Catalog phải chứa một mảng dataset.");
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeCatalogItem(item: unknown, index: number): TileServerBaseMap {
  if (typeof item === "string" && item.trim()) {
    const id = item.trim();

    return {
      id,
      label: id,
      tilePath: `/datas/${id}/{z}/{x}/{y}.png`,
      maxzoom: 7,
      tileSize: 256,
      kind: "raster",
    };
  }

  if (!item || typeof item !== "object") {
    throw new Error(`Dataset tại vị trí ${index} không hợp lệ.`);
  }

  const record = item as TileServerCatalogItem;
  const id = String(record.id ?? record.name ?? record.label ?? `dataset-${index}`);
  const label = String(record.label ?? record.name ?? record.id ?? id);
  const tilePath = String(
    record.tilePath ?? record.tileUrl ?? record.path ?? record.url ??
      `/datas/${id}/{z}/{x}/{y}.png`
  );
  // The tile server may expose `type: baselayer` and `format: pbf`.
  // Do not let the non-format `type` value hide the actual vector format.
  const format = `${String(record.type ?? "")} ${String(record.format ?? "")} ${tilePath}`
    .toLowerCase();
  const kind = format.includes("pbf") || format.includes("mvt") || format.includes("vector")
    ? "vector"
    : "raster";
  const sourceLayer = record.sourceLayer ?? record.source_layer;

  return {
    id,
    label,
    tilePath,
    maxzoom: positiveNumber(record.maxzoom ?? record.maxZoom, 7),
    tileSize: positiveNumber(record.tileSize, 256),
    kind,
    sourceLayer: typeof sourceLayer === "string" && sourceLayer.trim()
      ? sourceLayer.trim()
      : undefined,
  };
}

export function isTileServerOverlay(dataset: TileServerBaseMap) {
  return TILE_SERVER_OVERLAY_IDS.has(dataset.id);
}

export function splitTileServerDatasets(datasets: TileServerBaseMap[]) {
  return {
    baseMaps: datasets.filter(dataset => !isTileServerOverlay(dataset)),
    overlays: datasets.filter(dataset => isTileServerOverlay(dataset)),
  };
}

async function getTileServerRootDatasetIds(html: string) {
  const matches = [
    ...html.matchAll(/identifier:\s*\$\{escapeHTML\("([^"]+)"\)\}/g),
    ...html.matchAll(/\/datas\/([a-zA-Z0-9._-]+)\/\{z\}/g),
  ];

  return Array.from(new Set(matches.map(match => match[1])));
}

async function fetchTileServerRootCatalog(
  html: string
): Promise<TileServerBaseMap[]> {
  const ids = await getTileServerRootDatasetIds(html);

  const datasets = await Promise.all(ids.map(async (id, index) => {
    try {
      const response = await fetch(
        `${TILE_SERVER_URL}/datas/${encodeURIComponent(id)}.json`
      );

      if (response.ok) {
        const tileJson = await response.json() as Record<string, unknown>;
        return normalizeCatalogItem({
          id,
          name: tileJson.name,
          tilePath: Array.isArray(tileJson.tiles) ? tileJson.tiles[0] : undefined,
          maxzoom: tileJson.maxzoom,
          tileSize: tileJson.tileSize,
        }, index);
      }
    } catch {
      // Keep the dataset discoverable even if its TileJSON request fails.
    }

    return normalizeCatalogItem({ id }, index);
  }));

  return datasets;
}

export async function fetchTileServerBaseMaps(
  signal?: AbortSignal
): Promise<TileServerBaseMap[]> {
  const response = await fetch(TILE_SERVER_CATALOG_URL, { signal });

  if (response.ok && response.headers.get("content-type")?.includes("json")) {
    const payload = await response.json() as unknown;
    const datasets = getCatalogItems(payload).map(normalizeCatalogItem);

    if (datasets.length === 0) {
      throw new Error("Tile server chưa có dataset nào.");
    }

    return Array.from(
      new Map(datasets.map(dataset => [dataset.id, dataset])).values()
    );
  }

  if (response.ok) {
    const datasets = await fetchTileServerRootCatalog(await response.text());

    if (datasets.length > 0) {
      return datasets;
    }
  }

  if (!response.ok) {
    throw new Error(`Không tải được danh sách tile (${response.status}).`);
  }

  throw new Error("Không tìm thấy dataset trên tile server.");
}

function resolveTileServerTileUrl(tilePath: string) {
  return tilePath.startsWith("http")
    ? tilePath
    : `${TILE_SERVER_URL}${tilePath.startsWith("/") ? "" : "/"}${tilePath}`;
}

export function getTileServerPreviewUrl(baseMap: TileServerBaseMap) {
  return resolveTileServerTileUrl(baseMap.tilePath)
    .replace("{z}", "3")
    .replace("{x}", "6")
    .replace("{y}", "3");
}

function getTileServerOverlaySourceId(overlay: TileServerBaseMap) {
  return `tile-server-overlay-${overlay.id}`;
}

export function getTileServerMapStyle(
  baseMap: TileServerBaseMap,
  overlays: TileServerBaseMap[] = []
): StyleSpecification {
  const sourceId = `tile-server-${baseMap.id}`;
  const tileUrl = resolveTileServerTileUrl(baseMap.tilePath);
  const sources: StyleSpecification["sources"] = {
    [sourceId]: {
      type: "raster",
      tiles: [tileUrl],
      tileSize: baseMap.tileSize,
      maxzoom: baseMap.maxzoom,
    },
  };
  const layers: StyleSpecification["layers"] = [
    {
      id: sourceId,
      type: "raster",
      source: sourceId,
    },
  ];

  overlays.forEach(overlay => {
    const overlaySourceId = getTileServerOverlaySourceId(overlay);
    const overlayTileUrl = resolveTileServerTileUrl(overlay.tilePath);

    const isVector = overlay.kind === "vector" || /\.(pbf|mvt)(?:$|\?)/i.test(overlay.tilePath);

    if (isVector) {
      sources[overlaySourceId] = {
        type: "vector",
        // Use the concrete tile template here. Some MapLibre versions are
        // stricter when the TileJSON document advertises a non-standard
        // `type` value (the tile server uses `baselayer` for this dataset).
        // The pbf endpoint itself is valid and was already rendering before
        // the generic layer fallback was added.
        tiles: [overlayTileUrl],
        minzoom: 0,
        maxzoom: overlay.maxzoom,
      };
      layers.push(...getOpenMapTilesOverlayLayers(
        overlaySourceId,
        overlay.sourceLayer
      ));
      return;
    }

    sources[overlaySourceId] = {
      type: "raster",
      tiles: [overlayTileUrl],
      tileSize: overlay.tileSize,
      maxzoom: overlay.maxzoom,
    };
    layers.push({
      id: `${overlaySourceId}-raster`,
      type: "raster",
      source: overlaySourceId,
      paint: { "raster-opacity": 0.85 },
    } as StyleSpecification["layers"][number]);
  });

  return {
    version: 8,
    glyphs: `${TILE_SERVER_URL}/fonts/{fontstack}/{range}.pbf`,
    sources,
    layers,
  };
}

function getOpenMapTilesOverlayLayers(
  sourceId: string,
  preferredSourceLayer?: string
): StyleSpecification["layers"] {
  const sourceLayer = preferredSourceLayer || "transportation";
  const layer = (definition: Record<string, unknown>) => ({
    ...definition,
    source: sourceId,
  });

  return [
    layer({
      id: `${sourceId}-landcover`,
      type: "fill",
      "source-layer": "landcover",
      minzoom: 0,
      paint: {
        "fill-color": ["match", ["get", "subclass"], "wood", "#b9d99c", "#d5e8b5"],
        "fill-opacity": 0.4,
      },
    }),
    layer({
      id: `${sourceId}-landuse`,
      type: "fill",
      "source-layer": "landuse",
      minzoom: 4,
      paint: {
        "fill-color": ["match", ["get", "class"], "residential", "#eee8dc", "industrial", "#e5d9d1", "commercial", "#eadbe8", "#e2ebcf"],
        "fill-opacity": 0.5,
        "fill-outline-color": "#cbd5b0",
      },
    }),
    layer({
      id: `${sourceId}-park`,
      type: "fill",
      "source-layer": "park",
      minzoom: 8,
      paint: {
        "fill-color": "#a9d98a",
        "fill-opacity": 0.45,
        "fill-outline-color": "#78b96a",
      },
    }),
    layer({
      id: `${sourceId}-water`,
      type: "fill",
      "source-layer": "water",
      minzoom: 0,
      paint: {
        "fill-color": "#a9c8ed",
        "fill-opacity": 0.72,
      },
    }),
    layer({
      id: `${sourceId}-waterway`,
      type: "line",
      "source-layer": "waterway",
      minzoom: 7,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#78aee6",
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.5, 12, 1.5, 15, 4],
        "line-opacity": 0.85,
      },
    }),
    layer({
      id: `${sourceId}-building`,
      type: "fill",
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-color": "#d8d0c6",
        "fill-opacity": 0.72,
        "fill-outline-color": "#b9aea2",
      },
    }),
    layer({
      id: `${sourceId}-aeroway`,
      type: "fill",
      "source-layer": "aeroway",
      minzoom: 10,
      paint: {
        "fill-color": "#d6d6d6",
        "fill-opacity": 0.65,
        "fill-outline-color": "#999999",
      },
    }),
    layer({
      id: `${sourceId}-boundary`,
      type: "line",
      "source-layer": "boundary",
      minzoom: 3,
      paint: {
        "line-color": "#c76b73",
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 10, 1.5],
        "line-dasharray": [2, 2],
        "line-opacity": 0.75,
      },
    }),
    layer({
      id: `${sourceId}-transportation-casing`,
      type: "line",
      "source-layer": sourceLayer,
      minzoom: 4,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 10, 4, 14, 10],
        "line-opacity": 0.9,
      },
    }),
    layer({
      id: `${sourceId}-transportation`,
      type: "line",
      "source-layer": sourceLayer,
      minzoom: 4,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "match",
          ["get", "class"],
          "motorway",
          "#f7ecd5",
          "trunk",
          "#f3e7ca",
          "primary",
          "#f3dca8",
          "secondary",
          "#f6e6c4",
          "tertiary",
          "#faefd9",
          "#f1dfb8",
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 10, 1.8, 14, 5],
        "line-opacity": 0.92,
      },
    }),
    textLayer(`${sourceId}-transportation-name`, sourceId, "transportation_name", 10, 0.5),
    textLayer(`${sourceId}-water-name`, sourceId, "water_name", 10, 0.5, "#3979bd"),
    textLayer(`${sourceId}-place`, sourceId, "place", 5, 0, "#334155"),
    textLayer(`${sourceId}-aerodrome-label`, sourceId, "aerodrome_label", 10, 0, "#475569"),
    textLayer(`${sourceId}-mountain-peak`, sourceId, "mountain_peak", 10, 0, "#166534"),
    layer({
      id: `${sourceId}-poi`,
      type: "circle",
      "source-layer": "poi",
      minzoom: 12,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2, 16, 4],
        "circle-color": "#8b5cf6",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
      },
    }),
    textLayer(`${sourceId}-poi-label`, sourceId, "poi", 13, 0, "#4c1d95"),
    textLayer(`${sourceId}-housenumber`, sourceId, "housenumber", 15, 0, "#64748b", "housenumber"),
  ] as StyleSpecification["layers"];
}

function textLayer(
  id: string,
  sourceId: string,
  sourceLayer: string,
  minzoom: number,
  textOffset = 0,
  textColor = "#334155",
  textField = "name"
) {
  const textSizeEndZoom = Math.max(minzoom + 1, 14);

  return {
    id,
    type: "symbol",
    source: sourceId,
    "source-layer": sourceLayer,
    minzoom,
    layout: {
      "text-field": ["coalesce", ["get", textField], ["get", "name:latin"], ["get", "name_int"], ["get", "name"]],
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        minzoom,
        10,
        textSizeEndZoom,
        13,
      ],
      "text-offset": [0, textOffset],
      "text-allow-overlap": false,
      "text-font": ["Open Sans Regular"],
    },
    paint: {
      "text-color": textColor,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
  } as StyleSpecification["layers"][number];
}

export function getMapStyle(
  tileServerBaseMap?: TileServerBaseMap,
  tileServerOverlays: TileServerBaseMap[] = []
): StyleSpecification | string {
  return getTileServerMapStyle(
    tileServerBaseMap ?? DEFAULT_TILE_SERVER_BASE_MAP,
    tileServerOverlays
  );
}
