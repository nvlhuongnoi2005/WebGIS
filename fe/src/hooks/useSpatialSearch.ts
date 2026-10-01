import { useEffect, useRef, useState } from "react";

import type { MutableRefObject } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";

import {
  fetchSpatialSearch,
  type SpatialSearchInput,
  type SpatialSearchResult,
} from "../tools/geocoding/SpatialSearchTool";
import type { MapCoordinates } from "../types/map";

const SPATIAL_SEARCH_SOURCE = "spatial-search-results";
const SPATIAL_SEARCH_MARKERS = "spatial-search-markers";
const SPATIAL_SEARCH_LABELS = "spatial-search-labels";

interface UseSpatialSearchOptions {
  map: MutableRefObject<Map | null>;
  mapLoaded: boolean;
  mapStyleVersion: number;
}

export type SpatialSearchStatus = "idle" | "loading" | "success" | "error";

export function useSpatialSearch({ map, mapLoaded, mapStyleVersion }: UseSpatialSearchOptions) {
  const [result, setResult] = useState<SpatialSearchResult | null>(null);
  const [status, setStatus] = useState<SpatialSearchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestController = useRef<AbortController | null>(null);

  const clear = () => {
    requestController.current?.abort();
    setResult(null);
    setStatus("idle");
    setError(null);
  };

  const search = async (input: SpatialSearchInput) => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setStatus("loading");
    setError(null);

    try {
      const nextResult = await fetchSpatialSearch(input, controller.signal);
      if (controller.signal.aborted) return;
      setResult(nextResult);
      setStatus("success");
      focusFeatures(map.current, nextResult);
    } catch (requestError) {
      if (controller.signal.aborted) return;
      setResult(null);
      setStatus("error");
      setError(requestError instanceof Error ? requestError.message : "Spatial search failed");
    }
  };

  const focusResult = (coordinates: MapCoordinates) => {
    const currentMap = map.current;
    if (!currentMap) return;
    currentMap.flyTo({
      center: coordinates,
      zoom: Math.max(currentMap.getZoom(), 16),
      duration: 700,
    });
  };

  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const currentMap = map.current;

    ensureSpatialSearchLayers(currentMap);
    const source = currentMap.getSource(SPATIAL_SEARCH_SOURCE) as
      maplibregl.GeoJSONSource | undefined;
    source?.setData(result ?? emptyResult());

    const handleClick = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;

      const [longitude, latitude] = feature.geometry.coordinates as [number, number];
      const properties = feature.properties ?? {};
      const content = document.createElement("div");
      content.className = "search-popup-container";
      const title = document.createElement("strong");
      title.innerText = String(properties.name || "Place");
      content.appendChild(title);
      const detail = document.createElement("div");
      detail.className = "search-popup-desc";
      detail.innerText = `${Math.round(Number(properties.distanceMeters) || 0)} m`;
      content.appendChild(detail);
      new maplibregl.Popup({ offset: 14 })
        .setLngLat([longitude, latitude])
        .setDOMContent(content)
        .addTo(currentMap);
    };
    const setPointerCursor = () => {
      currentMap.getCanvas().style.cursor = "pointer";
    };
    const resetCursor = () => {
      currentMap.getCanvas().style.cursor = "";
    };

    currentMap.on("click", SPATIAL_SEARCH_MARKERS, handleClick);
    currentMap.on("mouseenter", SPATIAL_SEARCH_MARKERS, setPointerCursor);
    currentMap.on("mouseleave", SPATIAL_SEARCH_MARKERS, resetCursor);

    return () => {
      currentMap.off("click", SPATIAL_SEARCH_MARKERS, handleClick);
      currentMap.off("mouseenter", SPATIAL_SEARCH_MARKERS, setPointerCursor);
      currentMap.off("mouseleave", SPATIAL_SEARCH_MARKERS, resetCursor);
    };
  }, [map, mapLoaded, mapStyleVersion, result]);

  useEffect(() => () => requestController.current?.abort(), []);

  return { result, status, error, search, clear, focusResult };
}

function emptyResult(): SpatialSearchResult {
  return {
    type: "FeatureCollection",
    features: [],
    reference: { name: "", category: "", kind: "" },
  };
}

function focusFeatures(map: Map | null, result: SpatialSearchResult) {
  if (!map || result.features.length === 0) return;
  const bounds = new maplibregl.LngLatBounds();
  for (const feature of result.features) {
    bounds.extend(feature.geometry.coordinates as MapCoordinates);
  }
  map.fitBounds(bounds, { padding: 88, maxZoom: 15, duration: 900 });
}

function ensureSpatialSearchLayers(map: Map) {
  if (!map.getSource(SPATIAL_SEARCH_SOURCE)) {
    map.addSource(SPATIAL_SEARCH_SOURCE, { type: "geojson", data: emptyResult() });
  }
  if (!map.getLayer(SPATIAL_SEARCH_MARKERS)) {
    map.addLayer({
      id: SPATIAL_SEARCH_MARKERS,
      type: "circle",
      source: SPATIAL_SEARCH_SOURCE,
      paint: {
        "circle-radius": 7,
        "circle-color": "#e85d04",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2.5,
      },
    });
  }
  if (!map.getLayer(SPATIAL_SEARCH_LABELS)) {
    map.addLayer({
      id: SPATIAL_SEARCH_LABELS,
      type: "symbol",
      source: SPATIAL_SEARCH_SOURCE,
      minzoom: 14,
      layout: {
        "text-field": ["get", "name"],
        "text-size": 12,
        "text-offset": [0, 1.3],
        "text-anchor": "top",
        "text-optional": true,
      },
      paint: { "text-color": "#5a2600", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    });
  }
}
