import {
  Alert,
  Button,
  Divider,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { Check, Redo2, Trash2, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  calculateArea,
  calculateTotalDistance,
  formatArea,
  formatDistance,
  type Coordinate,
  type MeasureMode,
} from "../../../tools/MeasureTool";

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
  const resultLabel = measureMode === "distance"
    ? t("measure.totalDistance")
    : isAreaComplete ? t("measure.areaLabel") : t("measure.areaPreview");
  const result = measureMode === "distance"
    ? formatDistance(totalDistance)
    : formatArea(area);

  return (
    <Paper elevation={4} sx={panelSx}>
      <Stack spacing={1.5}>
        <ToggleButtonGroup
          exclusive
          fullWidth
          value={measureMode}
          onChange={(_, value: MeasureMode | null) => {
            if (value) onChangeMode(value);
          }}
          size="small"
        >
          <ToggleButton value="distance">{t("measure.distance")}</ToggleButton>
          <ToggleButton value="area">{t("measure.area")}</ToggleButton>
        </ToggleButtonGroup>

        <Stack direction="row" sx={{ px: 0.5, justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary">{resultLabel}</Typography>
          <Typography variant="h6" color="primary.main" sx={{ fontWeight: 700 }}>{result}</Typography>
        </Stack>

        {measureMode === "area" && !isAreaComplete && measurePoints.length >= 3 && (
          <Typography variant="caption" color="text.secondary">
            {t("measure.closeAreaHint")}
          </Typography>
        )}

        {error && <Alert severity="error" variant="outlined">{t(error)}</Alert>}

        <Divider />

        <Stack direction="row" spacing={0.75}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Undo2 size={15} />}
            onClick={onUndo}
            disabled={!canUndo}
            title={t("measure.undoTitle")}
          >
            {t("measure.undo")}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Redo2 size={15} />}
            onClick={onRedo}
            disabled={!canRedo}
            title={t("measure.redoTitle")}
          >
            {t("measure.redo")}
          </Button>
          <Button size="small" variant="contained" startIcon={<Check size={15} />} onClick={onFinish}>
            {t("measure.finish")}
          </Button>
          <Button
            size="small"
            color="inherit"
            variant="text"
            startIcon={<Trash2 size={15} />}
            onClick={onClear}
            disabled={measurePoints.length === 0}
          >
            {t("measure.clear")}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

const panelSx = {
  position: "absolute",
  left: { xs: 12, sm: 20 },
  top: { xs: 120, sm: 100 },
  zIndex: "var(--z-overlay-panel)",
  width: { xs: "calc(100% - 24px)", sm: 470 },
  maxWidth: { xs: "calc(100% - 24px)", sm: "calc(100% - 40px)" },
  p: 1.5,
};

export default MeasurePanel;
