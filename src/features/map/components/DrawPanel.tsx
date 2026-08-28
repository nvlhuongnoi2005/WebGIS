import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Alert,
  Button,
  Divider,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  Braces,
  Download,
  Edit3,
  FileUp,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  normalizeDrawFeatureCollection,
  type DrawFeatureCollection,
  type DrawMode,
} from "../../../tools/DrawTool";

interface DrawPanelProps {
  drawingCount: number;
  draftPointCount: number;
  error: string | null;
  mode: DrawMode;
  hasSelection: boolean;
  canFinish: boolean;
  canRedo: boolean;
  canUndo: boolean;
  geoJSON: DrawFeatureCollection;
  onChangeMode: (mode: DrawMode) => void;
  onApplyGeoJSON: (value: DrawFeatureCollection) => void;
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
  geoJSON,
  onChangeMode,
  onApplyGeoJSON,
  onClear,
  onDelete,
  onFinish,
  onRedo,
  onUndo,
}: DrawPanelProps) {
  const { t } = useTranslation();
  const selectedMode = mode === "edit" ? "select" : mode;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentJson = JSON.stringify(geoJSON, null, 2);
  const [jsonDraft, setJsonDraft] = useState(() => ({
    sourceJson: currentJson,
    text: currentJson,
    error: null as string | null,
  }));
  const isJsonSynced = jsonDraft.sourceJson === currentJson;
  const jsonText = isJsonSynced ? jsonDraft.text : currentJson;
  const jsonError = isJsonSynced ? jsonDraft.error : null;
  const isJsonDirty = jsonText !== currentJson;

  const parseGeoJSON = (text: string): DrawFeatureCollection | null => {
    try {
      const parsed = normalizeDrawFeatureCollection(JSON.parse(text));
      if (!parsed) {
        setJsonDraft({
          sourceJson: currentJson,
          text,
          error: t("draw.geoJsonInvalidStructure"),
        });
        return null;
      }

      return parsed;
    } catch {
      setJsonDraft({
        sourceJson: currentJson,
        text,
        error: t("draw.geoJsonInvalidJson"),
      });
      return null;
    }
  };

  const handleApplyGeoJSON = () => {
    const parsed = parseGeoJSON(jsonText);
    if (!parsed) return;

    onApplyGeoJSON(parsed);
    const formattedJson = JSON.stringify(parsed, null, 2);
    setJsonDraft({ sourceJson: formattedJson, text: formattedJson, error: null });
  };

  const handleFormatGeoJSON = () => {
    const parsed = parseGeoJSON(jsonText);
    if (!parsed) return;

    setJsonDraft({
      sourceJson: currentJson,
      text: JSON.stringify(parsed, null, 2),
      error: null,
    });
  };

  const handleImportGeoJSON = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const importedText = await file.text();
    const parsed = parseGeoJSON(importedText);
    if (!parsed) return;

    onApplyGeoJSON(parsed);
    const formattedJson = JSON.stringify(parsed, null, 2);
    setJsonDraft({ sourceJson: formattedJson, text: formattedJson, error: null });
  };

  const handleExportGeoJSON = () => {
    const blob = new Blob([currentJson], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `drawings-${new Date().toISOString().slice(0, 10)}.geojson`;
    link.click();
    URL.revokeObjectURL(url);
  };

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

        <Stack spacing={1.25}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
            <Stack spacing={0.25}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {t("draw.geoJsonTitle")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("draw.geoJsonFeatureCount", { count: geoJSON.features.length })}
              </Typography>
            </Stack>
            <Braces size={20} aria-hidden="true" color="#1565c0" />
          </Stack>

          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileUp size={15} />}
              onClick={() => fileInputRef.current?.click()}
            >
              {t("draw.geoJsonImport")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              onChange={event => void handleImportGeoJSON(event)}
              hidden
            />
            <Button
              size="small"
              variant="outlined"
              startIcon={<Download size={15} />}
              onClick={handleExportGeoJSON}
            >
              {t("draw.geoJsonExport")}
            </Button>
          </Stack>

          <TextField
            fullWidth
            multiline
            minRows={10}
            value={jsonText}
            onChange={event => {
              setJsonDraft({ sourceJson: currentJson, text: event.target.value, error: null });
            }}
            label={t("draw.geoJsonLabel")}
            placeholder={t("draw.geoJsonPlaceholder")}
            error={Boolean(jsonError)}
            helperText={jsonError ?? t("draw.geoJsonHint")}
            slotProps={{
              htmlInput: { spellCheck: false },
              input: {
                sx: {
                  alignItems: "flex-start",
                  fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                  fontSize: 12,
                  lineHeight: 1.5,
                },
              },
            }}
          />

          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Braces size={15} />}
              onClick={handleFormatGeoJSON}
              disabled={!jsonText.trim()}
            >
              {t("draw.geoJsonFormat")}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RotateCcw size={15} />}
              onClick={() => {
                setJsonDraft({ sourceJson: currentJson, text: currentJson, error: null });
              }}
              disabled={!isJsonDirty && !jsonError}
            >
              {t("draw.geoJsonReset")}
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<Save size={15} />}
              onClick={handleApplyGeoJSON}
              disabled={!isJsonDirty}
            >
              {t("draw.geoJsonApply")}
            </Button>
          </Stack>
        </Stack>
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
  width: { xs: "calc(100vw - 16px)", sm: 500 },
  maxWidth: "calc(100vw - 16px)",
  p: { xs: 1.5, sm: 2 },
  overflowY: "auto",
  borderRadius: { xs: 2, sm: 1.5 },
};

export default DrawPanel;
