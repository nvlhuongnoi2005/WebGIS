import {
  Button,
  CircularProgress,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";

import type {
  BaseMapStyle,
  MapDataSource,
} from "../../../tools/MapStyleTool";

interface LayerPanelProps {
  baseMapStyle: BaseMapStyle;
  onChange: (style: BaseMapStyle) => void;
  mapDataSource: MapDataSource;
  onChangeDataSource: (dataSource: MapDataSource) => void;
  osmRoadsEnabled: boolean;
  osmRoadStatus: "idle" | "loading" | "ready" | "zoom-in" | "error";
  osmRoadCount: number;
  onToggleOsmRoads: (enabled: boolean) => void;
  onReloadOsmRoads: () => void;
}

const panelSx = {
  position: "absolute",
  right: { xs: 12, sm: 70 },
  top: { xs: 120, sm: 100 },
  zIndex: "var(--z-overlay-panel)",
  width: { xs: "calc(100% - 24px)", sm: 250 },
  maxWidth: { xs: "calc(100% - 24px)", sm: 250 },
  p: 1.5,
};

function LayerPanel({
  baseMapStyle,
  onChange,
  mapDataSource,
  onChangeDataSource,
  osmRoadsEnabled,
  osmRoadStatus,
  osmRoadCount,
  onToggleOsmRoads,
  onReloadOsmRoads,
}: LayerPanelProps) {
  const { t } = useTranslation();

  return (
    <Paper elevation={4} sx={panelSx}>
      <Stack spacing={1.5}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
          {t("layers.dataSource")}
        </Typography>

        <ToggleButtonGroup
          exclusive
          fullWidth
          orientation="vertical"
          value={mapDataSource}
          onChange={(_, value: MapDataSource | null) => {
            if (value) onChangeDataSource(value);
          }}
          sx={{
            "& .MuiToggleButton-root": {
              justifyContent: "flex-start",
              px: 1.5,
              py: 0.75,
              textTransform: "none",
            },
          }}
        >
          <ToggleButton
            value="tile-server"
            onClick={() => {
              if (mapDataSource === "tile-server") {
                onChangeDataSource("tile-server");
              }
            }}
          >
            {t("data.tileServer")}
          </ToggleButton>
          <ToggleButton value="maptiler">MapTiler</ToggleButton>
        </ToggleButtonGroup>

        {mapDataSource !== "tile-server" && (
          <>
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
              {t("layers.baseMap")}
            </Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            orientation="vertical"
            value={baseMapStyle}
            onChange={(_, value: BaseMapStyle | null) => {
              if (value) onChange(value);
            }}
            sx={{
              "& .MuiToggleButton-root": {
                justifyContent: "flex-start",
                px: 1.5,
                py: 0.75,
                textTransform: "none",
              },
            }}
          >
            <ToggleButton value="streets">{t("layers.streets")}</ToggleButton>
            <ToggleButton value="satellite">{t("layers.satellite")}</ToggleButton>
            <ToggleButton value="outdoor">{t("layers.outdoor")}</ToggleButton>
          </ToggleButtonGroup>
          </>
        )}

        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
          {t("layers.overlay")}
        </Typography>

        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={osmRoadsEnabled}
                onChange={event => onToggleOsmRoads(event.target.checked)}
              />
            }
            label={t("layers.osmRoads")}
            sx={{ justifyContent: "space-between", ml: 0, mr: 0 }}
            labelPlacement="start"
          />

          {osmRoadStatus === "loading" && (
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <CircularProgress size={14} />
              <Typography variant="caption">{t("layers.roadsLoading")}</Typography>
            </Stack>
          )}

          {osmRoadStatus === "ready" && (
            <Typography variant="caption" color="text.secondary">
              {t("layers.roadsLoaded", { count: osmRoadCount })}
            </Typography>
          )}

          {osmRoadStatus === "zoom-in" && (
            <Typography variant="caption" color="text.secondary">
              {t("layers.roadsZoomIn")}
            </Typography>
          )}

          {osmRoadStatus === "error" && (
            <Stack spacing={0.25}>
              <Typography variant="caption" color="error.main">
                {t("layers.roadsError")}
              </Typography>
              <Button size="small" onClick={onReloadOsmRoads} sx={{ alignSelf: "flex-start", px: 0 }}>
                {t("layers.reloadRoads")}
              </Button>
            </Stack>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

export default LayerPanel;
