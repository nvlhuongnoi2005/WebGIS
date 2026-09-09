import { useTranslation } from "react-i18next";
import {
  calculateArea,
  calculateTotalDistance,
  formatArea,
  formatDistance,
} from "../../tools/measure/MeasureTool";

import type {
  Coordinate,
  MeasureMode,
} from "../../tools/measure/MeasureTool";

interface MeasurePanelProps {
  error: string | null;
  isAreaComplete: boolean;
  measureMode: MeasureMode;
  measurePoints: Coordinate[];
  canRedo: boolean;
  canUndo: boolean;
  onChangeMode: (mode: MeasureMode) => void;
  onClear: () => void;
  onFinish: () => void;
  onRedo: () => void;
  onUndo: () => void;
}

function MeasurePanel({
  error,
  isAreaComplete,
  measureMode,
  measurePoints,
  canRedo,
  canUndo,
  onChangeMode,
  onClear,
  onFinish,
  onRedo,
  onUndo,
}: MeasurePanelProps) {
  const { t } = useTranslation();

  const totalDistance = calculateTotalDistance(measurePoints);
  const area = calculateArea(measurePoints);

  return (
    <div className="measure-panel">
      <div className="measure-mode-switch">
        <button
          className={
            measureMode === "distance" ? "measure-mode active" : "measure-mode"
          }
          onClick={() => onChangeMode("distance")}
        >
          {t("measure.distance")}
        </button>

        <button
          className={
            measureMode === "area" ? "measure-mode active" : "measure-mode"
          }
          onClick={() => onChangeMode("area")}
        >
          {t("measure.area")}
        </button>
      </div>

      {measureMode === "distance" && (
        <div className="measure-total">
          <span>{t("measure.totalDistance")}</span>
          <strong>{formatDistance(totalDistance)}</strong>
        </div>
      )}

      {measureMode === "area" && (
        <>
          <div className="measure-total">
            <span>
              {isAreaComplete ? t("measure.areaLabel") : t("measure.areaPreview")}
            </span>
            <strong>{formatArea(area)}</strong>
          </div>

          {!isAreaComplete && measurePoints.length >= 3 && (
            <div className="measure-hint">
              {t("measure.closeAreaHint")}
            </div>
          )}
        </>
      )}

      {error && (
        <div className="measure-error">
          {t(error)}
        </div>
      )}

      <div className="measure-actions">
        <button
          className="measure-clear"
          onClick={onUndo}
          disabled={!canUndo}
          title={t("measure.undoTitle")}
        >
          {t("measure.undo")}
        </button>

        <button
          className="measure-clear"
          onClick={onRedo}
          disabled={!canRedo}
          title={t("measure.redoTitle")}
        >
          {t("measure.redo")}
        </button>

        <button
          className="measure-finish"
          onClick={onFinish}
        >
          {t("measure.finish")}
        </button>

        <button
          className="measure-clear"
          onClick={onClear}
          disabled={measurePoints.length === 0}
        >
          {t("measure.clear")}
        </button>
      </div>
    </div>
  );
}

export default MeasurePanel;
