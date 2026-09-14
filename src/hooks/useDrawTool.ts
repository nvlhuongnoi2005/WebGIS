import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Map, MapMouseEvent } from "maplibre-gl";

import {
  createLineFeature,
  createMultiPointFeature,
  createPointFeature,
  createPolygonFeature,
  DRAW_FEATURE_ID_PROPERTY,
  DRAW_VERTEX_COORDINATE_PATH_PROPERTY,
  DRAW_VERTEX_GEOMETRY_PATH_PROPERTY,
  decodeDrawPath,
  emptyDrawFeatureCollection,
  replaceDrawCoordinate,
  syncDrawFeatureCollectionMeasurements,
  syncDrawFeatureMeasurements,
  type DrawCoordinate,
  type DrawFeatureCollection,
  type DrawFeatureId,
  type DrawGeometry,
  type DrawMode,
  type DrawProperties,
} from "../tools/draw/DrawTool";
import type { MapTool } from "../types/map";

interface UseDrawToolOptions {
  map: MutableRefObject<Map | null>;
  mapLoaded: boolean;
  activeTool: MapTool;
  setActiveTool: Dispatch<SetStateAction<MapTool>>;
}

interface EditSession {
  featureId: DrawFeatureId;
  geometryPath: number[];
  coordinatePath: number[];
  initialCollection: DrawFeatureCollection;
  didMove: boolean;
}
export function useDrawTool({
  map,
  mapLoaded,
  activeTool,
  setActiveTool,
}: UseDrawToolOptions) {
  const [drawings, setDrawings] = useState<DrawFeatureCollection>(emptyDrawFeatureCollection);
  const [editorMode, setEditorMode] = useState<DrawMode>("select");
  const [draftCoordinates, setDraftCoordinates] = useState<DrawCoordinate[]>([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState<DrawFeatureId | null>(null);
  const [hiddenFeatureIds, setHiddenFeatureIds] = useState<Set<DrawFeatureId>>(
    () => new Set()
  );
  const [undoStack, setUndoStack] = useState<DrawFeatureCollection[]>([]);
  const [redoStack, setRedoStack] = useState<DrawFeatureCollection[]>([]);
  const [drawError, setDrawError] = useState<string | null>(null);

  const drawingsRef = useRef(drawings);
  const editSessionRef = useRef<EditSession | null>(null);

  const setDrawingsWithRef = useCallback((nextDrawings: DrawFeatureCollection) => {
    drawingsRef.current = nextDrawings;
    setDrawings(nextDrawings);
  }, []);

  const pruneHiddenFeatureIds = useCallback((nextDrawings: DrawFeatureCollection) => {
    const featureIds = new Set(nextDrawings.features.map(feature => feature.id));
    setHiddenFeatureIds(currentIds => {
      const nextIds = new Set(
        [...currentIds].filter(featureId => featureIds.has(featureId))
      );
      return nextIds.size === currentIds.size ? currentIds : nextIds;
    });
  }, []);

  const commitDrawings = useCallback((nextDrawings: DrawFeatureCollection) => {
    setUndoStack(history => [...history, drawingsRef.current]);
    setRedoStack([]);
    pruneHiddenFeatureIds(nextDrawings);
    setDrawingsWithRef(nextDrawings);
  }, [pruneHiddenFeatureIds, setDrawingsWithRef]);

  const selectFeature = useCallback((featureId: DrawFeatureId | null) => {
    setSelectedFeatureId(featureId);
    setDrawError(null);
  }, []);

  const toggleFeatureVisibility = useCallback((featureId: DrawFeatureId) => {
    setHiddenFeatureIds(currentIds => {
      if (!drawingsRef.current.features.some(feature => feature.id === featureId)) {
        return currentIds;
      }

      const nextIds = new Set(currentIds);
      if (nextIds.has(featureId)) {
        nextIds.delete(featureId);
      } else {
        nextIds.add(featureId);
      }
      return nextIds;
    });
  }, []);

  const changeMode = useCallback((nextMode: DrawMode) => {
    if (nextMode === "edit" && !selectedFeatureId) return;

    setEditorMode(nextMode);
    setDraftCoordinates([]);
    setDrawError(null);

    if (
      nextMode === "point" ||
      nextMode === "multipoint" ||
      nextMode === "line" ||
      nextMode === "polygon"
    ) {
      setSelectedFeatureId(null);
    }
  }, [selectedFeatureId]);

  const finishDraft = useCallback(() => {
    if (editorMode === "multipoint") {
      if (draftCoordinates.length < 1) {
        setDrawError("draw.errorMultiPointPoints");
        return;
      }

      const feature = createMultiPointFeature(
        draftCoordinates,
        drawingsRef.current.features.map(item => item.id)
      );
      commitDrawings({
        ...drawingsRef.current,
        features: [...drawingsRef.current.features, feature],
      });
      setSelectedFeatureId(feature.id);
      setDraftCoordinates([]);
      setEditorMode("select");
      setDrawError(null);
      return;
    }

    if (editorMode === "line") {
      if (draftCoordinates.length < 2) {
        setDrawError("draw.errorLinePoints");
        return;
      }

      const feature = createLineFeature(
        draftCoordinates,
        drawingsRef.current.features.map(item => item.id)
      );
      commitDrawings({
        ...drawingsRef.current,
        features: [...drawingsRef.current.features, feature],
      });
      setSelectedFeatureId(feature.id);
      setDraftCoordinates([]);
      setEditorMode("select");
      setDrawError(null);
      return;
    }

    if (editorMode === "polygon") {
      if (draftCoordinates.length < 3) {
        setDrawError("draw.errorPolygonPoints");
        return;
      }

      const feature = createPolygonFeature(
        draftCoordinates,
        drawingsRef.current.features.map(item => item.id)
      );
      commitDrawings({
        ...drawingsRef.current,
        features: [...drawingsRef.current.features, feature],
      });
      setSelectedFeatureId(feature.id);
      setDraftCoordinates([]);
      setEditorMode("select");
      setDrawError(null);
      return;
    }

  }, [commitDrawings, draftCoordinates, editorMode]);

  const deleteSelected = useCallback(() => {
    if (!selectedFeatureId) return;

    commitDrawings({
      ...drawingsRef.current,
      features: drawingsRef.current.features.filter(
        feature => feature.id !== selectedFeatureId
      ),
    });
    setSelectedFeatureId(null);
    setEditorMode("select");
    setDrawError(null);
  }, [commitDrawings, selectedFeatureId]);

  const clearAllDrawings = useCallback(() => {
    if (drawingsRef.current.features.length > 0) {
      commitDrawings(emptyDrawFeatureCollection());
    }

    setSelectedFeatureId(null);
    setHiddenFeatureIds(new Set());
    setDraftCoordinates([]);
    setEditorMode("select");
    setDrawError(null);
  }, [commitDrawings]);

  const applyGeoJSON = useCallback((nextDrawings: DrawFeatureCollection) => {
    const measuredDrawings = syncDrawFeatureCollectionMeasurements(nextDrawings);
    if (JSON.stringify(measuredDrawings) === JSON.stringify(drawingsRef.current)) return;

    commitDrawings(measuredDrawings);
    setSelectedFeatureId(currentId => {
      if (currentId && measuredDrawings.features.some(feature => feature.id === currentId)) {
        return currentId;
      }
      return null;
    });
    setDraftCoordinates([]);
    setEditorMode("select");
    setDrawError(null);
  }, [commitDrawings]);

  const updateFeatureProperties = useCallback((
    featureId: DrawFeatureId,
    properties: DrawProperties
  ) => {
    const feature = drawingsRef.current.features.find(item => item.id === featureId);
    if (!feature || JSON.stringify(feature.properties) === JSON.stringify(properties)) {
      return;
    }

    commitDrawings({
      ...drawingsRef.current,
      features: drawingsRef.current.features.map(item =>
        item.id === featureId ? { ...item, properties } : item
      ),
    });
  }, [commitDrawings]);

  const undoDraw = useCallback(() => {
    const previous = undoStack.at(-1);
    if (!previous) return;

    setRedoStack(history => [...history, drawingsRef.current]);
    setUndoStack(history => history.slice(0, -1));
    pruneHiddenFeatureIds(previous);
    setDrawingsWithRef(previous);
    setSelectedFeatureId(currentId => {
      if (currentId && previous.features.some(feature => feature.id === currentId)) {
        return currentId;
      }

      return null;
    });
  }, [pruneHiddenFeatureIds, setDrawingsWithRef, undoStack]);

  const redoDraw = useCallback(() => {
    const next = redoStack.at(-1);
    if (!next) return;

    setUndoStack(history => [...history, drawingsRef.current]);
    setRedoStack(history => history.slice(0, -1));
    pruneHiddenFeatureIds(next);
    setDrawingsWithRef(next);
    setSelectedFeatureId(currentId => {
      if (currentId && next.features.some(feature => feature.id === currentId)) {
        return currentId;
      }

      return null;
    });
  }, [pruneHiddenFeatureIds, redoStack, setDrawingsWithRef]);

  useEffect(() => {
    if (!map.current || !mapLoaded || activeTool !== "draw") return;

    const mapInstance = map.current;
    const handleMapClick = (event: MapMouseEvent) => {
      const coordinate: DrawCoordinate = [event.lngLat.lng, event.lngLat.lat];

      if (editorMode === "select") {
        const features = mapInstance.queryRenderedFeatures(event.point, {
          layers: [
            "drawings-fill-layer",
            "drawings-line-layer",
            "drawings-point-layer",
          ],
        });
        const feature = features[0];
        let featureId: string | number | undefined;

        if (feature) {
          if (feature.properties) {
            const propertyValue = feature.properties[DRAW_FEATURE_ID_PROPERTY];
            if (propertyValue !== null && propertyValue !== undefined) {
              featureId = propertyValue;
            } else {
              featureId = feature.id;
            }
          } else {
            featureId = feature.id;
          }
        }

        if (typeof featureId === "string") {
          selectFeature(featureId);
        } else if (typeof featureId === "number") {
          selectFeature(String(featureId));
        } else {
          selectFeature(null);
        }
        return;
      }

      if (editorMode === "point") {
        const feature = createPointFeature(
          coordinate,
          drawingsRef.current.features.map(item => item.id)
        );
        commitDrawings({
          ...drawingsRef.current,
          features: [...drawingsRef.current.features, feature],
        });
        setSelectedFeatureId(feature.id);
        setEditorMode("select");
        return;
      }

      if (
        editorMode === "multipoint" ||
        editorMode === "line" ||
        editorMode === "polygon"
      ) {
        setDraftCoordinates(points => [...points, coordinate]);
        setDrawError(null);
      }
    };

    mapInstance.on("click", handleMapClick);
    return () => {
      mapInstance.off("click", handleMapClick);
    };
  }, [activeTool, commitDrawings, editorMode, map, mapLoaded, selectFeature]);

  useEffect(() => {
    if (!map.current || !mapLoaded || activeTool !== "draw" || editorMode !== "edit") return;

    const mapInstance = map.current;
    const canvas = mapInstance.getCanvas();
    const dragPanWasEnabled = mapInstance.dragPan.isEnabled();
    const previousTouchAction = canvas.style.touchAction;
    canvas.style.cursor = "move";
    canvas.style.touchAction = "none";
    if (dragPanWasEnabled) mapInstance.dragPan.disable();

    const getCanvasPoint = (event: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      const [x, y] = getCanvasPoint(event);
      const features = mapInstance.queryRenderedFeatures([[x - 10, y - 10], [x + 10, y + 10]], {
        layers: ["drawings-vertices-layer"],
      });
      const firstFeature = features[0];
      const properties = firstFeature?.properties;
      const featureId = properties?.[DRAW_FEATURE_ID_PROPERTY];
      const geometryPath = decodeDrawPath(
        properties?.[DRAW_VERTEX_GEOMETRY_PATH_PROPERTY]
      );
      const coordinatePath = decodeDrawPath(
        properties?.[DRAW_VERTEX_COORDINATE_PATH_PROPERTY]
      );

      if (
        typeof featureId !== "string" ||
        !geometryPath ||
        !coordinatePath
      ) {
        return;
      }

      editSessionRef.current = {
        featureId,
        geometryPath,
        coordinatePath,
        initialCollection: drawingsRef.current,
        didMove: false,
      };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const session = editSessionRef.current;
      if (!session) return;

      const [x, y] = getCanvasPoint(event);
      const lngLat = mapInstance.unproject([x, y]);
      const coordinate: DrawCoordinate = [lngLat.lng, lngLat.lat];
      const nextDrawings = updateFeatureVertex(
        drawingsRef.current,
        session.featureId,
        session.geometryPath,
        session.coordinatePath,
        coordinate
      );

      if (nextDrawings === drawingsRef.current) return;
      session.didMove = true;
      setDrawingsWithRef(nextDrawings);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const session = editSessionRef.current;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);

      if (session && session.didMove) {
        setUndoStack(history => [...history, session.initialCollection]);
        setRedoStack([]);
      }
      editSessionRef.current = null;
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);

    return () => {
      editSessionRef.current = null;
      canvas.style.cursor = "";
      canvas.style.touchAction = previousTouchAction;
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      if (dragPanWasEnabled) mapInstance.dragPan.enable();
    };
  }, [activeTool, editorMode, map, mapLoaded, setDrawingsWithRef]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && activeTool === "draw") {
        if (editorMode === "edit") {
          setEditorMode("select");
          return;
        }
        setDraftCoordinates([]);
        setEditorMode("select");
        setActiveTool(null);
        return;
      }

      if (activeTool !== "draw" || !(event.ctrlKey || event.metaKey)) return;

      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoDraw();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redoDraw();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTool, editorMode, redoDraw, setActiveTool, undoDraw]);

  const selectedFeature = drawings.features.find(
    feature => feature.id === selectedFeatureId
  );

  return {
    drawings,
    geoJSON: drawings,
    hiddenFeatureIds,
    draftCoordinates,
    editorMode,
    selectedFeature,
    selectedFeatureId,
    drawError,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    canFinish:
      (editorMode === "multipoint" && draftCoordinates.length >= 1) ||
      (editorMode === "line" && draftCoordinates.length >= 2) ||
      (editorMode === "polygon" && draftCoordinates.length >= 3),
    changeMode,
    applyGeoJSON,
    clearAllDrawings,
    deleteSelected,
    finishDraft,
    redoDraw,
    selectFeature,
    toggleFeatureVisibility,
    updateFeatureProperties,
    undoDraw,
  };
}

