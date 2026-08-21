import {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";

import type {
  Map,
  MapMouseEvent,
} from "maplibre-gl";

import {
  isSelfIntersectingPolygon,
} from "../tools/MeasureTool";

import type {
  Coordinate,
  MeasureMode,
} from "../tools/MeasureTool";

import type {
  MapTool,
} from "../types/map";

interface UseMeasureToolOptions {
  map: MutableRefObject<Map | null>;
  mapLoaded: boolean;
  activeTool: MapTool;
  setActiveTool: Dispatch<SetStateAction<MapTool>>;
}

export function useMeasureTool({
  map,
  mapLoaded,
  activeTool,
  setActiveTool,
}: UseMeasureToolOptions) {
  const [measureMode, setMeasureMode] =
    useState<MeasureMode>("distance");

  const [measurePoints, setMeasurePoints] =
    useState<Coordinate[]>([]);

  const [undoStack, setUndoStack] =
    useState<Coordinate[][]>([]);

  const [redoStack, setRedoStack] =
    useState<Coordinate[][]>([]);

  const [measureError, setMeasureError] =
    useState<string | null>(null);

  const [isAreaComplete, setIsAreaComplete] =
    useState(false);

  const resetMeasure =
    useCallback(() => {
      setMeasurePoints([]);
      setUndoStack([]);
      setRedoStack([]);
      setMeasureError(null);
      setIsAreaComplete(false);
    }, []);

  const commitMeasurePoints =
    useCallback(
      (nextPoints: Coordinate[]) => {
        setUndoStack(history => [
          ...history,
          measurePoints,
        ]);

        setRedoStack([]);
        setMeasurePoints(nextPoints);
        setIsAreaComplete(false);
      },
      [measurePoints]
    );

  const undoMeasure =
    useCallback(() => {
      const previousPoints = undoStack.at(-1);

      if (!previousPoints) {
        return;
      }

      setMeasureError(null);
      setIsAreaComplete(false);
      setRedoStack(history => [
        ...history,
        measurePoints,
      ]);
      setMeasurePoints(previousPoints);
      setUndoStack(history => history.slice(0, -1));
    }, [measurePoints, undoStack]);

  const redoMeasure =
    useCallback(() => {
      const nextPoints = redoStack.at(-1);

      if (!nextPoints) {
        return;
      }

      setMeasureError(null);
      setIsAreaComplete(false);
      setUndoStack(history => [
        ...history,
        measurePoints,
      ]);
      setMeasurePoints(nextPoints);
      setRedoStack(history => history.slice(0, -1));
    }, [measurePoints, redoStack]);

  const clearMeasure =
    useCallback(() => {
      if (measurePoints.length === 0) {
        return;
      }

      setMeasureError(null);
      commitMeasurePoints([]);
    }, [commitMeasurePoints, measurePoints.length]);

  const changeMeasureMode =
    useCallback(
      (mode: MeasureMode) => {
        if (mode === measureMode) {
          return;
        }

        setMeasureMode(mode);
        resetMeasure();
      },
      [measureMode, resetMeasure]
    );

  const startMeasure =
    useCallback(() => {
      resetMeasure();
      setMeasureMode("distance");
    }, [resetMeasure]);

  useEffect(() => {
    if (!map.current || !mapLoaded) {
      return;
    }

    const mapInstance = map.current;
    const canvas = mapInstance.getCanvas();

    if (activeTool !== "measure") {
      canvas.style.cursor = "";

      return;
    }

    canvas.style.cursor = "crosshair";

    const handleMouseEnter = () => {
      canvas.style.cursor = "pointer";
    };

    const handleMouseLeave = () => {
      canvas.style.cursor = "crosshair";
    };

    mapInstance.on(
      "mouseenter",
      "measure-points-layer",
      handleMouseEnter
    );
    mapInstance.on(
      "mouseleave",
      "measure-points-layer",
      handleMouseLeave
    );

    return () => {
      canvas.style.cursor = "";
      mapInstance.off(
        "mouseenter",
        "measure-points-layer",
        handleMouseEnter
      );
      mapInstance.off(
        "mouseleave",
        "measure-points-layer",
        handleMouseLeave
      );
    };
  }, [activeTool, map, mapLoaded]);

  useEffect(() => {
    const handleKeyDown =
      (event: KeyboardEvent) => {
        if (
          event.key === "Escape" &&
          activeTool === "measure"
        ) {
          resetMeasure();
          setActiveTool(null);

          return;
        }

        if (
          activeTool !== "measure" ||
          !(event.ctrlKey || event.metaKey)
        ) {
          return;
        }

        const key = event.key.toLowerCase();

        if (key === "z" && !event.shiftKey) {
          event.preventDefault();
          undoMeasure();

          return;
        }

        if (
          (key === "z" && event.shiftKey) ||
          key === "y"
        ) {
          event.preventDefault();
          redoMeasure();
        }
      };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    activeTool,
    redoMeasure,
    resetMeasure,
    setActiveTool,
    undoMeasure,
  ]);

  useEffect(() => {
    if (!map.current || !mapLoaded) {
      return;
    }

    const mapInstance = map.current;

    const handleMapClick =
      (event: MapMouseEvent) => {
        if (activeTool !== "measure") {
          return;
        }

        const bbox: [
          [number, number],
          [number, number]
        ] = [
          [event.point.x - 8, event.point.y - 8],
          [event.point.x + 8, event.point.y + 8],
        ];

        const features =
          mapInstance.getLayer("measure-points-layer")
            ? mapInstance.queryRenderedFeatures(
                bbox,
                {
                  layers: ["measure-points-layer"],
                }
              )
            : [];

        if (features.length > 0) {
          const index = features[0].properties?.index;

          if (typeof index === "number") {
            if (measureMode === "area") {
              if (isAreaComplete) {
                return;
              }

              const polygonCandidate =
                measurePoints.slice(index);

              if (polygonCandidate.length >= 3) {
                if (
                  isSelfIntersectingPolygon(
                    polygonCandidate
                  )
                ) {
                  setMeasureError(
                    "measure.errorSelfIntersect"
                  );

                  return;
                }

                setMeasureError(null);
                if (index > 0) {
                  setUndoStack(history => [
                    ...history,
                    measurePoints,
                  ]);
                  setRedoStack([]);
                  setMeasurePoints(polygonCandidate);
                }
                setIsAreaComplete(true);

                return;
              }

              setMeasureError(null);
              commitMeasurePoints(
                measurePoints.filter(
                  (_, pointIndex) => pointIndex !== index
                )
              );

              return;
            }

            if (isAreaComplete) {
              return;
            }

            setMeasureError(null);
            commitMeasurePoints(
              measurePoints.filter(
                (_, pointIndex) => pointIndex !== index
              )
            );
          }

          return;
        }

        if (isAreaComplete) {
          return;
        }

        const point: Coordinate = [
          event.lngLat.lng,
          event.lngLat.lat,
        ];

        const nextPoints = [
          ...measurePoints,
          point,
        ];

        if (
          measureMode === "area" &&
          isSelfIntersectingPolygon(nextPoints)
        ) {
          setMeasureError(
            "measure.errorSelfIntersect"
          );

          return;
        }

        setMeasureError(null);
        commitMeasurePoints(nextPoints);
      };

    mapInstance.on("click", handleMapClick);

    return () => {
      mapInstance.off("click", handleMapClick);
    };
  }, [
    activeTool,
    commitMeasurePoints,
    map,
    mapLoaded,
    isAreaComplete,
    measureMode,
    measurePoints,
  ]);

  return {
    measureMode,
    measurePoints,
    measureError,
    isAreaComplete,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    changeMeasureMode,
    clearMeasure,
    redoMeasure,
    resetMeasure,
    startMeasure,
    undoMeasure,
  };
}
