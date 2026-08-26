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
import {
  Edit3,
  Redo2,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { DrawMode } from "../../../tools/DrawTool";

interface DrawPanelProps {
  drawingCount: number;
  draftPointCount: number;
  error: string | null;
  mode: DrawMode;
  hasSelection: boolean;
  canFinish: boolean;
  canRedo: boolean;
  canUndo: boolean;
  onChangeMode: (mode: DrawMode) => void;
  onClear: () => void;
  onDelete: () => void;
  onFinish: () => void;
  onRedo: () => void;
  onUndo: () => void;
}

function DrawPanel({
  drawingCount,
  draftPointCount,
  error,
  mode,
  hasSelection,
  canFinish,
  canRedo,
  canUndo,
  onChangeMode,
  onClear,
  onDelete,
  onFinish,
  onRedo,
  onUndo,
}: DrawPanelProps) {
  const { t } = useTranslation();
  const selectedMode = mode === "edit" ? "select" : mode;

  return (
    <Paper elevation={4} sx={panelSx}>
      <Stack spacing={1.25}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary">{t("draw.savedFeatures")}</Typography>
          <Typography variant="h6" color="primary.main" sx={{ fontWeight: 700 }}>{drawingCount}</Typography>
        </Stack>

        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={selectedMode}
          onChange={(_, value: DrawMode | null) => value && onChangeMode(value)}
          sx={{
            "& .MuiToggleButton-root": {
              px: 1,
              textTransform: "none",
            },
          }}
        >
          <ToggleButton value="select">{t("draw.select")}</ToggleButton>
          <ToggleButton value="point">{t("draw.point")}</ToggleButton>
          <ToggleButton value="line">{t("draw.line")}</ToggleButton>
          <ToggleButton value="polygon">{t("draw.polygon")}</ToggleButton>
        </ToggleButtonGroup>

        <Typography variant="caption" color="text.secondary">
          {mode === "select"
            ? t("draw.selectHint")
            : mode === "edit"
              ? t("draw.editHint")
              : t("draw.modeHint", { count: draftPointCount })}
        </Typography>

        {error && <Alert severity="error" variant="outlined">{t(error)}</Alert>}

        <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", columnGap: 0.75, rowGap: 0.75 }}>
          {hasSelection && mode !== "edit" && (
            <Button size="small" variant="outlined" startIcon={<Edit3 size={15} />} onClick={() => onChangeMode("edit")}>
              {t("draw.edit")}
            </Button>
          )}
          {mode === "edit" && (
            <Button size="small" variant="outlined" onClick={() => onChangeMode("select")}>
              {t("draw.done")}
            </Button>
          )}
          {(mode === "line" || mode === "polygon") && (
            <Button size="small" variant="contained" startIcon={<Save size={15} />} onClick={onFinish} disabled={!canFinish}>
              {t("draw.save")}
            </Button>
          )}
          {hasSelection && (
            <Button size="small" color="error" variant="text" startIcon={<Trash2 size={15} />} onClick={onDelete}>
              {t("draw.delete")}
            </Button>
          )}
          <Button size="small" variant="outlined" startIcon={<Undo2 size={15} />} onClick={onUndo} disabled={!canUndo}>
            {t("draw.undo")}
          </Button>
          <Button size="small" variant="outlined" startIcon={<Redo2 size={15} />} onClick={onRedo} disabled={!canRedo}>
            {t("draw.redo")}
          </Button>
          <Button
            size="small"
            color="error"
            variant="text"
            onClick={onClear}
            disabled={drawingCount === 0 && draftPointCount === 0}
          >
            {t("draw.clear")}
          </Button>
        </Stack>

        <Divider />
      </Stack>
    </Paper>
  );
}

const panelSx = {
  position: "absolute",
  left: { xs: 8, sm: 16 },
  top: { xs: 76, sm: 72 },
  bottom: { xs: 8, sm: 16 },
  zIndex: "var(--z-overlay-panel)",
  width: { xs: "calc(100vw - 16px)", sm: 360 },
  maxWidth: "calc(100vw - 16px)",
  p: { xs: 1.5, sm: 2 },
  overflowY: "auto",
  borderRadius: { xs: 2, sm: 1.5 },
};

export default DrawPanel;
