import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Alert,
  Button,
  Box,
  Divider,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  ArrowLeft,
  Braces,
  Download,
  Eye,
  EyeOff,
  Edit3,
  FileUp,
  Pen,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  normalizeDrawFeatureCollection,
  type DrawProperties,
  type DrawFeatureCollection,
  type DrawMode,
} from "../../../tools/draw/DrawTool";
import {
  formatArea,
  formatDistance,
  MEASURED_AREA_PROPERTY,
  MEASURED_LENGTH_PROPERTY,
} from "../../../tools/measure/MeasureTool";

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
  hiddenFeatureIds: ReadonlySet<string>;
  selectedFeatureId: string | null;
  onChangeMode: (mode: DrawMode) => void;
  onApplyGeoJSON: (value: DrawFeatureCollection) => void;
  onSelectFeature: (featureId: string | null) => void;
  onToggleFeatureVisibility: (featureId: string) => void;
  onUpdateFeatureProperties: (
    featureId: string,
    properties: DrawFeatureCollection["features"][number]["properties"]
  ) => void;
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
  hiddenFeatureIds,
  selectedFeatureId,
  onChangeMode,
  onApplyGeoJSON,
  onSelectFeature,
  onToggleFeatureVisibility,
  onUpdateFeatureProperties,
  onClear,
  onDelete,
  onFinish,
  onRedo,
  onUndo,
}: DrawPanelProps) {
  const { t } = useTranslation();
  const selectedMode = mode === "edit" ? "select" : mode;
  const [panelTab, setPanelTab] = useState<"select" | "geojson">("select");
  const selectedFeature = geoJSON.features.find(feature => feature.id === selectedFeatureId);
  const selectedFeatureName = selectedFeature ? getFeatureNameProperty(selectedFeature) : "";
  const selectedFeaturePropertiesSignature = selectedFeature
    ? JSON.stringify(selectedFeature.properties)
    : "";
  const [nameDraft, setNameDraft] = useState({
    featureId: null as string | null,
    value: "",
    sourceSignature: "",
  });
  const nameInput = nameDraft.featureId === selectedFeatureId &&
      nameDraft.sourceSignature === selectedFeaturePropertiesSignature
    ? nameDraft.value
    : selectedFeatureName;
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
    setPanelTab("select");
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
    setPanelTab("select");
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

  const handleDownloadFeatureGeoJSON = (
    feature: DrawFeatureCollection["features"][number]
  ) => {
    const featureCollection: DrawFeatureCollection = {
      type: "FeatureCollection",
      crs: geoJSON.crs,
      features: [feature],
    };
    const blob = new Blob(
      [JSON.stringify(featureCollection, null, 2)],
      { type: "application/geo+json" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `feature-${sanitizeFilename(feature.id)}.geojson`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Paper className="map-floating-panel" elevation={4} sx={panelSx}>
      <Stack spacing={1.25}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Stack
              sx={{
                width: 34,
                height: 34,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 2.5,
                bgcolor: "primary.light",
                color: "primary.main",
              }}
            >
              <Pen size={18} />
            </Stack>
            <Stack spacing={0}>
              <Typography variant="subtitle2">{t("tools.draw")}</Typography>
              <Typography variant="caption" color="text.secondary">{t("draw.savedFeatures")}</Typography>
            </Stack>
          </Stack>
          <Typography variant="h6" color="primary.main" sx={{ fontWeight: 750 }}>{drawingCount}</Typography>
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
          <ToggleButton value="multipoint">{t("draw.multiPoint")}</ToggleButton>
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
          {(mode === "multipoint" || mode === "line" || mode === "polygon") && (
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

        {panelTab === "select" ? (
          <Stack spacing={1.25}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Stack spacing={0.25}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {t("draw.select")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("draw.geoJsonFeatureCount", { count: geoJSON.features.length })}
                </Typography>
              </Stack>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Braces size={15} />}
                onClick={() => setPanelTab("geojson")}
              >
                {t("draw.geoJsonTitle")}
              </Button>
            </Stack>

            {geoJSON.features.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t("draw.selectHint")}
              </Typography>
            ) : (
              <Stack spacing={0.75}>
                {geoJSON.features.map((feature, index) => {
                  const name = getFeatureName(feature, index);
                  const hasName = name !== feature.id;
                  const isVisible = !hiddenFeatureIds.has(feature.id);

                  return (
                    <Box
                      component="div"
                      role="button"
                      tabIndex={0}
                      key={feature.id}
                      onClick={() => {
                        onChangeMode("select");
                        onSelectFeature(
                          feature.id === selectedFeatureId ? null : feature.id
                        );
                      }}
                      onKeyDown={event => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        onChangeMode("select");
                        onSelectFeature(
                          feature.id === selectedFeatureId ? null : feature.id
                        );
                      }}
                      sx={{
                        width: "100%",
                        p: 1,
                        border: "1px solid",
                        borderColor: feature.id === selectedFeatureId ? "primary.main" : "divider",
                        borderRadius: 1.5,
                        bgcolor: feature.id === selectedFeatureId ? "primary.50" : "background.paper",
                        opacity: isVisible ? 1 : 0.58,
                        transition: "border-color 120ms ease, background-color 120ms ease",
                        "&:hover": {
                          borderColor: "primary.main",
                          bgcolor: "action.hover",
                        },
                        "&:focus-visible": {
                          outline: "2px solid",
                          outlineColor: "primary.main",
                          outlineOffset: 1,
                        },
                      }}
                    >
                      <Stack direction="row" sx={{ minWidth: 0, width: "100%", alignItems: "center" }}>
                        <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {feature.geometry.type}{hasName ? ` · ID: ${feature.id}` : ""}
                          </Typography>
                        </Stack>
                        <IconButton
                          size="small"
                          title={t("draw.downloadFeature")}
                          aria-label={t("draw.downloadFeature")}
                          onClick={event => {
                            event.stopPropagation();
                            handleDownloadFeatureGeoJSON(feature);
                          }}
                        >
                          <Download size={17} />
                        </IconButton>
                        <IconButton
                          size="small"
                          color={isVisible ? "default" : "primary"}
                          title={isVisible ? t("draw.hideFeature") : t("draw.showFeature")}
                          aria-label={isVisible ? t("draw.hideFeature") : t("draw.showFeature")}
                          onClick={event => {
                            event.stopPropagation();
                            onToggleFeatureVisibility(feature.id);
                          }}
                        >
                          {isVisible ? <Eye size={17} /> : <EyeOff size={17} />}
                        </IconButton>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}

            {selectedFeatureId && selectedFeature && (
              <Stack spacing={1}>
                <Divider />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {t("draw.properties")}
                </Typography>

                <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
                  <Table size="small">
                    <TableBody>
                      <TableRow>
                        <TableCell sx={{ width: "38%", color: "text.secondary" , fontWeight: 700 }}>
                          {t("draw.geometryType")}
                        </TableCell>
                        <TableCell>{selectedFeature.geometry.type}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ color: "text.secondary" , fontWeight: 700 }}>
                          {t("draw.featureId")}
                        </TableCell>
                        <TableCell sx={{ wordBreak: "break-all" }}>{selectedFeature.id}</TableCell>
                      </TableRow>
                      {Object.entries(getFeatureProperties(selectedFeature))
                        .filter(([key]) => key !== "name")
                        .map(([key, value]) => (
                          <TableRow key={key}>
                            <TableCell sx={{ color: "text.secondary", fontWeight: 700 }}>
                              {getPropertyLabel(key, t)}
                            </TableCell>
                            <TableCell sx={{ wordBreak: "break-word" }}>
                              {formatPropertyValue(value, key)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Stack direction="row" spacing={0.75} sx={{ alignItems: "flex-start" }}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t("draw.name")}
                    placeholder={t("draw.namePlaceholder")}
                    value={nameInput}
                    onChange={event => {
                      setNameDraft({
                        featureId: selectedFeature.id,
                        value: event.target.value,
                        sourceSignature: selectedFeaturePropertiesSignature,
                      });
                    }}
                  />
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => {
                      const properties = { ...getFeatureProperties(selectedFeature) };
                      const name = nameInput.trim();

                      if (name) {
                        properties.name = name;
                      } else {
                        delete properties.name;
                      }

                      onUpdateFeatureProperties(
                        selectedFeature.id,
                        Object.keys(properties).length > 0 ? properties : null
                      );
                    }}
                    disabled={nameInput.trim() === selectedFeatureName}
                    sx={{ minHeight: 40, flexShrink: 0 }}
                  >
                    {t("draw.saveProperties")}
                  </Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        ) : (
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
              <Button
                size="small"
                variant="text"
                startIcon={<ArrowLeft size={15} />}
                onClick={() => setPanelTab("select")}
              >
                {t("draw.select")}
              </Button>
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
              minRows={11}
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
        )}
      </Stack>
    </Paper>
  );
}

function getFeatureName(
  feature: DrawFeatureCollection["features"][number],
  index: number
): string {
  const name = getFeatureNameProperty(feature);

  if (name) return name;

  return feature.id || `Feature ${index + 1}`;
}

function getFeatureNameProperty(
  feature: DrawFeatureCollection["features"][number]
): string {
  const properties = getFeatureProperties(feature);
  const name = properties.name;

  if (typeof name === "string" && name.trim()) return name.trim();
  if (typeof name === "number" && Number.isFinite(name)) return String(name);

  return "";
}

function getFeatureProperties(
  feature: DrawFeatureCollection["features"][number]
): NonNullable<DrawProperties> {
  return feature.properties && !Array.isArray(feature.properties)
    ? feature.properties
    : {};
}

function getPropertyLabel(key: string, translate: (key: string) => string): string {
  if (key === MEASURED_AREA_PROPERTY) return translate("draw.area");
  if (key === MEASURED_LENGTH_PROPERTY) return translate("draw.length");
  return key;
}

function formatPropertyValue(value: unknown, key?: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (key === MEASURED_AREA_PROPERTY) return formatArea(value);
    if (key === MEASURED_LENGTH_PROPERTY) return formatDistance(value);
  }

  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, "-") || "feature";
}

const panelSx = {
  position: "absolute",
  left: { xs: 8, sm: 16 },
  top: { xs: 120, sm: 72 },
  bottom: { xs: 8, sm: 16 },
  zIndex: "var(--z-overlay-panel)",
  width: { xs: "calc(100% - 16px)", sm: 500 },
  maxWidth: { xs: "calc(100% - 16px)", sm: "calc(100% - 32px)" },
  p: { xs: 1.5, sm: 2 },
  overflowY: "auto",
  borderRadius: { xs: 2, sm: 1.5 },
};

export default DrawPanel;
