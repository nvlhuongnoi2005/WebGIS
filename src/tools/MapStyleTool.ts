import type { StyleSpecification } from "maplibre-gl";

export type BaseMapStyle =
  | "streets"
  | "satellite"
  | "outdoor";

export type MapDataSource =
  | "maptiler"
  | "asia-full";

const MAP_STYLE_IDS:
  Record<BaseMapStyle, string> = {
    streets: "streets-v4",
    satellite: "satellite-v4",
    outdoor: "outdoor-v4",
  };

export const BASE_MAP_TILE_URL =
  "http://localhost:8080/datas/asia_full/{z}/{x}/{y}.png";

export function getMapStyle(
  style: BaseMapStyle,
  dataSource: MapDataSource,
  apiKey?: string
): StyleSpecification | string {
  if (dataSource === "maptiler") {
    return `https://api.maptiler.com/maps/${MAP_STYLE_IDS[style]}/style.json?key=${apiKey}`;
  }

  return {
    version: 8,
    sources: {
      "asia-full": {
        type: "raster",
        tiles: [BASE_MAP_TILE_URL],
        tileSize: 256,
        maxzoom: 7,
      },
    },
    layers: [
      {
        id: "asia-full",
        type: "raster",
        source: "asia-full",
      },
    ],
  };
}
