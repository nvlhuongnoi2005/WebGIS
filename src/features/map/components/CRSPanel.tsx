import {
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";

import {
  COORDINATE_SYSTEMS,
  type CoordinateReferenceSystem,
} from "../../../tools/CoordinateTool";

interface CRSPanelProps {
  value: CoordinateReferenceSystem;
  onChange: (crs: CoordinateReferenceSystem) => void;
}

const panelSx = {
  position: "absolute",
  right: { xs: 16, sm: 70 },
  top: 100,
  zIndex: "var(--z-overlay-panel)",
  width: { xs: "calc(100vw - 32px)", sm: 310 },
  maxWidth: 310,
  p: 1.5,
};

function CRSPanel({ value, onChange }: CRSPanelProps) {
  const { t } = useTranslation();

  return (
    <Paper elevation={4} sx={panelSx}>
      <Stack spacing={1.5}>
        <Stack spacing={0.25}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1, fontWeight: 600}}>
            {t("crs.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("crs.description")}
          </Typography>
        </Stack>

        <FormControl fullWidth size="small">
          <InputLabel id="coordinate-system-label">{t("crs.label")}</InputLabel>
          <Select
            labelId="coordinate-system-label"
            value={value}
            label={t("crs.label")}
            onChange={event => {
              onChange(event.target.value as CoordinateReferenceSystem);
            }}
          >
            {Object.entries(COORDINATE_SYSTEMS).map(([code, system]) => (
              <MenuItem key={code} value={code}>
                {system.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
    </Paper>
  );
}

export default CRSPanel;
