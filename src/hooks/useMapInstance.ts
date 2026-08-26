import {
  useEffect,
  useRef,
  useState,
} from "react";

import * as maplibregl from "maplibre-gl";

import {
  getMapStyle,
} from "../tools/MapStyleTool";

export function useMapInstance() {
  const mapContainer =
    useRef<HTMLDivElement | null>(null);

  const map =
    useRef<maplibregl.Map | null>(null);

  const [mapLoaded, setMapLoaded] =
    useState(false);

  useEffect(() => {
    if (
      !mapContainer.current ||
      map.current
    ) {
      return;
    }

    const mapInstance =
      new maplibregl.Map({
        container: mapContainer.current,
        style: getMapStyle("streets", "asia-full"),
        center: [105.8342, 21.0278],
        zoom: 7,
      });

    map.current = mapInstance;

    mapInstance.addControl(
      new maplibregl.NavigationControl(),
      "bottom-left"
    );

    // MapLibre navigation buttons are outside React tree, so we set title manually.
    const applyNavigationTooltips = () => {
      const controls = mapContainer.current?.querySelectorAll(
        ".maplibregl-ctrl-group button"
      );

      controls?.forEach(button => {
        const label = button.getAttribute("aria-label")?.trim();

        if (label && !button.getAttribute("title")) {
          button.setAttribute("title", label);
        }
      });
    };

    applyNavigationTooltips();
    mapInstance.on("load", applyNavigationTooltips);

    mapInstance.on("load", () => {
      setMapLoaded(true);
    });

    mapInstance.on("error", event => {
      console.error(
        "MapLibre error:",
        event
      );
    });

    return () => {
      mapInstance.off("load", applyNavigationTooltips);
      mapInstance.remove();

      map.current = null;

      setMapLoaded(false);
    };
  }, []);

  return {
    mapContainer,
    map,
    mapLoaded,
  };
}
