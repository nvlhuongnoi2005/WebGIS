import {
  useCallback,
  useState,
} from "react";

import type { MutableRefObject } from "react";
import type { Map } from "maplibre-gl";

import {
  DEFAULT_TILE_SERVER_BASE_MAP,
  fetchTileServerBaseMaps,
  getMapStyle,
} from "../tools/MapStyleTool";
import type {
  BaseMapStyle,
  MapDataSource,
  TileServerBaseMap,
} from "../tools/MapStyleTool";

export type TileServerCatalogStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export function useBaseMapStyle(
  map: MutableRefObject<Map | null>
) {
  const [baseMapStyle, setBaseMapStyle] =
    useState<BaseMapStyle>("streets");
  const [mapDataSource, setMapDataSource] =
    useState<MapDataSource>("tile-server");
  const [tileServerBaseMaps, setTileServerBaseMaps] =
    useState<TileServerBaseMap[]>([]);
  const [tileServerBaseMap, setTileServerBaseMap] =
    useState<TileServerBaseMap | null>(DEFAULT_TILE_SERVER_BASE_MAP);
  const [tileServerCatalogStatus, setTileServerCatalogStatus] =
    useState<TileServerCatalogStatus>("idle");
  const [tileServerCatalogError, setTileServerCatalogError] =
    useState<string | null>(null);
  const [mapStyleVersion, setMapStyleVersion] = useState(0);

  const changeMapStyle = useCallback(
    (
      style: BaseMapStyle,
      dataSource: MapDataSource,
      nextTileServerBaseMap: TileServerBaseMap | null = tileServerBaseMap
    ) => {
      if (!map.current) {
        return;
      }

      const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;

      if (dataSource === "maptiler" && !apiKey) {
        console.error("VITE_MAPTILER_API_KEY is missing");
        return;
      }

      const mapInstance = map.current;
      mapInstance.once("style.load", () => {
        setMapStyleVersion(version => version + 1);
      });
      mapInstance.setStyle(
        getMapStyle(style, dataSource, apiKey, nextTileServerBaseMap ?? undefined)
      );
    },
    [map, tileServerBaseMap]
  );

  const loadTileServerBaseMaps = useCallback(async () => {
    setTileServerCatalogStatus("loading");
    setTileServerCatalogError(null);

    try {
      const datasets = await fetchTileServerBaseMaps();
      setTileServerBaseMaps(datasets);
      setTileServerCatalogStatus("ready");
      return datasets;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Không tải được danh sách tile server.";
      setTileServerCatalogError(message);
      setTileServerCatalogStatus("error");
      return [];
    }
  }, []);

  const changeBaseMapStyle = useCallback(
    (style: BaseMapStyle) => {
      if (!map.current || style === baseMapStyle) {
        return;
      }

      changeMapStyle(style, mapDataSource);
      setBaseMapStyle(style);
    },
    [baseMapStyle, changeMapStyle, map, mapDataSource]
  );

  const changeMapDataSource = useCallback(
    (dataSource: MapDataSource) => {
      if (dataSource === mapDataSource && dataSource !== "tile-server") {
        return;
      }

      setMapDataSource(dataSource);

      if (dataSource === "tile-server") {
        void loadTileServerBaseMaps();
        return;
      }

      changeMapStyle(baseMapStyle, dataSource);
    },
    [baseMapStyle, changeMapStyle, loadTileServerBaseMaps, mapDataSource]
  );

  const changeTileServerBaseMap = useCallback(
    (nextBaseMap: TileServerBaseMap) => {
      changeMapStyle(baseMapStyle, "tile-server", nextBaseMap);
      setTileServerBaseMap(nextBaseMap);
      setMapDataSource("tile-server");
    },
    [baseMapStyle, changeMapStyle]
  );

  return {
    baseMapStyle,
    changeBaseMapStyle,
    mapDataSource,
    changeMapDataSource,
    tileServerBaseMap,
    tileServerBaseMaps,
    tileServerCatalogStatus,
    tileServerCatalogError,
    loadTileServerBaseMaps,
    changeTileServerBaseMap,
    mapStyleVersion,
  };
}
