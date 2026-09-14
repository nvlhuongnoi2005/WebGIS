import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MutableRefObject } from "react";
import type { FeatureCollection, Point } from "geojson";
import * as maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";

import {
  fetchValhallaRoute,
  type RouteResult,
  type RoutingVehicle,
} from "../tools/routing/RoutingTool";
import type { MapCoordinates } from "../types/map";

interface UseRoutingOptions {
  map: MutableRefObject<Map | null>;
  mapLoaded: boolean;
  mapStyleVersion: number;
}

export type RoutingStatus = "idle" | "loading" | "success" | "error";

export function useRouting({ map, mapLoaded, mapStyleVersion }: UseRoutingOptions) {
  const { t, i18n } = useTranslation();
  const valhallaLanguage = (i18n.resolvedLanguage || i18n.language || "en")
    .toLowerCase()
    .startsWith("vi")
    ? "vi-VN"
    : "en-US";
  const [origin, setOrigin] = useState<MapCoordinates | null>(null);
  const [destination, setDestination] = useState<MapCoordinates | null>(null);
  const [vehicle, setVehicle] = useState<RoutingVehicle>("auto");
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [status, setStatus] = useState<RoutingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const lastRequestedLanguage = useRef<string | null>(null);

  const reset = useCallback(() => {
    requestController.current?.abort();
    setOrigin(null);
    setDestination(null);
    setRoute(null);
    setStatus("idle");
    setError(null);
  }, []);

  const setRoutingOrigin = useCallback((point: MapCoordinates | null) => {
    requestController.current?.abort();
    setOrigin(point);
    setRoute(null);
    setStatus("idle");
    setError(null);
  }, []);

  const setRoutingDestination = useCallback((point: MapCoordinates | null) => {
    requestController.current?.abort();
    setDestination(point);
    setRoute(null);
    setStatus("idle");
    setError(null);
  }, []);

  const requestRoute = useCallback(async (requestedVehicle: RoutingVehicle) => {
    if (!origin || !destination) {
      return;
    }

    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    lastRequestedLanguage.current = valhallaLanguage;
    setStatus("loading");
    setError(null);

    try {
      const result = await fetchValhallaRoute(
        origin,
        destination,
        requestedVehicle,
        controller.signal,
        valhallaLanguage
      );
      if (!controller.signal.aborted) {
        setRoute(result);
        setStatus("success");
      }
    } catch (requestError) {
      if (controller.signal.aborted) {
        return;
      }

      setRoute(null);
      setStatus("error");
      const errorKey = requestError instanceof Error ? requestError.message : "routing.errors.unknown";
      setError(errorKey.startsWith("routing.errors.") ? t(errorKey) : t("routing.errors.unknown"));
    }
  }, [destination, origin, t, valhallaLanguage]);

  const calculateRoute = useCallback(
    () => requestRoute(vehicle),
    [requestRoute, vehicle]
  );

  const changeVehicle = useCallback((nextVehicle: RoutingVehicle) => {
    const shouldRecalculate = Boolean(origin && destination) &&
      (status === "success" || status === "loading");

    requestController.current?.abort();
    setVehicle(nextVehicle);

    if (shouldRecalculate) {
      void requestRoute(nextVehicle);
      return;
    }

    setRoute(null);
    setStatus("idle");
    setError(null);
  }, [destination, origin, requestRoute, status]);

  useEffect(() => {
    if (
      status !== "success" ||
      !origin ||
      !destination ||
      lastRequestedLanguage.current === valhallaLanguage
    ) {
      return;
    }

    void calculateRoute();
  }, [calculateRoute, destination, origin, status, valhallaLanguage]);

  useEffect(() => {
    if (!map.current || !mapLoaded) {
      return;
    }

    ensureRoutingLayers(map.current);
    updateRoutingSources(map.current, origin, destination, route);
  }, [destination, map, mapLoaded, mapStyleVersion, origin, route]);

  useEffect(() => () => requestController.current?.abort(), []);

  return {
    origin,
    destination,
    setOrigin: setRoutingOrigin,
    setDestination: setRoutingDestination,
    vehicle,
    route,
    status,
    error,
    setVehicle: changeVehicle,
    calculateRoute,
    reset,
  };
}

function ensureRoutingLayers(map: Map) {
  if (!map.getSource("routing-line")) {
    map.addSource("routing-line", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getSource("routing-points")) {
    map.addSource("routing-points", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer("routing-line-outline")) {
    map.addLayer({
      id: "routing-line-outline",
      type: "line",
      source: "routing-line",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 },
    });
  }

  if (!map.getLayer("routing-line-layer")) {
    map.addLayer({
      id: "routing-line-layer",
      type: "line",
      source: "routing-line",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#1565c0", "line-width": 5, "line-opacity": 0.95 },
    });
  }

  if (!map.getLayer("routing-points-layer")) {
    map.addLayer({
      id: "routing-points-layer",
      type: "circle",
      source: "routing-points",
      paint: {
        "circle-radius": 8,
        "circle-color": ["match", ["get", "kind"], "origin", "#16a34a", "#dc2626"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 3,
      },
    });
  }

  if (!map.getLayer("routing-points-labels")) {
    map.addLayer({
      id: "routing-points-labels",
      type: "symbol",
      source: "routing-points",
      layout: {
        "text-field": ["get", "label"],
        "text-size": 12,
        "text-offset": [0, 1.5],
        "text-allow-overlap": true,
      },
      paint: { "text-color": "#172033", "text-halo-color": "#ffffff", "text-halo-width": 2 },
    });
  }
}

function updateRoutingSources(
  map: Map,
  origin: MapCoordinates | null,
  destination: MapCoordinates | null,
  route: RouteResult | null
) {
  const lineSource = map.getSource("routing-line") as maplibregl.GeoJSONSource | undefined;
  lineSource?.setData(route?.geometry ?? { type: "FeatureCollection", features: [] });

  const features = [
    origin && {
      type: "Feature" as const,
      properties: { kind: "origin", label: "A" },
      geometry: { type: "Point" as const, coordinates: origin },
    },
    destination && {
      type: "Feature" as const,
      properties: { kind: "destination", label: "B" },
      geometry: { type: "Point" as const, coordinates: destination },
    },
  ].filter(Boolean);

  const pointSource = map.getSource("routing-points") as maplibregl.GeoJSONSource | undefined;
  pointSource?.setData({ type: "FeatureCollection", features } as FeatureCollection<Point>);
}
