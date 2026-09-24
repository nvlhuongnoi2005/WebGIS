import { useEffect } from "react";
import type { MutableRefObject } from "react";
import * as maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection, Geometry, Point, Position } from "geojson";
import {
  DRAW_FEATURE_ID_PROPERTY,
  DRAW_VERTEX_COORDINATE_PATH_PROPERTY,
  DRAW_VERTEX_GEOMETRY_PATH_PROPERTY,
  encodeDrawPath,
} from "../tools/draw/DrawTool";
import type {
  DrawCoordinate,
  DrawFeatureCollection,
  DrawFeatureId,
  DrawGeometry,
  DrawMode,
} from "../tools/draw/DrawTool";

interface UseDrawLayersOptions {
  map: MutableRefObject<maplibregl.Map | null>;
  mapLoaded: boolean;
  mapStyleVersion: number;
  drawings: DrawFeatureCollection;
  hiddenFeatureIds: ReadonlySet<DrawFeatureId>;
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
  hiddenFeatureIds,
  draftCoordinates,
  selectedFeatureId,
  mode,
}: UseDrawLayersOptions) {
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;
    // setStyle(..., { diff: false }) removes every custom GeoJSON source and
    // layer. Recreate them and restore their data atomically after style.load
    // so draw features cannot disappear when a basemap or overlay changes.
    ensureDrawLayers(mapInstance);
    setSourceData(
      mapInstance,
      DRAWINGS_SOURCE_ID,
      createRenderableDrawings(drawings, hiddenFeatureIds)
    );

    const selectedFeature = drawings.features.find((feature) => feature.id === selectedFeatureId);
    const visibleSelectedFeature =
      selectedFeature && !hiddenFeatureIds.has(selectedFeature.id) ? selectedFeature : undefined;
    setSourceData(mapInstance, SELECTION_SOURCE_ID, {
      type: "FeatureCollection",
      features: visibleSelectedFeature ? [visibleSelectedFeature] : [],
    });

    setSourceData(mapInstance, DRAFT_SOURCE_ID, createDraftCollection(draftCoordinates, mode));
    setSourceData(
      mapInstance,
      VERTICES_SOURCE_ID,
      createVertexCollection(visibleSelectedFeature, mode)
    );
    setSourceData(
      mapInstance,
      DRAFT_VERTICES_SOURCE_ID,
      createDraftVertexCollection(draftCoordinates, mode)
    );
  }, [
    drawings,
    draftCoordinates,
    hiddenFeatureIds,
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

  addFillLayer(map, "drawings-fill-layer", DRAWINGS_SOURCE_ID, "#e0002b", 0.18);
  addLineLayer(map, "drawings-line-layer", DRAWINGS_SOURCE_ID, "#a90020", 3, 0.9);
  addPointLayer(map, "drawings-point-layer", DRAWINGS_SOURCE_ID, "#e0002b");

  addFillLayer(map, "drawings-selection-fill-layer", SELECTION_SOURCE_ID, "#ff5b75", 0.28);
  addLineLayer(map, "drawings-selection-line-layer", SELECTION_SOURCE_ID, "#ff5b75", 5, 1);
  addPointLayer(map, "drawings-selection-point-layer", SELECTION_SOURCE_ID, "#ff5b75");

  addFillLayer(map, "drawings-draft-fill-layer", DRAFT_SOURCE_ID, "#ff5b75", 0.12);
  addLineLayer(map, "drawings-draft-line-layer", DRAFT_SOURCE_ID, "#ff5b75", 4, 1, [2, 1]);
  addPointLayer(map, "drawings-vertices-layer", VERTICES_SOURCE_ID, "#ff5b75");
  addPointLayer(map, "drawings-draft-vertices-layer", DRAFT_VERTICES_SOURCE_ID, "#ff5b75");

  // Custom editing affordances must remain above the basemap and vector
  // overlay layers, including after a style diff preserves an older layer.
  [
    "drawings-fill-layer",
    "drawings-line-layer",
    "drawings-point-layer",
    "drawings-selection-fill-layer",
    "drawings-selection-line-layer",
    "drawings-selection-point-layer",
    "drawings-draft-fill-layer",
    "drawings-draft-line-layer",
    "drawings-vertices-layer",
    "drawings-draft-vertices-layer",
  ].forEach((id) => {
    if (map.getLayer(id)) map.moveLayer(id);
  });
}

