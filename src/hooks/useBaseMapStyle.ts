import {
  useCallback,
  useState,
} from "react";

import type {
  MutableRefObject,
} from "react";

import type {
  Map,
} from "maplibre-gl";

import {
  getMapStyle,
} from "../tools/MapStyleTool";

import type {
  BaseMapStyle,
  MapDataSource,
} from "../tools/MapStyleTool";

export function useBaseMapStyle(
  map: MutableRefObject<Map | null>
) {
  const [baseMapStyle, setBaseMapStyle] =
    useState<BaseMapStyle>("streets");

  const [mapDataSource, setMapDataSource] =
    useState<MapDataSource>("asia-full");

  const [mapStyleVersion, setMapStyleVersion] =
    useState(0);

  const changeMapStyle = useCallback(
    (
      style: BaseMapStyle,
      dataSource: MapDataSource
    ) => {
      if (!map.current) {
        return;
      }

      const apiKey =
        import.meta.env.VITE_MAPTILER_API_KEY;

      if (dataSource === "maptiler" && !apiKey) {
        console.error(
          "VITE_MAPTILER_API_KEY is missing"
        );
        return;
      }

      const mapInstance = map.current;

      mapInstance.once(
        "style.load",
        () => {
          setMapStyleVersion(
            version => version + 1
          );
        }
      );

      mapInstance.setStyle(
        getMapStyle(style, dataSource, apiKey)
      );
    },
    [map]
  );

  const changeBaseMapStyle =
    useCallback(
      (style: BaseMapStyle) => {
        if (
          !map.current ||
          style === baseMapStyle
        ) {
          return;
        }

        changeMapStyle(style, mapDataSource);

        setBaseMapStyle(style);
      },
      [baseMapStyle, changeMapStyle, map, mapDataSource]
    );

  const changeMapDataSource = useCallback(
    (dataSource: MapDataSource) => {
      if (
        !map.current ||
        dataSource === mapDataSource
      ) {
        return;
      }

      changeMapStyle(baseMapStyle, dataSource);
      setMapDataSource(dataSource);
    },
    [baseMapStyle, changeMapStyle, map, mapDataSource]
  );

  return {
    baseMapStyle,
    changeBaseMapStyle,
    mapDataSource,
    changeMapDataSource,
    mapStyleVersion,
  };
}
