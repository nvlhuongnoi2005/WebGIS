import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Map, MapMouseEvent } from "maplibre-gl";

import {
  createLineFeature,
  createPointFeature,
  createPolygonFeature,
  DRAW_FEATURE_ID_PROPERTY,
  emptyDrawFeatureCollection,
  type DrawCoordinate,
  type DrawFeatureCollection,
  type DrawFeatureId,
  type DrawGeometry,
  type DrawMode,
} from "../tools/DrawTool";
import type { MapTool } from "../types/map";

interface UseDrawToolOptions {
  map: MutableRefObject<Map | null>;
  mapLoaded: boolean;
  activeTool: MapTool;
  setActiveTool: Dispatch<SetStateAction<MapTool>>;
}

interface EditSession {
  featureId: DrawFeatureId;
  vertexIndex: number;
  ringIndex: number;
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
  const [undoStack, setUndoStack] = useState<DrawFeatureCollection[]>([]);
  const [redoStack, setRedoStack] = useState<DrawFeatureCollection[]>([]);
  const [drawError, setDrawError] = useState<string | null>(null);

  const drawingsRef = useRef(drawings);
  const editSessionRef = useRef<EditSession | null>(null);

  const setDrawingsWithRef = useCallback((nextDrawings: DrawFeatureCollection) => {
    drawingsRef.current = nextDrawings;
    setDrawings(nextDrawings);
  }, []);

  const commitDrawings = useCallback((nextDrawings: DrawFeatureCollection) => {
    setUndoStack(history => [...history, drawingsRef.current]);
    setRedoStack([]);
    setDrawingsWithRef(nextDrawings);
  }, [setDrawingsWithRef]);

  const selectFeature = useCallback((featureId: DrawFeatureId | null) => {
    setSelectedFeatureId(featureId);
    setDrawError(null);
  }, []);

  const changeMode = useCallback((nextMode: DrawMode) => {
    if (nextMode === "edit" && !selectedFeatureId) return;

    setEditorMode(nextMode);
    setDraftCoordinates([]);
    setDrawError(null);

    if (nextMode === "select" || nextMode === "point" || nextMode === "line" || nextMode === "polygon") {
      setSelectedFeatureId(null);
    }
  }, [selectedFeatureId]);

  const finishDraft = useCallback(() => {
    if (editorMode === "line") {
      if (draftCoordinates.length < 2) {
        setDrawError("draw.errorLinePoints");
        return;
      }

      const feature = createLineFeature(draftCoordinates);
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

      const feature = createPolygonFeature(draftCoordinates);
      commitDrawings({
        ...drawingsRef.current,
        features: [...drawingsRef.current.features, feature],
      });
      setSelectedFeatureId(feature.id);
      setDraftCoordinates([]);
      setEditorMode("select");
      setDrawError(null);
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
    setDraftCoordinates([]);
    setEditorMode("select");
    setDrawError(null);
  }, [commitDrawings]);

  const applyGeoJSON = useCallback((nextDrawings: DrawFeatureCollection) => {
    if (JSON.stringify(nextDrawings) === JSON.stringify(drawingsRef.current)) return;

    commitDrawings(nextDrawings);
    setSelectedFeatureId(currentId =>
      currentId && nextDrawings.features.some(feature => feature.id === currentId)
        ? currentId
        : null
    );
    setDraftCoordinates([]);
    setEditorMode("select");
    setDrawError(null);
  }, [commitDrawings]);

  const undoDraw = useCallback(() => {
    const previous = undoStack.at(-1);
    if (!previous) return;

    setRedoStack(history => [...history, drawingsRef.current]);
    setUndoStack(history => history.slice(0, -1));
    setDrawingsWithRef(previous);
    setSelectedFeatureId(currentId =>
      currentId && previous.features.some(feature => feature.id === currentId)
        ? currentId
        : null
    );
  }, [setDrawingsWithRef, undoStack]);

  const redoDraw = useCallback(() => {
    const next = redoStack.at(-1);
    if (!next) return;

    setUndoStack(history => [...history, drawingsRef.current]);
    setRedoStack(history => history.slice(0, -1));
    setDrawingsWithRef(next);
  }, [redoStack, setDrawingsWithRef]);

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
        const featureId = feature?.properties?.[DRAW_FEATURE_ID_PROPERTY] ?? feature?.id;
        selectFeature(
          typeof featureId === "string"
            ? featureId
            : typeof featureId === "number"
              ? String(featureId)
              : null
        );
        return;
      }

      if (editorMode === "point") {
        const feature = createPointFeature(coordinate);
        commitDrawings({
          ...drawingsRef.current,
          features: [...drawingsRef.current.features, feature],
        });
        setSelectedFeatureId(feature.id);
        setEditorMode("select");
        return;
      }

      if (editorMode === "line" || editorMode === "polygon") {
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
      const properties = features[0]?.properties;
      const featureId = properties?.drawId;
      const vertexIndex = Number(properties?.vertexIndex);
      const ringIndex = Number(properties?.ringIndex ?? 0);

      if (
        typeof featureId !== "string" ||
        !Number.isInteger(vertexIndex) ||
        !Number.isInteger(ringIndex)
      ) {
        return;
      }

      editSessionRef.current = {
        featureId,
        vertexIndex,
        ringIndex,
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
        session.vertexIndex,
        session.ringIndex,
        coordinate
      );

      if (nextDrawings === drawingsRef.current) return;
      session.didMove = true;
      setDrawingsWithRef(nextDrawings);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const session = editSessionRef.current;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);

      if (session?.didMove) {
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
    draftCoordinates,
    editorMode,
    selectedFeature,
    selectedFeatureId,
    drawError,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    canFinish: (editorMode === "line" && draftCoordinates.length >= 2) ||
      (editorMode === "polygon" && draftCoordinates.length >= 3),
    changeMode,
    applyGeoJSON,
    clearAllDrawings,
    deleteSelected,
    finishDraft,
    redoDraw,
    selectFeature,
    undoDraw,
  };
}

function updateFeatureVertex(
  collection: DrawFeatureCollection,
  featureId: DrawFeatureId,
  vertexIndex: number,
  ringIndex: number,
  coordinate: DrawCoordinate
): DrawFeatureCollection {
  let changed = false;
  const features = collection.features.map(feature => {
    if (feature.id !== featureId) return feature;

    const geometry = updateGeometryVertex(feature.geometry, vertexIndex, ringIndex, coordinate);
    if (geometry === feature.geometry) return feature;

    changed = true;
    return { ...feature, geometry };
  });

  return changed ? { ...collection, features } : collection;
}

function updateGeometryVertex(
  geometry: DrawGeometry,
  vertexIndex: number,
  ringIndex: number,
  coordinate: DrawCoordinate
): DrawGeometry {
  if (geometry.type === "Point") {
    return { ...geometry, coordinates: coordinate };
  }

  if (geometry.type === "LineString") {
    const coordinates = geometry.coordinates.map((current, index) =>
      index === vertexIndex ? coordinate : current
    );
    return { ...geometry, coordinates };
  }

  const coordinates = geometry.coordinates.map((ring, currentRingIndex) => {
    if (currentRingIndex !== ringIndex) return ring;

    const nextRing = ring.map((current, index) =>
      index === vertexIndex || (vertexIndex === 0 && index === ring.length - 1)
        ? coordinate
        : current
    );
    return nextRing;
  });
  return { ...geometry, coordinates };
}
