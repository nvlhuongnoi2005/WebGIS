import type { StyleSpecification } from "maplibre-gl";

export type BaseMapStyle =
  | "streets"
  | "satellite"
  | "outdoor";

export type MapDataSource =
  | "maptiler"
  | "tile-server";

export interface TileServerBaseMap {
  id: string;
  label: string;
  tilePath: string;
  maxzoom: number;
  tileSize: number;
}

export const DEFAULT_TILE_SERVER_BASE_MAP: TileServerBaseMap = {
  id: "asia_full",
  label: "Asia Full",
  tilePath: "/datas/asia_full/{z}/{x}/{y}.png",
  maxzoom: 7,
  tileSize: 256,
};

const MAP_STYLE_IDS: Record<BaseMapStyle, string> = {
  streets: "streets-v4",
  satellite: "satellite-v4",
  outdoor: "outdoor-v4",
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

  return {
    id,
    label,
    tilePath,
    maxzoom: positiveNumber(record.maxzoom ?? record.maxZoom, 7),
    tileSize: positiveNumber(record.tileSize, 256),
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

export function getTileServerMapStyle(
  baseMap: TileServerBaseMap
): StyleSpecification {
  const sourceId = `tile-server-${baseMap.id}`;
  const tileUrl = resolveTileServerTileUrl(baseMap.tilePath);

  return {
    version: 8,
    sources: {
      [sourceId]: {
        type: "raster",
        tiles: [tileUrl],
        tileSize: baseMap.tileSize,
        maxzoom: baseMap.maxzoom,
      },
    },
    layers: [
      {
        id: sourceId,
        type: "raster",
        source: sourceId,
      },
    ],
  };
}

export function getMapStyle(
  style: BaseMapStyle,
  dataSource: MapDataSource,
  apiKey?: string,
  tileServerBaseMap?: TileServerBaseMap
): StyleSpecification | string {
  if (dataSource === "maptiler") {
    return `https://api.maptiler.com/maps/${MAP_STYLE_IDS[style]}/style.json?key=${apiKey}`;
  }

  return getTileServerMapStyle(tileServerBaseMap ?? DEFAULT_TILE_SERVER_BASE_MAP);
}
