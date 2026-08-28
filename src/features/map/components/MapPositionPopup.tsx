import { Box, Divider, Paper, Stack, Typography } from "@mui/material";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { CoordinateReferenceSystem } from "../../../tools/CoordinateTool";

interface MapPositionPopupProps {
  longitude: number;
  latitude: number;
  crs: CoordinateReferenceSystem;
}

function MapPositionPopup({
  longitude,
  latitude,
  crs,
}: MapPositionPopupProps) {
  const { t } = useTranslation();
  const precision = crs === "EPSG:4326" ? 6 : 3;
  const coordinates = `[${longitude.toFixed(precision)}, ${latitude.toFixed(precision)}]`;

  return (
    <Paper
      elevation={0}
      sx={{
        width: { xs: "calc(100vw - 80px)", sm: 360 },
        maxWidth: 360,
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
            bgcolor: "primary.50",
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
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ minWidth: 92 }}
        >
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
