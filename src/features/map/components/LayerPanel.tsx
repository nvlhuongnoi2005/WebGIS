import {
  Paper,
  Stack,
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
}

const panelSx = {
  position: "absolute",
  right: { xs: 16, sm: 70 },
  top: 100,
  zIndex: "var(--z-overlay-panel)",
  width: { xs: 220, sm: 250 },
  p: 1.5,
};

function LayerPanel({
  baseMapStyle,
  onChange,
  mapDataSource,
  onChangeDataSource,
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
          <ToggleButton value="asia-full">Asia full</ToggleButton>
          <ToggleButton value="maptiler">MapTiler</ToggleButton>
        </ToggleButtonGroup>

        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
          {t("layers.baseMap")}
        </Typography>

        <ToggleButtonGroup
          exclusive
          fullWidth
          orientation="vertical"
          disabled={mapDataSource !== "maptiler"}
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
      </Stack>
    </Paper>
  );
}

export default LayerPanel;
