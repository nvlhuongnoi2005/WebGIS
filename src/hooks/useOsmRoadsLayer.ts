import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { FeatureCollection, LineString, MultiLineString } from "geojson";
import type { GeoJSONSource, Map } from "maplibre-gl";

type RoadGeometry = LineString | MultiLineString;
type RoadFeatureCollection = FeatureCollection<RoadGeometry>;

type RoadStatus = "idle" | "loading" | "ready" | "zoom-in" | "error";

interface UseOsmRoadsLayerOptions {
  map: MutableRefObject<Map | null>;
  mapLoaded: boolean;
  mapStyleVersion: number;
  enabled: boolean;
}

const SOURCE_ID = "osm-roads-source";
const CASING_LAYER_ID = "osm-roads-casing-layer";
const LAYER_ID = "osm-roads-layer";
const MIN_ZOOM = 3;
const EMPTY_ROADS: RoadFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function useOsmRoadsLayer({
  map,
  mapLoaded,
  mapStyleVersion,
  enabled,
}: UseOsmRoadsLayerOptions) {
  const [status, setStatus] = useState<RoadStatus>("idle");
  const [roadCount, setRoadCount] = useState(0);
  const roadsRef = useRef<RoadFeatureCollection>(EMPTY_ROADS);
  const reloadRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const mapInstance = map.current;
    let disposed = false;
    let activeController: AbortController | null = null;

    if (!mapInstance || !mapLoaded || !enabled) {
      roadsRef.current = EMPTY_ROADS;
      return;
    }

    const ensureLayers = () => {
      if (!mapInstance.getSource(SOURCE_ID)) {
        mapInstance.addSource(SOURCE_ID, {
          type: "geojson",
          data: roadsRef.current,
        });
      }

      if (!mapInstance.getLayer(CASING_LAYER_ID)) {
        mapInstance.addLayer({
          id: CASING_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: {
            "line-color": "#ffffff",
            "line-opacity": 0.9,
            "line-width": 5,
          },
        });
      }

      if (!mapInstance.getLayer(LAYER_ID)) {
        mapInstance.addLayer({
          id: LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: {
            "line-color": [
              "match",
              ["get", "highway"],
              "motorway", "#b91c1c",
              "trunk", "#dc2626",
              "primary", "#ea580c",
              "secondary", "#f59e0b",
              "#2563eb",
            ],
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              7, 1.5,
              12, 3,
              16, 5,
            ],
            "line-opacity": 0.9,
          },
        });
      }
    };

    const setData = (data: RoadFeatureCollection) => {
      const source = mapInstance.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(data);
    };

    const loadRoads = async () => {
      if (mapInstance.getZoom() < MIN_ZOOM) {
        roadsRef.current = EMPTY_ROADS;
        setData(EMPTY_ROADS);
        setRoadCount(0);
        setStatus("zoom-in");
        return;
      }

      const bounds = mapInstance.getBounds();
      const bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ].join(",");
      const zoom = Math.floor(mapInstance.getZoom());
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      setStatus("loading");

      try {
        const response = await fetch(
          `/api/osm/roads?bbox=${encodeURIComponent(bbox)}&zoom=${zoom}&limit=500`,
          { signal: controller.signal },
        );

        const body = await response.json() as RoadFeatureCollection & { error?: string };

        if (!response.ok) {
          throw new Error(body.error ?? "Unable to load OSM roads.");
        }

        if (disposed) return;

        roadsRef.current = body;
        setData(body);
        setRoadCount(body.features.length);
        setStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;

        console.error("OSM roads request failed:", error);
        setStatus("error");
      }

    };

    ensureLayers();
    void loadRoads();
    const handleMoveEnd = () => void loadRoads();
    mapInstance.on("moveend", handleMoveEnd);
    reloadRef.current = handleMoveEnd;

    return () => {
      disposed = true;
      activeController?.abort();
      mapInstance.off("moveend", handleMoveEnd);
      reloadRef.current = null;

      if (mapInstance.getLayer(LAYER_ID)) mapInstance.removeLayer(LAYER_ID);
      if (mapInstance.getLayer(CASING_LAYER_ID)) mapInstance.removeLayer(CASING_LAYER_ID);
      if (mapInstance.getSource(SOURCE_ID)) mapInstance.removeSource(SOURCE_ID);
    };
  }, [enabled, map, mapLoaded, mapStyleVersion]);

  return {
    status: enabled ? status : "idle" as const,
    roadCount: enabled ? roadCount : 0,
    reload: () => reloadRef.current?.(),
  };
}
