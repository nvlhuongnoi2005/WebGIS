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
  getMapStyleUrl,
} from "../tools/MapStyleTool";

import type {
  BaseMapStyle,
} from "../tools/MapStyleTool";

export function useBaseMapStyle(
  map: MutableRefObject<Map | null>
) {
  const [baseMapStyle, setBaseMapStyle] =
    useState<BaseMapStyle>("streets");

  const [mapStyleVersion, setMapStyleVersion] =
    useState(0);

  const changeBaseMapStyle =
    useCallback(
      (style: BaseMapStyle) => {
        if (
          !map.current ||
          style === baseMapStyle
        ) {
          return;
        }

        const apiKey =
          import.meta.env
            .VITE_MAPTILER_API_KEY;

        if (!apiKey) {
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
          getMapStyleUrl(style, apiKey)
        );

        setBaseMapStyle(style);
      },
      [baseMapStyle, map]
    );

  return {
    baseMapStyle,
    changeBaseMapStyle,
    mapStyleVersion,
  };
}
