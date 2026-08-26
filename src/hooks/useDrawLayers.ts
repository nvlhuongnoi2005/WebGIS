import { useEffect } from "react";
import type { MutableRefObject } from "react";
import * as maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection, Geometry, Point } from "geojson";

import type {
  DrawCoordinate,
  DrawFeatureCollection,
  DrawFeatureId,
  DrawGeometry,
  DrawMode,
} from "../tools/DrawTool";

interface UseDrawLayersOptions {
  map: MutableRefObject<maplibregl.Map | null>;
  mapLoaded: boolean;
  mapStyleVersion: number;
  drawings: DrawFeatureCollection;
  draftCoordinates: DrawCoordinate[];
  selectedFeatureId: DrawFeatureId | null;
  mode: DrawMode;
}

const DRAWINGS_SOURCE_ID = "drawings-source";
const DRAFT_SOURCE_ID = "drawings-draft-source";
const SELECTION_SOURCE_ID = "drawings-selection-source";
const VERTICES_SOURCE_ID = "drawings-vertices-source";
const DRAFT_VERTICES_SOURCE_ID = "drawings-draft-vertices-source";

export function useDrawLayers({
  map,
  mapLoaded,
  mapStyleVersion,
  drawings,
  draftCoordinates,
  selectedFeatureId,
  mode,
}: UseDrawLayersOptions) {
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    ensureDrawLayers(map.current);
  }, [map, mapLoaded, mapStyleVersion]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;
    setSourceData(mapInstance, DRAWINGS_SOURCE_ID, drawings);

    const selectedFeature = drawings.features.find(
      feature => feature.properties.drawId === selectedFeatureId
    );
    setSourceData(mapInstance, SELECTION_SOURCE_ID, {
      type: "FeatureCollection",
      features: selectedFeature ? [selectedFeature] : [],
    });

    setSourceData(mapInstance, DRAFT_SOURCE_ID, createDraftCollection(draftCoordinates, mode));
    setSourceData(mapInstance, VERTICES_SOURCE_ID, createVertexCollection(selectedFeature, mode));
    setSourceData(
      mapInstance,
      DRAFT_VERTICES_SOURCE_ID,
      createDraftVertexCollection(draftCoordinates, mode)
    );
  }, [
    drawings,
    draftCoordinates,
    map,
    mapLoaded,
    mapStyleVersion,
    mode,
    selectedFeatureId,
  ]);
}

function ensureDrawLayers(map: maplibregl.Map) {
  addSourceIfMissing(map, DRAWINGS_SOURCE_ID);
  addSourceIfMissing(map, DRAFT_SOURCE_ID);
  addSourceIfMissing(map, SELECTION_SOURCE_ID);
  addSourceIfMissing(map, VERTICES_SOURCE_ID);
  addSourceIfMissing(map, DRAFT_VERTICES_SOURCE_ID);

  addFillLayer(map, "drawings-fill-layer", DRAWINGS_SOURCE_ID, "#e65100", 0.18);
  addLineLayer(map, "drawings-line-layer", DRAWINGS_SOURCE_ID, "#e65100", 3, 0.9);
  addPointLayer(map, "drawings-point-layer", DRAWINGS_SOURCE_ID, "#e65100");

  addFillLayer(map, "drawings-selection-fill-layer", SELECTION_SOURCE_ID, "#1976d2", 0.28);
  addLineLayer(map, "drawings-selection-line-layer", SELECTION_SOURCE_ID, "#1976d2", 5, 1);
  addPointLayer(map, "drawings-selection-point-layer", SELECTION_SOURCE_ID, "#1976d2");

  addFillLayer(map, "drawings-draft-fill-layer", DRAFT_SOURCE_ID, "#1976d2", 0.12);
  addLineLayer(map, "drawings-draft-line-layer", DRAFT_SOURCE_ID, "#1976d2", 4, 1, [2, 1]);
  addPointLayer(map, "drawings-vertices-layer", VERTICES_SOURCE_ID, "#1976d2");
  addPointLayer(map, "drawings-draft-vertices-layer", DRAFT_VERTICES_SOURCE_ID, "#1976d2");
}