function updateFeatureVertex(
  collection: DrawFeatureCollection,
  featureId: DrawFeatureId,
  geometryPath: number[],
  coordinatePath: number[],
  coordinate: DrawCoordinate
): DrawFeatureCollection {
  let changed = false;
  const features = collection.features.map(feature => {
    if (feature.id !== featureId) return feature;

    const geometry = updateGeometryVertex(
      feature.geometry,
      geometryPath,
      coordinatePath,
      coordinate
    );
    if (geometry === feature.geometry) return feature;

    changed = true;
    return syncDrawFeatureMeasurements({ ...feature, geometry });
  });

  if (changed) {
    return { ...collection, features };
  }

  return collection;
}

function updateGeometryVertex(
  geometry: DrawGeometry,
  geometryPath: number[],
  coordinatePath: number[],
  coordinate: DrawCoordinate
): DrawGeometry {
  if (geometryPath.length > 0) {
    if (geometry.type !== "GeometryCollection") return geometry;

    const [childIndex, ...remainingGeometryPath] = geometryPath;
    const child = geometry.geometries[childIndex];
    if (!child) return geometry;

    const updatedChild = updateGeometryVertex(
      child,
      remainingGeometryPath,
      coordinatePath,
      coordinate
    );
    if (updatedChild === child) return geometry;

    const geometries = geometry.geometries.slice();
    geometries[childIndex] = updatedChild;
    return { ...geometry, geometries };
  }

  if (geometry.type === "Point") {
    if (coordinatePath.length !== 0) return geometry;
    return {
      ...geometry,
      coordinates: replaceDrawCoordinate(geometry.coordinates, coordinate),
    };
  }

  if (geometry.type === "MultiPoint") {
    const [pointIndex] = coordinatePath;
    if (coordinatePath.length !== 1 || !geometry.coordinates[pointIndex]) return geometry;

    const coordinates = geometry.coordinates.slice();
    coordinates[pointIndex] = replaceDrawCoordinate(
      coordinates[pointIndex],
      coordinate
    );
    return { ...geometry, coordinates };
  }

  if (geometry.type === "LineString") {
    const [pointIndex] = coordinatePath;
    if (coordinatePath.length !== 1 || !geometry.coordinates[pointIndex]) return geometry;

    const coordinates = geometry.coordinates.slice();
    coordinates[pointIndex] = replaceDrawCoordinate(
      coordinates[pointIndex],
      coordinate
    );
    return { ...geometry, coordinates };
  }

  if (geometry.type === "MultiLineString") {
    const [lineIndex, pointIndex] = coordinatePath;
    const line = geometry.coordinates[lineIndex];
    if (coordinatePath.length !== 2 || !line || !line[pointIndex]) return geometry;

    const coordinates = geometry.coordinates.slice();
    coordinates[lineIndex] = line.slice();
    coordinates[lineIndex][pointIndex] = replaceDrawCoordinate(
      line[pointIndex],
      coordinate
    );
    return { ...geometry, coordinates };
  }

  if (geometry.type === "Polygon") {
    const [ringIndex, pointIndex] = coordinatePath;
    const ring = geometry.coordinates[ringIndex];
    if (coordinatePath.length !== 2 || !ring || !ring[pointIndex]) return geometry;

    const coordinates = geometry.coordinates.slice();
    const nextRing = ring.slice();
    nextRing[pointIndex] = replaceDrawCoordinate(ring[pointIndex], coordinate);
    if (pointIndex === 0) {
      nextRing[nextRing.length - 1] = replaceDrawCoordinate(
        ring[nextRing.length - 1],
        coordinate
      );
    }
    coordinates[ringIndex] = nextRing;
    return { ...geometry, coordinates };
  }

  if (geometry.type === "GeometryCollection") return geometry;

  const [polygonIndex, ringIndex, pointIndex] = coordinatePath;
  const polygon = geometry.coordinates[polygonIndex];
  const ring = polygon?.[ringIndex];
  if (coordinatePath.length !== 3 || !polygon || !ring || !ring[pointIndex]) {
    return geometry;
  }

  const coordinates = geometry.coordinates.slice();
  const nextPolygon = polygon.slice();
  const nextRing = ring.slice();
  nextRing[pointIndex] = replaceDrawCoordinate(ring[pointIndex], coordinate);
  if (pointIndex === 0) {
    nextRing[nextRing.length - 1] = replaceDrawCoordinate(
      ring[nextRing.length - 1],
      coordinate
    );
  }
  nextPolygon[ringIndex] = nextRing;
  coordinates[polygonIndex] = nextPolygon;
  return { ...geometry, coordinates };
}
