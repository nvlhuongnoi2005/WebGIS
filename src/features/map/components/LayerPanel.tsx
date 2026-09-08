import { Layers3, Map } from "lucide-react";
import { Button, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

interface LayerPanelProps {
  onOpenBaseMap: () => void;
  onOpenLayers: () => void;
  selectedOverlayCount: number;
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
  onOpenBaseMap,
  onOpenLayers,
  selectedOverlayCount,
}: LayerPanelProps) {
  const { t } = useTranslation();

  return (
    <Paper elevation={4} sx={panelSx}>
      <Stack spacing={1.5}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
          {t("layers.layerControls")}
        </Typography>
        <Button
          fullWidth
          variant="outlined"
          startIcon={<Map size={17} />}
          onClick={onOpenBaseMap}
          sx={{ justifyContent: "flex-start", textTransform: "none" }}
        >
          {t("layers.selectBaseMap")}
        </Button>
        <Button
          fullWidth
          variant="outlined"
          startIcon={<Layers3 size={17} />}
          onClick={onOpenLayers}
          sx={{ justifyContent: "flex-start", textTransform: "none" }}
        >
          {t("layers.selectLayer")}
          {selectedOverlayCount > 0 && ` (${selectedOverlayCount})`}
        </Button>
      </Stack>
    </Paper>
  );
}

export default LayerPanel;
