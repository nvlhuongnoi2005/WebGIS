import {
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  FormGroup,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Filter, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { POI_FILTER_CATEGORIES, type PoiFilterCategory } from "../../../tools/map/MapStyleTool";

interface PoiFilterPanelProps {
  selectedCategories: readonly PoiFilterCategory[];
  onToggle: (category: PoiFilterCategory) => void;
  onClear: () => void;
  onClose: () => void;
}

const panelSx = {
  position: "absolute",
  right: { xs: 12, sm: 20 },
  top: { xs: 120, sm: 76 },
  zIndex: "var(--z-overlay-panel)",
  width: { xs: "calc(100% - 24px)", sm: 270 },
  maxWidth: { xs: "calc(100% - 24px)", sm: 270 },
  p: 1.75,
};

export default function PoiFilterPanel({
  selectedCategories,
  onToggle,
  onClear,
  onClose,
}: PoiFilterPanelProps) {
  const { t } = useTranslation();

  return (
    <Paper
      className="map-floating-panel"
      elevation={6}
      sx={panelSx}
      aria-label={t("poiFilter.title")}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Filter size={18} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {t("poiFilter.title")}
            </Typography>
          </Stack>
          <IconButton size="small" aria-label={t("poiFilter.close")} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {t("poiFilter.description")}
        </Typography>
        <Divider />
        <FormGroup>
          {POI_FILTER_CATEGORIES.map((category) => (
            <FormControlLabel
              key={category}
              control={
                <Checkbox
                  checked={selectedCategories.includes(category)}
                  onChange={() => onToggle(category)}
                />
              }
              label={t(`poiFilter.categories.${category}`)}
            />
          ))}
        </FormGroup>
        <Button
          size="small"
          variant="text"
          onClick={onClear}
          disabled={selectedCategories.length === 0}
        >
          {t("poiFilter.hideAll")}
        </Button>
      </Stack>
    </Paper>
  );
}