function addSourceIfMissing(map: maplibregl.Map, id: string) {
  if (!map.getSource(id)) {
    map.addSource(id, {
      type: "geojson",
      data: emptyGeometryCollection(),
    });
  }
}

function addFillLayer(map: maplibregl.Map, id: string, source: string, color: string, opacity: number) {
  if (map.getLayer(id)) return;

  map.addLayer({
    id,
    type: "fill",
    source,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": color, "fill-opacity": opacity },
  });
}

function addLineLayer(
  map: maplibregl.Map,
  id: string,
  source: string,
  color: string,
  width: number,
  opacity: number,
  dasharray?: [number, number]
) {
  if (map.getLayer(id)) return;

  map.addLayer({
    id,
    type: "line",
    source,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": color,
      "line-width": width,
      "line-opacity": opacity,
      ...(dasharray ? { "line-dasharray": dasharray } : {}),
    },
  });
}

function addPointLayer(map: maplibregl.Map, id: string, source: string, color: string) {
  if (map.getLayer(id)) return;

  map.addLayer({
    id,
    type: "circle",
    source,
    paint: {
      "circle-radius": id === "drawings-vertices-layer" ? 5 : 7,
      "circle-color": "#ffffff",
      "circle-stroke-color": color,
      "circle-stroke-width": 3,
    },
  });
}

function createDraftCollection(
  coordinates: DrawCoordinate[],
  mode: DrawMode
): FeatureCollection<DrawGeometry> {
  if (coordinates.length === 0 || mode === "select" || mode === "edit") {
    return { type: "FeatureCollection", features: [] };
  }

  const features: Feature<DrawGeometry>[] = [];

  if (coordinates.length >= 2) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    });
  }

  if (mode === "polygon" && coordinates.length >= 3) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[...coordinates, coordinates[0]]],
      },
    });
  }

  return { type: "FeatureCollection", features };
}

function createVertexCollection(
  feature: DrawFeatureCollection["features"][number] | undefined,
  mode: DrawMode
): FeatureCollection<Point> {
  if (!feature || (mode !== "select" && mode !== "edit")) {
    return { type: "FeatureCollection", features: [] };
  }

  const coordinates = getEditableCoordinates(feature.geometry);

  return {
    type: "FeatureCollection",
    features: coordinates.map(({ coordinate, vertexIndex, ringIndex }) => ({
      type: "Feature",
      properties: {
        drawId: feature.properties.drawId,
        vertexIndex,
        ringIndex,
      },
      geometry: { type: "Point", coordinates: coordinate },
    })),
  };
}

function createDraftVertexCollection(
  coordinates: DrawCoordinate[],
  mode: DrawMode
): FeatureCollection<Point> {
  if (coordinates.length === 0 || mode === "select" || mode === "edit") {
    return { type: "FeatureCollection", features: [] };
  }

  return {
    type: "FeatureCollection",
    features: coordinates.map((coordinate, vertexIndex) => ({
      type: "Feature",
      properties: { vertexIndex },
      geometry: { type: "Point", coordinates: coordinate },
    })),
  };
}

function getEditableCoordinates(geometry: DrawGeometry) {
  if (geometry.type === "Point") {
    return [{ coordinate: geometry.coordinates as DrawCoordinate, vertexIndex: 0, ringIndex: 0 }];
  }

  if (geometry.type === "LineString") {
    return geometry.coordinates.map((coordinate, vertexIndex) => ({
      coordinate: coordinate as DrawCoordinate,
      vertexIndex,
      ringIndex: 0,
    }));
  }

  return geometry.coordinates[0]
    .slice(0, -1)
    .map((coordinate, vertexIndex) => ({
      coordinate: coordinate as DrawCoordinate,
      vertexIndex,
      ringIndex: 0,
    }));
}

function setSourceData(
  map: maplibregl.Map,
  id: string,
  data: FeatureCollection<Geometry>
) {
  const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  source?.setData(data);
}

function emptyGeometryCollection(): FeatureCollection<Geometry> {
  return { type: "FeatureCollection", features: [] };
}
