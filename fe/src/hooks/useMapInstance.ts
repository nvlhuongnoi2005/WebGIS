import {
  createElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot, type Root } from "react-dom/client";

import * as maplibregl from "maplibre-gl";

import {
  getMapStyle,
} from "../tools/map/MapStyleTool";
import MapPositionPopup from "../features/map/components/MapPositionPopup";
import {
  transformFromWgs84,
  type CoordinateReferenceSystem,
} from "../tools/coordinate/CoordinateTool";

const INITIAL_MAP_CENTER: [number, number] = [105.8342, 21.0278];

export function useMapInstance(
  coordinateReferenceSystem: CoordinateReferenceSystem,
  coordinatePickingEnabled: boolean,
  onPositionMarkerClose?: () => void
) {
  const mapContainer =
    useRef<HTMLDivElement | null>(null);

  const map =
    useRef<maplibregl.Map | null>(null);

  const [mapLoaded, setMapLoaded] =
    useState(false);

  const marker =
    useRef<maplibregl.Marker | null>(null);

  const popupRoot =
    useRef<Root | null>(null);

  const [hoveredCoordinate, setHoveredCoordinate] =
    useState<[number, number]>(INITIAL_MAP_CENTER);

  const lastClickedCoordinate =
    useRef<[number, number] | null>(null);

  const coordinateReferenceSystemRef =
    useRef(coordinateReferenceSystem);

  const coordinatePickingEnabledRef =
    useRef(coordinatePickingEnabled);

  const clearPositionMarker = () => {
    const activeMarker = marker.current;
    const activePopupRoot = popupRoot.current;

    marker.current = null;
    popupRoot.current = null;
    lastClickedCoordinate.current = null;

    activePopupRoot?.unmount();
    activeMarker?.remove();
  };

  const placeMarkerAtCoordinate = (
    mapInstance: maplibregl.Map,
    coordinate: [number, number]
  ) => {
    clearPositionMarker();
    lastClickedCoordinate.current = coordinate;

    const transformed = transformFromWgs84(
      coordinate,
      coordinateReferenceSystemRef.current
    );

    const popupContent = document.createElement("div");
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: 38,
      maxWidth: "none",
      className: "map-position-popup-container",
    })
      .setLngLat(coordinate)
      .setDOMContent(popupContent);

    popupRoot.current = createRoot(popupContent);
    popupRoot.current.render(
      createElement(MapPositionPopup, {
        longitude: transformed[0],
        latitude: transformed[1],
        crs: coordinateReferenceSystemRef.current,
      })
    );

    const positionMarker = new maplibregl.Marker({
      color: "#e0002b",
      anchor: "bottom",
      offset: [0, 6],
      subpixelPositioning: true,
    })
      .setLngLat(coordinate)
      .setPopup(popup);

    popup.on("close", () => {
      if (marker.current !== positionMarker) {
        return;
      }

      clearPositionMarker();
      onPositionMarkerClose?.();
    });

    marker.current = positionMarker;
    positionMarker.addTo(mapInstance).togglePopup();
  };

  const placeMarkerAtCurrentLocation = () => {
    const mapInstance = map.current;

    if (!mapInstance || !mapLoaded) {
      return;
    }
    
    if (!navigator.geolocation) {
      console.error("Geolocation is not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const currentMap = map.current;

        if (!currentMap || !coordinatePickingEnabledRef.current) {
          return;
        }

        const coordinate: [number, number] = [
          coords.longitude,
          coords.latitude,
        ];

        placeMarkerAtCoordinate(currentMap, coordinate);
        currentMap.flyTo({
          center: coordinate,
          zoom: Math.max(currentMap.getZoom(), 12),
          essential: true,
        });
      },
      error => {
        console.error("Unable to get the current location:", error.message);
      }
    );
  };

  useEffect(() => {
    coordinateReferenceSystemRef.current = coordinateReferenceSystem;

    if (!popupRoot.current || !lastClickedCoordinate.current) {
      return;
    }

    const transformed = transformFromWgs84(
      lastClickedCoordinate.current,
      coordinateReferenceSystem
    );

    popupRoot.current.render(
      createElement(MapPositionPopup, {
        longitude: transformed[0],
        latitude: transformed[1],
        crs: coordinateReferenceSystem,
      })
    );

  }, [coordinateReferenceSystem]);

  useEffect(() => {
    coordinatePickingEnabledRef.current = coordinatePickingEnabled;

    if (coordinatePickingEnabled) {
      return;
    }

    clearPositionMarker();
  }, [coordinatePickingEnabled]);

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
        style: getMapStyle(),
        center: INITIAL_MAP_CENTER,
        zoom: 4,
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

    const handleMapMouseMove = (event: maplibregl.MapMouseEvent) => {
      setHoveredCoordinate([event.lngLat.lng, event.lngLat.lat]);
    };

    mapInstance.on("mousemove", handleMapMouseMove);

    mapInstance.on("error", event => {
      console.error(
        "MapLibre error:",
        event
      );
    });

    return () => {
      mapInstance.off("load", applyNavigationTooltips);
      mapInstance.off("mousemove", handleMapMouseMove);
      clearPositionMarker();
      mapInstance.remove();

      map.current = null;

      setMapLoaded(false);
    };
  }, []);

  return {
    mapContainer,
    map,
    mapLoaded,
    hoveredCoordinate,
    placeMarkerAtCurrentLocation,
  };
}
