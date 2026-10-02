import type { FilterSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

export const POI_FILTER_CATEGORIES = ["food", "health", "education", "finance", "tourism"] as const;

export type PoiFilterCategory = (typeof POI_FILTER_CATEGORIES)[number];

const POI_CLASSES: Record<PoiFilterCategory, string[]> = {
  food: ["restaurant", "fast_food", "cafe"],
  health: ["hospital", "clinic", "doctors", "pharmacy"],
  education: ["school", "college", "university", "kindergarten"],
  finance: ["atm", "bank"],
  tourism: ["hotel", "museum", "attraction", "viewpoint", "zoo"],
};

function poiClassFilter(categories: readonly PoiFilterCategory[]): FilterSpecification {
  const classes = categories.flatMap((category) => POI_CLASSES[category]);

  // A deliberately unmatched class keeps the map quiet until the user asks
  // for a POI category. Search results use their own marker and stay visible.
  return ["in", "class", ...(classes.length ? classes : ["__hidden_poi__"])] as FilterSpecification;
}

export function applyPoiCategoryFilter(map: MapLibreMap, categories: readonly PoiFilterCategory[]) {
  if (!map.isStyleLoaded()) {
    return;
  }

  const filter = poiClassFilter(categories);

  for (const layer of map.getStyle().layers ?? []) {
    if (layer.id.endsWith("-poi") || layer.id.endsWith("-poi-label")) {
      map.setFilter(layer.id, filter);
    }
  }
}

export interface TileServerBaseMap {
  id: string;
  label: string;
  tilePath: string;
  stylePath?: string;
  maxzoom: number;
  tileSize: number;
  kind: "raster" | "vector";
  role: "basemap" | "overlay";
  sourceLayer?: string;
}

export const DEFAULT_TILE_SERVER_BASE_MAP: TileServerBaseMap = {
  id: "vietnam",
  label: "OPENSTREETMAP_VIETNAM",
  tilePath: "/datas/vietnam/{z}/{x}/{y}.pbf",
  stylePath: "/styles/openstreetmap/style.json",
  maxzoom: 14,
  tileSize: 512,
  kind: "vector",
  role: "basemap",
};

const TILE_SERVER_URL = "/api/tiles";
const TILE_SERVER_CATALOG_URL = "/api/tile-catalog";

const TILE_SERVER_BACKEND_URL = (
  import.meta.env.VITE_TILE_SERVER_URL || "http://localhost:8080"
).replace(/\/$/, "");

const TILE_SERVER_DATASET_STYLE_PATHS: Readonly<Record<string, string>> = {
  vietnam: "/styles/openstreetmap/style.json",
};

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
      role: "basemap",
    };
  }

  if (!item || typeof item !== "object") {
    throw new Error(`Dataset tại vị trí ${index} không hợp lệ.`);
  }

  const record = item as TileServerCatalogItem;
  const id = String(record.id ?? record.name ?? record.label ?? `dataset-${index}`);
  const label = String(record.label ?? record.name ?? record.id ?? id);
  const tilePath = String(
    record.tilePath ?? record.tileUrl ?? record.path ?? record.url ?? `/datas/${id}/{z}/{x}/{y}.png`
  );
  // The tile server may expose `type: baselayer` and `format: pbf`.
  // Do not let the non-format `type` value hide the actual vector format.
  const format =
    `${String(record.type ?? "")} ${String(record.format ?? "")} ${tilePath}`.toLowerCase();
  const kind =
    format.includes("pbf") || format.includes("mvt") || format.includes("vector")
      ? "vector"
      : "raster";
  const sourceLayer = record.sourceLayer ?? record.source_layer;
  // OPENSTREETMAP_VIETNAM is published as an overlay TileJSON, but its
  // accompanying server-side style is a complete basemap style.
  const role = TILE_SERVER_DATASET_STYLE_PATHS[id]
    ? "basemap"
    : String(record.type ?? "")
          .trim()
          .toLowerCase() === "overlay"
      ? "overlay"
      : "basemap";

  return {
    id,
    label,
    tilePath,
    stylePath: TILE_SERVER_DATASET_STYLE_PATHS[id],
    maxzoom: positiveNumber(record.maxzoom ?? record.maxZoom, 7),
    tileSize: positiveNumber(record.tileSize, 256),
    kind,
    role,
    sourceLayer:
      typeof sourceLayer === "string" && sourceLayer.trim() ? sourceLayer.trim() : undefined,
  };
}

export function isTileServerOverlay(dataset: TileServerBaseMap) {
  return dataset.role === "overlay";
}

export function splitTileServerDatasets(datasets: TileServerBaseMap[]) {
  return {
    baseMaps: datasets.filter((dataset) => !isTileServerOverlay(dataset)),
    overlays: datasets.filter((dataset) => isTileServerOverlay(dataset)),
  };
}

