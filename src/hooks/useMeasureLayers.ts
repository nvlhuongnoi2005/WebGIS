import {
  useEffect,
} from "react";

import type {
  MutableRefObject,
} from "react";

import * as maplibregl from "maplibre-gl";

import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Polygon,
} from "geojson";

import {
  calculateDistance,
  formatDistance,
} from "../tools/MeasureTool";

import type {
  Coordinate,
  MeasureMode,
} from "../tools/MeasureTool";

interface UseMeasureLayersOptions {
  map: MutableRefObject<maplibregl.Map | null>;
  mapLoaded: boolean;
  mapStyleVersion: number;
  measureMode: MeasureMode;
  measurePoints: Coordinate[];
}

export function useMeasureLayers({
  map,
  mapLoaded,
  mapStyleVersion,
  measureMode,
  measurePoints,
}: UseMeasureLayersOptions) {
  useEffect(() => {
    if (!map.current || !mapLoaded) {
      return;
    }

    ensureMeasureLayers(map.current);
  }, [map, mapLoaded, mapStyleVersion]);

  useEffect(() => {
    if (!map.current || !mapLoaded) {
      return;
    }

    const mapInstance = map.current;

    updatePointData(mapInstance, measurePoints);
    updateAreaData(
      mapInstance,
      measureMode,
      measurePoints
    );
    updateLineAndLabelData(
      mapInstance,
      measureMode,
      measurePoints
    );
  }, [
    map,
    mapLoaded,
    mapStyleVersion,
    measureMode,
    measurePoints,
  ]);
}

function ensureMeasureLayers(
  map: maplibregl.Map
) {
  addSourceIfMissing(map, "measure-points");
  addSourceIfMissing(map, "measure-area");
  addSourceIfMissing(map, "measure-lines");
  addSourceIfMissing(map, "measure-labels");

  if (!map.getLayer("measure-area-layer")) {
    map.addLayer({
      id: "measure-area-layer",
      type: "fill",
      source: "measure-area",
      paint: {
        "fill-color": "#1976d2",
        "fill-opacity": 0.18,
      },
    });
  }

  if (!map.getLayer("measure-lines-layer")) {
    map.addLayer({
      id: "measure-lines-layer",
      type: "line",
      source: "measure-lines",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#1976d2",
        "line-width": 3,
        "line-opacity": 0.9,
      },
    });
  }

  if (!map.getLayer("measure-points-layer")) {
    map.addLayer({
      id: "measure-points-layer",
      type: "circle",
      source: "measure-points",
      paint: {
        "circle-radius": 6,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#1976d2",
        "circle-stroke-width": 3,
      },
    });
  }

  if (!map.getLayer("measure-labels-layer")) {
    map.addLayer({
      id: "measure-labels-layer",
      type: "symbol",
      source: "measure-labels",
      layout: {
        "text-field": ["get", "label"],
        "text-size": 12,
        "text-anchor": "center",
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#333333",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2,
      },
    });
  }
}

function addSourceIfMissing(
  map: maplibregl.Map,
  id: string
) {
  if (map.getSource(id)) {
    return;
  }

  map.addSource(id, {
    type: "geojson",
    data: emptyFeatureCollection(),
  });
}

function updatePointData(
  map: maplibregl.Map,
  points: Coordinate[]
) {
  const features:
    Feature<Point>[] =
    points.map((point, index) => ({
      type: "Feature",
      properties: { index },
      geometry: {
        type: "Point",
        coordinates: point,
      },
    }));

  setSourceData(map, "measure-points", {
    type: "FeatureCollection",
    features,
  });
}

function updateAreaData(
  map: maplibregl.Map,
  measureMode: MeasureMode,
  points: Coordinate[]
) {
  const features:
    Feature<Polygon>[] = [];

  if (
    measureMode === "area" &&
    points.length >= 3
  ) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[
          ...points,
          points[0],
        ]],
      },
    });
  }

  setSourceData(map, "measure-area", {
    type: "FeatureCollection",
    features,
  });
}

function updateLineAndLabelData(
  map: maplibregl.Map,
  measureMode: MeasureMode,
  points: Coordinate[]
) {
  const linePoints =
    measureMode === "area" && points.length >= 3
      ? [...points, points[0]]
      : points;

  const lineFeatures:
    Feature<LineString>[] = [];

  const labelFeatures:
    Feature<Point>[] = [];

  for (let index = 1; index < linePoints.length; index++) {
    const point1 = linePoints[index - 1];
    const point2 = linePoints[index];

    lineFeatures.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [point1, point2],
      },
    });

    if (measureMode === "distance") {
      labelFeatures.push({
        type: "Feature",
        properties: {
          label: formatDistance(
            calculateDistance(point1, point2)
          ),
        },
        geometry: {
          type: "Point",
          coordinates: midpoint(point1, point2),
        },
      });
    }
  }

  setSourceData(map, "measure-lines", {
    type: "FeatureCollection",
    features: lineFeatures,
  });

  setSourceData(map, "measure-labels", {
    type: "FeatureCollection",
    features: labelFeatures,
  });
}

function setSourceData(
  map: maplibregl.Map,
  id: string,
  data: FeatureCollection
) {
  const source =
    map.getSource(id) as
      | maplibregl.GeoJSONSource
      | undefined;

  source?.setData(data);
}

function midpoint(
  point1: Coordinate,
  point2: Coordinate
): Coordinate {
  return [
    (point1[0] + point2[0]) / 2,
    (point1[1] + point2[1]) / 2,
  ];
}

function emptyFeatureCollection(): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [],
  };
}
