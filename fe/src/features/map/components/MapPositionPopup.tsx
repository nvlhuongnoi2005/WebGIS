import {
  Box,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  COORDINATE_SYSTEMS,
  formatDmsCoordinates,
  isGeographicCoordinateReferenceSystem,
  type CoordinateReferenceSystem,
} from "../../../tools/coordinate/CoordinateTool";

interface MapPositionPopupProps {
  longitude: number;
  latitude: number;
  crs: CoordinateReferenceSystem;
  compact?: boolean;
  onCrsChange?: (crs: CoordinateReferenceSystem) => void;
}

function MapPositionPopup({
  longitude,
  latitude,
  crs,
  compact = false,
  onCrsChange,
}: MapPositionPopupProps) {
  const { t } = useTranslation();
  const precision = crs === "EPSG:4326" ? 6 : 3;
  const coordinates = isGeographicCoordinateReferenceSystem(crs)
    ? formatDmsCoordinates(longitude, latitude)
    : `[${longitude.toFixed(precision)}, ${latitude.toFixed(precision)}]`;

  if (compact) {
    return (
      <Paper
        className="map-coordinate-card"
        elevation={0}
        sx={{
          px: 1.5,
          py: 1.25,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          color: "text.primary",
        }}
      >
        <Stack spacing={1}>
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 0.25, lineHeight: 1.2 }}
            >
              {t("coordinates.label")}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                overflow: "hidden",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.8rem",
                fontWeight: 700,
                lineHeight: 1.35,
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={coordinates}
            >
              {coordinates}
            </Typography>
          </Box>

          {onCrsChange ? (
            <FormControl
              fullWidth
              size="small"
              sx={{
                flexDirection: "row",
                alignItems: "center",
                gap: 1,
              }}
            >
              <InputLabel
                id="coordinate-panel-crs-label"
                sx={{
                  position: "static",
                  flexShrink: 0,
                  transform: "none",
                  color: "text.secondary",
                  fontSize: "0.8rem",
                }}
              >
                {t("crs.label")}
              </InputLabel>
              <Select
                labelId="coordinate-panel-crs-label"
                value={crs}
                label=""
                MenuProps={{
                  anchorOrigin: {
                    vertical: "bottom",
                    horizontal: "left",
                  },
                  transformOrigin: {
                    vertical: "bottom",
                    horizontal: "right",
                  },
                  marginThreshold: 12,
                }}
                onChange={(event) => {
                  onCrsChange(event.target.value as CoordinateReferenceSystem);
                }}
                renderValue={() => crs}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  height: 36,
                  borderRadius: 1.5,
                  fontSize: "0.9rem",
                }}
              >
                {Object.entries(COORDINATE_SYSTEMS).map(([code, system]) => (
                  <MenuItem key={code} value={code}>
                    {system.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <Typography variant="caption" color="text.secondary">
              {crs}
            </Typography>
          )}
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        width: { xs: "calc(100vw - 32px)", sm: 360 },
        maxWidth: { xs: "calc(100vw - 32px)", sm: 360 },
        overflow: "hidden",
        color: "text.primary",
      }}
    >
      <Stack
        direction="row"
        spacing={1.25}
        sx={{
          alignItems: "center",
          px: 2,
          py: 1.5,
          pr: 5,
        }}
      >
        <Box
          sx={{
            display: "grid",
            width: 32,
            height: 32,
            placeItems: "center",
            borderRadius: "50%",
            bgcolor: "primary.light",
            color: "primary.main",
          }}
        >
          <MapPin size={18} strokeWidth={2.25} />
        </Box>

        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {t("coordinates.title")}
        </Typography>
      </Stack>

      <Divider />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={{ xs: 0.5, sm: 2 }}
        sx={{ px: 2, py: 1.5 }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 92 }}>
          {t("coordinates.label")}
        </Typography>

        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontWeight: 600,
            wordBreak: "break-word",
          }}
        >
          {coordinates}
        </Typography>
      </Stack>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", px: 2, pb: 1.25 }}
      >
        {crs}
      </Typography>
    </Paper>
  );
}

export default MapPositionPopup;
