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
      nextTileServerBaseMap: TileServerBaseMap | null = tileServerBaseMap,
      nextTileServerOverlays: TileServerBaseMap[] = tileServerOverlays
    ) => {
      if (!map.current) {
        return;
      }

      const mapInstance = map.current;
      mapInstance.once("style.load", () => {
        setMapStyleVersion(version => version + 1);
      });
      mapInstance.setStyle(
        getMapStyle(
          style,
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

      changeMapStyle(style);
      setBaseMapStyle(style);
    },
    [baseMapStyle, changeMapStyle, map]
  );

  const changeTileServerBaseMap = useCallback(
    (nextBaseMap: TileServerBaseMap) => {
      changeMapStyle(baseMapStyle, nextBaseMap, tileServerOverlays);
      setTileServerBaseMap(nextBaseMap);
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
      changeMapStyle(baseMapStyle, tileServerBaseMap, nextOverlays);
    },
    [baseMapStyle, changeMapStyle, tileServerBaseMap, tileServerOverlays]
  );

  return {
    baseMapStyle,
    changeBaseMapStyle,
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
