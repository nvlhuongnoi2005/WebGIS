import { useState } from "react";

import {
  Alert,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { LocateFixed, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SpatialSearchStatus } from "../../../hooks/useSpatialSearch";
import {
  SPATIAL_SEARCH_CATEGORIES,
  type SpatialSearchCategory,
  type SpatialSearchInput,
  type SpatialSearchResult,
} from "../../../tools/geocoding/SpatialSearchTool";
import type { MapCoordinates } from "../../../types/map";

interface SpatialSearchPanelProps {
  result: SpatialSearchResult | null;
  status: SpatialSearchStatus;
  error: string | null;
  onSearch: (input: SpatialSearchInput) => void;
  onClear: () => void;
  onFocusResult: (coordinates: MapCoordinates) => void;
  onClose: () => void;
}

export default function SpatialSearchPanel({
  result,
  status,
  error,
  onSearch,
  onClear,
  onFocusResult,
  onClose,
}: SpatialSearchPanelProps) {
  const { t } = useTranslation();
  const [referencePlace, setReferencePlace] = useState("Hồ Tây");
  const [category, setCategory] = useState<SpatialSearchCategory>("restaurant");
  const [distanceMeters, setDistanceMeters] = useState(500);
  const canSearch =
    referencePlace.trim().length >= 2 && distanceMeters >= 1 && distanceMeters <= 20_000;

  return (
    <Paper
      className="map-floating-panel"
      elevation={6}
      sx={{
        position: "absolute",
        right: { xs: 12, sm: 20 },
        top: { xs: 120, sm: 76 },
        zIndex: "var(--z-overlay-panel)",
        width: { xs: "calc(100% - 24px)", sm: 330 },
        maxHeight: { xs: "calc(100% - 136px)", sm: "calc(100% - 96px)" },
        overflowY: "auto",
        p: 1.75,
      }}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <LocateFixed size={18} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {t("spatialSearch.title")}
            </Typography>
          </Stack>
          <IconButton size="small" aria-label={t("spatialSearch.close")} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {t("spatialSearch.description")}
        </Typography>
        <TextField
          size="small"
          label={t("spatialSearch.referencePlace")}
          value={referencePlace}
          onChange={(event) => setReferencePlace(event.target.value)}
          placeholder={t("spatialSearch.referencePlacePlaceholder")}
        />
        <TextField
          select
          size="small"
          label={t("spatialSearch.category")}
          value={category}
          onChange={(event) => setCategory(event.target.value as SpatialSearchCategory)}
        >
          {SPATIAL_SEARCH_CATEGORIES.map((item) => (
            <MenuItem key={item} value={item}>
              {t(`spatialSearch.categories.${item}`)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          type="number"
          label={t("spatialSearch.distanceMeters")}
          value={distanceMeters}
          slotProps={{ htmlInput: { min: 1, max: 20_000, step: 100 } }}
          onChange={(event) => setDistanceMeters(Number(event.target.value))}
        />
        <Button
          variant="contained"
          startIcon={
            status === "loading" ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <Search size={16} />
            )
          }
          disabled={!canSearch || status === "loading"}
          onClick={() => onSearch({ category, referencePlace, distanceMeters })}
        >
          {status === "loading" ? t("spatialSearch.searching") : t("spatialSearch.search")}
        </Button>
        {error && <Alert severity="error">{t("spatialSearch.error")}</Alert>}
        {result && (
          <>
            <Divider />
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {t("spatialSearch.resultCount", { count: result.features.length })}
              </Typography>
              <Button size="small" onClick={onClear}>
                {t("spatialSearch.clear")}
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {t("spatialSearch.nearReference", { name: result.reference.name })}
            </Typography>
            {result.features.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t("spatialSearch.noResults")}
              </Typography>
            ) : (
              <List dense disablePadding>
                {result.features.map((feature) => (
                  <ListItemButton
                    key={String(feature.id ?? `${feature.geometry.coordinates}`)}
                    onClick={() => onFocusResult(feature.geometry.coordinates as MapCoordinates)}
                  >
                    <ListItemText
                      primary={feature.properties.name}
                      secondary={`${Math.round(feature.properties.distanceMeters)} m${
                        feature.properties.address ? ` · ${feature.properties.address}` : ""
                      }`}
                      slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
