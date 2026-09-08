import {
  useCallback,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [baseMapStyle, setBaseMapStyle] =
    useState<BaseMapStyle>("streets");
  const [mapDataSource, setMapDataSource] =
    useState<MapDataSource>("tile-server");
  const [tileServerBaseMaps, setTileServerBaseMaps] =
    useState<TileServerBaseMap[]>([]);
  const [tileServerBaseMap, setTileServerBaseMap] =
    useState<TileServerBaseMap | null>(DEFAULT_TILE_SERVER_BASE_MAP);
  const [tileServerOverlays, setTileServerOverlays] =
    useState<TileServerBaseMap[]>([]);
  const [tileServerCatalogStatus, setTileServerCatalogStatus] =
    useState<TileServerCatalogStatus>("idle");
  const [tileServerCatalogError, setTileServerCatalogError] =
    useState<string | null>(null);
  const [mapStyleVersion, setMapStyleVersion] = useState(0);

  const changeMapStyle = useCallback(
    (
      style: BaseMapStyle,
      dataSource: MapDataSource,
      nextTileServerBaseMap: TileServerBaseMap | null = tileServerBaseMap,
      nextTileServerOverlays: TileServerBaseMap[] = tileServerOverlays
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
        getMapStyle(
          style,
          dataSource,
          apiKey,
          nextTileServerBaseMap ?? undefined,
          nextTileServerOverlays
        ),
        // Rebuild the style so newly selected vector sources/layers are not
        // lost by the style diff when switching from basemap-only mode.
        { diff: false }
      );
    },
    [map, tileServerBaseMap, tileServerOverlays]
  );

  const loadTileServerBaseMaps = useCallback(async () => {
    setTileServerCatalogStatus("loading");
    setTileServerCatalogError(null);

    try {
      const datasets = await fetchTileServerBaseMaps();
      setTileServerBaseMaps(datasets);
      setTileServerCatalogStatus("ready");
      return datasets;
    } catch {
      setTileServerCatalogError(t("layers.tileServerError"));
      setTileServerCatalogStatus("error");
      return [];
    }
  }, [t]);

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
        changeMapStyle(baseMapStyle, "tile-server", tileServerBaseMap);
        void loadTileServerBaseMaps();
        return;
      }

      changeMapStyle(baseMapStyle, dataSource);
    },
    [
      baseMapStyle,
      changeMapStyle,
      loadTileServerBaseMaps,
      mapDataSource,
      tileServerBaseMap,
    ]
  );

  const changeTileServerBaseMap = useCallback(
    (nextBaseMap: TileServerBaseMap) => {
      changeMapStyle(baseMapStyle, "tile-server", nextBaseMap, tileServerOverlays);
      setTileServerBaseMap(nextBaseMap);
      setMapDataSource("tile-server");
    },
    [baseMapStyle, changeMapStyle, tileServerOverlays]
  );

  const toggleTileServerOverlay = useCallback(
    (overlay: TileServerBaseMap) => {
      const isSelected = tileServerOverlays.some(item => item.id === overlay.id);
      const nextOverlays = isSelected
        ? tileServerOverlays.filter(item => item.id !== overlay.id)
        : [...tileServerOverlays, overlay];

      setTileServerOverlays(nextOverlays);
      changeMapStyle(baseMapStyle, "tile-server", tileServerBaseMap, nextOverlays);
    },
    [baseMapStyle, changeMapStyle, tileServerBaseMap, tileServerOverlays]
  );

  return {
    baseMapStyle,
    changeBaseMapStyle,
    mapDataSource,
    changeMapDataSource,
    tileServerBaseMap,
    tileServerOverlays,
    tileServerBaseMaps,
    tileServerCatalogStatus,
    tileServerCatalogError,
    loadTileServerBaseMaps,
    changeTileServerBaseMap,
    toggleTileServerOverlay,
    mapStyleVersion,
  };
}