async function getTileServerRootDatasetIds(html: string) {
  const matches = [
    ...html.matchAll(/identifier:\s*\$\{escapeHTML\("([^"]+)"\)\}/g),
    ...html.matchAll(/\/datas\/([a-zA-Z0-9._-]+)\/\{z\}/g),
  ];

  return Array.from(new Set(matches.map((match) => match[1])));
}

async function fetchTileServerRootCatalog(html: string): Promise<TileServerBaseMap[]> {
  const ids = await getTileServerRootDatasetIds(html);

  const datasets = await Promise.all(
    ids.map(async (id, index) => {
      try {
        const response = await fetch(`${TILE_SERVER_URL}/datas/${encodeURIComponent(id)}.json`);

        if (response.ok) {
          const tileJson = (await response.json()) as Record<string, unknown>;
          return normalizeCatalogItem(
            {
              id,
              name: tileJson.name,
              tilePath: Array.isArray(tileJson.tiles) ? tileJson.tiles[0] : undefined,
              type: tileJson.type,
              maxzoom: tileJson.maxzoom,
              tileSize: tileJson.tileSize,
            },
            index
          );
        }
      } catch {
        // Keep the dataset discoverable even if its TileJSON request fails.
      }

      return normalizeCatalogItem({ id }, index);
    })
  );

  return datasets;
}

export async function fetchTileServerBaseMaps(signal?: AbortSignal): Promise<TileServerBaseMap[]> {
  // This action is explicitly triggered by the user from the layer panel, so
  // bypass browser caches and inspect the Tile Server's current datasets.
  const response = await fetch(TILE_SERVER_CATALOG_URL, { signal, cache: "no-store" });

  if (response.ok && response.headers.get("content-type")?.includes("json")) {
    const payload = (await response.json()) as unknown;
    const datasets = getCatalogItems(payload).map(normalizeCatalogItem);

    if (datasets.length === 0) {
      throw new Error("Tile server chưa có dataset nào.");
    }

    return Array.from(new Map(datasets.map((dataset) => [dataset.id, dataset])).values());
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

export function resolveTileServerAssetUrl(tilePath: string) {
  if (tilePath.startsWith("http")) {
    try {
      const url = new URL(tilePath);
      const backendUrl = new URL(TILE_SERVER_BACKEND_URL);

      // TileJSON generated inside Kubernetes contains an internal URL such as
      // http://tile-server:8080/datas/vietnam_osm/{z}/{x}/{y}.pbf. That DNS
      // name is intentionally not visible to browsers. Tile assets from any
      // Tile Server origin must therefore use the public Controller proxy.
      if (
        url.pathname.startsWith("/datas/") ||
        url.pathname.startsWith("/fonts/") ||
        url.pathname.startsWith("/sprites/") ||
        url.pathname.startsWith("/styles/")
      ) {
        // Do not use URL.pathname here: it encodes MapLibre's {z}/{x}/{y}
        // template placeholders as %7Bz%7D/%7Bx%7D/%7By%7D.
        const tilePathAndQuery = tilePath.slice(url.origin.length);
        return `${TILE_SERVER_URL}${tilePathAndQuery.startsWith("/") ? "" : "/"}${tilePathAndQuery}`;
      }

      if (url.origin === backendUrl.origin) {
        // Do not use URL.pathname here: it encodes MapLibre's {z}/{x}/{y}
        // template placeholders as %7Bz%7D/%7Bx%7D/%7By%7D.
        const backendPath = tilePath.slice(backendUrl.origin.length);
        return `${TILE_SERVER_URL}${backendPath.startsWith("/") ? "" : "/"}${backendPath}`;
      }
    } catch {
      // Keep the original URL when it cannot be parsed.
    }

    return tilePath;
  }

  return `${TILE_SERVER_URL}${tilePath.startsWith("/") ? "" : "/"}${tilePath}`;
}

export function getTileServerPreviewUrl(baseMap: TileServerBaseMap) {
  return resolveTileServerAssetUrl(baseMap.tilePath)
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
): StyleSpecification | string {
  if (baseMap.stylePath && overlays.length === 0) {
    return resolveTileServerAssetUrl(baseMap.stylePath);
  }

  const sourceId = `tile-server-${baseMap.id}`;
  const tileUrl = resolveTileServerAssetUrl(baseMap.tilePath);
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

  overlays.forEach((overlay) => {
    const overlaySourceId = getTileServerOverlaySourceId(overlay);
    const overlayTileUrl = resolveTileServerAssetUrl(overlay.tilePath);

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
      layers.push(...getOpenMapTilesOverlayLayers(overlaySourceId, overlay.sourceLayer));
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
      // Keep the active basemap visible beneath a raster overlay. Multiple
      // selected overlays remain distinguishable instead of becoming opaque.
      paint: { "raster-opacity": 0.72 },
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
        "fill-color": [
          "match",
          ["get", "subclass"],
          "wood",
          "#7fba72",
          "grass",
          "#a8cf8d",
          "farmland",
          "#d8d59a",
          "#d8e7c4",
        ],
        "fill-opacity": 0.26,
      },
    }),
    layer({
      id: `${sourceId}-landuse`,
      type: "fill",
      "source-layer": "landuse",
      minzoom: 4,
      paint: {
        "fill-color": [
          "match",
          ["get", "class"],
          "residential",
          "#f2e8dc",
          "industrial",
          "#e6d2ca",
          "commercial",
          "#e8d9ed",
          "#e7ebd5",
        ],
        "fill-opacity": 0.28,
        "fill-outline-color": "#b9c7a5",
      },
    }),
    layer({
      id: `${sourceId}-park`,
      type: "fill",
      "source-layer": "park",
      minzoom: 8,
      paint: {
        "fill-color": "#8fcf83",
        "fill-opacity": 0.4,
        "fill-outline-color": "#4f9e5b",
      },
    }),
    layer({
      id: `${sourceId}-water`,
      type: "fill",
      "source-layer": "water",
      minzoom: 0,
      paint: {
        "fill-color": "#72b7e8",
        "fill-opacity": 0.58,
      },
    }),
    layer({
      id: `${sourceId}-waterway`,
      type: "line",
      "source-layer": "waterway",
      minzoom: 7,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#3389d6",
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.6, 12, 2, 15, 5],
        "line-opacity": 0.9,
      },
    }),
    layer({
      id: `${sourceId}-building`,
      type: "fill",
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-color": "#d9cfc5",
        "fill-opacity": 0.52,
        "fill-outline-color": "#a99d91",
      },
    }),
    layer({
      id: `${sourceId}-aeroway`,
      type: "fill",
      "source-layer": "aeroway",
      minzoom: 10,
      paint: {
        "fill-color": "#cbd4dc",
        "fill-opacity": 0.48,
        "fill-outline-color": "#8090a0",
      },
    }),
    layer({
      id: `${sourceId}-boundary-casing`,
      type: "line",
      "source-layer": "boundary",
      minzoom: 3,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "rgba(255, 255, 255, 0.9)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2, 10, 4],
        "line-opacity": 0.9,
      },
    }),
    layer({
      id: `${sourceId}-boundary`,
      type: "line",
      "source-layer": "boundary",
      minzoom: 3,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#c73e5b",
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 10, 2],
        "line-dasharray": [2, 1.5],
        "line-opacity": 0.9,
      },
    }),
    layer({
      id: `${sourceId}-transportation-casing`,
      type: "line",
      "source-layer": sourceLayer,
      minzoom: 4,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "rgba(255, 255, 255, 0.95)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.6, 10, 5, 14, 12],
        "line-opacity": 0.95,
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
          "#e59b4d",
          "trunk",
          "#e8ad58",
          "primary",
          "#f1c66e",
          "secondary",
          "#f6d99b",
          "tertiary",
          "#f8e6c1",
          "#ffffff",
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.7, 10, 2.4, 14, 6.5],
        "line-opacity": 0.98,
      },
    }),
    textLayer(
      `${sourceId}-transportation-name`,
      sourceId,
      "transportation_name",
      10,
      0.6,
      "#6b4226"
    ),
    textLayer(`${sourceId}-water-name`, sourceId, "water_name", 10, 0.5, "#1769aa"),
    textLayer(`${sourceId}-place`, sourceId, "place", 5, 0, "#1f3349"),
    textLayer(`${sourceId}-aerodrome-label`, sourceId, "aerodrome_label", 10, 0, "#334e68"),
    textLayer(`${sourceId}-mountain-peak`, sourceId, "mountain_peak", 10, 0, "#176b3a"),
    layer({
      id: `${sourceId}-poi`,
      type: "circle",
      "source-layer": "poi",
      minzoom: 14,
      filter: poiClassFilter([]),
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2.75, 16, 5],
        "circle-color": [
          "match",
          ["get", "class"],
          "hospital",
          "#dc3e50",
          "clinic",
          "#dc3e50",
          "doctors",
          "#dc3e50",
          "pharmacy",
          "#dc3e50",
          "school",
          "#3d7dd8",
          "college",
          "#3d7dd8",
          "university",
          "#3d7dd8",
          "kindergarten",
          "#3d7dd8",
          "place_of_worship",
          "#8c5ec7",
          "restaurant",
          "#dc7b34",
          "fast_food",
          "#dc7b34",
          "cafe",
          "#dc7b34",
          "atm",
          "#7456c7",
          "bank",
          "#7456c7",
          "#168d8b",
        ],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.95,
      },
    }),
    {
      ...textLayer(`${sourceId}-poi-label`, sourceId, "poi", 15, 0.8, "#274c4b"),
      filter: poiClassFilter([]),
    },
    textLayer(`${sourceId}-housenumber`, sourceId, "housenumber", 17, 0, "#52616b", "housenumber"),
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
      "text-field": [
        "coalesce",
        ["get", textField],
        ["get", "name:latin"],
        ["get", "name_int"],
        ["get", "name"],
      ],
      "text-size": ["interpolate", ["linear"], ["zoom"], minzoom, 10, textSizeEndZoom, 13.5],
      "text-offset": [0, textOffset],
      "text-allow-overlap": false,
      "text-font": ["Open Sans Regular"],
    },
    paint: {
      "text-color": textColor,
      "text-halo-color": "rgba(255, 255, 255, 0.96)",
      "text-halo-width": 2,
      "text-halo-blur": 0.4,
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