function createRenderableDrawings(
  drawings: DrawFeatureCollection,
  hiddenFeatureIds: ReadonlySet<DrawFeatureId>
): FeatureCollection<Geometry> {
  return {
    type: drawings.type,
    ...(drawings.bbox ? { bbox: drawings.bbox } : {}),
    features: drawings.features
      .filter((feature) => !hiddenFeatureIds.has(feature.id))
      .map((feature) => ({
        ...feature,
        properties: {
          ...(feature.properties ?? {}),
          [DRAW_FEATURE_ID_PROPERTY]: feature.id,
        },
      })),
  };
}

function addSourceIfMissing(map: maplibregl.Map, id: string) {
  if (!map.getSource(id)) {
    map.addSource(id, {
      type: "geojson",
      data: emptyGeometryCollection(),
    });
  }
}

function addFillLayer(
  map: maplibregl.Map,
  id: string,
  source: string,
  color: string,
  opacity: number
) {
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
  const geometryFilter: maplibregl.FilterSpecification = ["in", "$type", "LineString", "Polygon"];

  if (map.getLayer(id)) {
    map.setFilter(id, geometryFilter);
    return;
  }

  map.addLayer({
    id,
    type: "line",
    source,
    filter: geometryFilter,
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

  if (mode === "multipoint") {
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPoint", coordinates },
    });
  } else if (coordinates.length >= 2) {
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
    features: coordinates.map(({ coordinate, geometryPath, coordinatePath }) => ({
      type: "Feature",
      properties: {
        drawId: feature.id,
        [DRAW_VERTEX_GEOMETRY_PATH_PROPERTY]: encodeDrawPath(geometryPath),
        [DRAW_VERTEX_COORDINATE_PATH_PROPERTY]: encodeDrawPath(coordinatePath),
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
  return collectEditableCoordinates(geometry, []);
}

function collectEditableCoordinates(
  geometry: DrawGeometry,
  geometryPath: number[]
): EditableCoordinate[] {
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.flatMap((child, index) =>
      collectEditableCoordinates(child, [...geometryPath, index])
    );
  }

  if (geometry.type === "Point") {
    return [createEditableCoordinate(geometry.coordinates, geometryPath, [])];
  }

  if (geometry.type === "MultiPoint") {
    return geometry.coordinates.map((coordinate, index) =>
      createEditableCoordinate(coordinate, geometryPath, [index])
    );
  }

  if (geometry.type === "LineString") {
    return geometry.coordinates.map((coordinate, index) =>
      createEditableCoordinate(coordinate, geometryPath, [index])
    );
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.flatMap((line, lineIndex) =>
      line.map((coordinate, coordinateIndex) =>
        createEditableCoordinate(coordinate, geometryPath, [lineIndex, coordinateIndex])
      )
    );
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates.flatMap((ring, ringIndex) =>
      ring
        .slice(0, -1)
        .map((coordinate, coordinateIndex) =>
          createEditableCoordinate(coordinate, geometryPath, [ringIndex, coordinateIndex])
        )
    );
  }

  return geometry.coordinates.flatMap((polygon, polygonIndex) =>
    polygon.flatMap((ring, ringIndex) =>
      ring
        .slice(0, -1)
        .map((coordinate, coordinateIndex) =>
          createEditableCoordinate(coordinate, geometryPath, [
            polygonIndex,
            ringIndex,
            coordinateIndex,
          ])
        )
    )
  );
}

interface EditableCoordinate {
  coordinate: DrawCoordinate;
  geometryPath: number[];
  coordinatePath: number[];
}

function createEditableCoordinate(
  coordinate: Position,
  geometryPath: number[],
  coordinatePath: number[]
): EditableCoordinate {
  return {
    coordinate: [coordinate[0], coordinate[1]],
    geometryPath,
    coordinatePath,
  };
}

function setSourceData(map: maplibregl.Map, id: string, data: FeatureCollection<Geometry>) {
  const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  source?.setData(data);
}

function emptyGeometryCollection(): FeatureCollection<Geometry> {
  return { type: "FeatureCollection", features: [] };
}
