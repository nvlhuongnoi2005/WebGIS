import { useEffect, useRef, useState } from "react";

import type { ChangeEvent } from "react";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  Bike,
  Bus,
  Car,
  CheckCircle2,
  Footprints,
  LocateFixed,
  MapPin,
  RotateCcw,
  Route as RouteIcon,
  Search,
  Truck,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  fetchGeocoding,
  getGeocodingLanguage,
} from "../../../tools/geocoding/GeocodingTool";
import type { GeocodingFeature } from "../../../tools/geocoding/GeocodingTool";
import {
  formatRouteDuration,
  type RouteInstruction,
  type RoutingVehicle,
} from "../../../tools/routing/RoutingTool";
import { formatDmsCoordinates } from "../../../tools/coordinate/CoordinateTool";
import type { MapCoordinates } from "../../../types/map";
import type { RoutingStatus } from "../../../hooks/useRouting";

interface RoutingPanelProps {
  origin: MapCoordinates | null;
  destination: MapCoordinates | null;
  vehicle: RoutingVehicle;
  status: RoutingStatus;
  error: string | null;
  distanceKm?: number;
  timeSeconds?: number;
  instructions?: RouteInstruction[];
  onOriginChange: (point: MapCoordinates | null) => void;
  onDestinationChange: (point: MapCoordinates | null) => void;
  onVehicleChange: (vehicle: RoutingVehicle) => void;
  onCalculate: () => void;
  onReset: () => void;
}

const vehicles: Array<{ value: RoutingVehicle; labelKey: string; icon: typeof Car }> = [
  { value: "auto", labelKey: "routing.vehicles.auto", icon: Car },
  { value: "motorcycle", labelKey: "routing.vehicles.motorcycle", icon: Bike },
  { value: "bicycle", labelKey: "routing.vehicles.bicycle", icon: Bike },
  { value: "pedestrian", labelKey: "routing.vehicles.pedestrian", icon: Footprints },
  { value: "bus", labelKey: "routing.vehicles.bus", icon: Bus },
  { value: "truck", labelKey: "routing.vehicles.truck", icon: Truck },
  { value: "taxi", labelKey: "routing.vehicles.taxi", icon: Car },
];

function formatCoordinate(point: MapCoordinates | null, notSelected: string) {
  return point ? formatDmsCoordinates(point[0], point[1]) : notSelected;
}

function RoutingPanel({
  origin,
  destination,
  vehicle,
  status,
  error,
  distanceKm,
  timeSeconds,
  instructions = [],
  onOriginChange,
  onDestinationChange,
  onVehicleChange,
  onCalculate,
  onReset,
}: RoutingPanelProps) {
  const { t } = useTranslation();
  const canCalculate = Boolean(origin && destination) && status !== "loading";
  const duration = typeof timeSeconds === "number"
    ? formatRouteDuration(timeSeconds)
    : null;
  const durationLabel = duration
    ? duration.hours > 0
      ? t("routing.durationHoursMinutes", duration)
      : t("routing.durationMinutes", { count: duration.minutes })
    : null;

  return (
    <Paper elevation={4} sx={panelSx}>
      <Stack spacing={1.5}>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box sx={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 2, bgcolor: "primary.50", color: "primary.main" }}>
              <RouteIcon size={18} />
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{t("routing.title")}</Typography>
              <Typography variant="caption" color="text.secondary">{t("routing.description")}</Typography>
            </Box>
          </Stack>
          <IconButton size="small" onClick={onReset} title={t("routing.resetPoints")} aria-label={t("routing.resetPoints")}>
            <RotateCcw size={17} />
          </IconButton>
        </Stack>

        <Stack spacing={1}>
          <LocationSearchField
            label={`A · ${t("routing.origin")}`}
            placeholder={t("routing.originSearchPlaceholder")}
            value={origin}
            onChange={onOriginChange}
          />
          <LocationSearchField
            label={`B · ${t("routing.destination")}`}
            placeholder={t("routing.destinationSearchPlaceholder")}
            value={destination}
            onChange={onDestinationChange}
          />
        </Stack>

        <Divider />
        <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5 }}>
          {t("routing.vehicle")}
        </Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={vehicle}
          onChange={(_, value: RoutingVehicle | null) => value && onVehicleChange(value)}
          sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.5, "& .MuiToggleButtonGroup-grouped": { border: "1px solid", borderColor: "divider", borderRadius: "8px !important", m: 0 } }}
        >
          {vehicles.map(({ value, labelKey, icon: Icon }) => (
            <ToggleButton key={value} value={value} sx={{ minWidth: 0, minHeight: 44, px: 0.25, flexDirection: "column", gap: 0.25, textTransform: "none" }}>
              <Icon size={17} />
              <Typography variant="caption" sx={{ fontSize: 10.5, lineHeight: 1 }}>{t(labelKey)}</Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {error && <Alert severity="error" variant="outlined" sx={{ fontSize: 12 }}>{error}</Alert>}

        {status === "success" && typeof distanceKm === "number" && typeof timeSeconds === "number" && (
          <Stack direction="row" spacing={1} sx={{ p: 1.25, borderRadius: 2, bgcolor: "success.50", color: "success.900", alignItems: "center" }}>
            <CheckCircle2 size={20} color="#15803d" />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {durationLabel} · {distanceKm.toFixed(1)} {t("routing.distanceUnit")}
              </Typography>
              <Typography variant="caption" color="text.secondary">{t("routing.routeSuitable")}</Typography>
            </Box>
          </Stack>
        )}

        {status === "success" && instructions.length > 0 && (
          <Box>
            <Divider sx={{ mb: 1 }} />
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mb: 0.75,
                fontWeight: 700,
                color: "text.secondary",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {t("routing.instructions")}
            </Typography>
            <Stack
              spacing={0.75}
              sx={{ maxHeight: 280, overflowY: "auto", pr: 0.5 }}
            >
              {instructions.map((step, index) => (
                <Stack
                  key={`${step.beginShapeIndex ?? "step"}-${index}`}
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "flex-start" }}
                >
                  <Box
                    sx={{
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      bgcolor: "primary.50",
                      color: "primary.main",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Typography variant="body2" sx={{ minWidth: 0, lineHeight: 1.4 }}>
                    {step.instruction}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}

        <Button
          fullWidth
          variant="contained"
          startIcon={status === "loading" ? <CircularProgress size={16} color="inherit" /> : <Search size={17} />}
          disabled={!canCalculate}
          onClick={onCalculate}
        >
          {status === "loading" ? t("routing.loading") : t("routing.findRoute")}
        </Button>

        {(!origin || !destination) && (
          <Stack direction="row" spacing={0.75} sx={{ color: "text.secondary", alignItems: "center" }}>
            <LocateFixed size={15} />
            <Typography variant="caption">{origin ? t("routing.chooseDestination") : t("routing.chooseOrigin")}</Typography>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

interface LocationSearchFieldProps {
  label: string;
  placeholder: string;
  value: MapCoordinates | null;
  onChange: (point: MapCoordinates | null) => void;
}

function LocationSearchField({
  label,
  placeholder,
  value,
  onChange,
}: LocationSearchFieldProps) {
  const { i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodingFeature[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const searchCacheRef = useRef<Map<string, GeocodingFeature[]>>(new Map());

  const activeLanguage = getGeocodingLanguage(
    i18n.resolvedLanguage || i18n.language
  );
  const displayValue = value
    ? query || formatCoordinate(value, "")
    : query;

  const cancelPendingSearch = () => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
  };

  const searchLocations = async (searchQuery: string) => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    const cacheKey = `${activeLanguage}:${normalizedQuery}`;
    const cachedResults = searchCacheRef.current.get(cacheKey);

    if (cachedResults) {
      return cachedResults;
    }

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const results = await fetchGeocoding(
        searchQuery,
        activeLanguage,
        controller.signal
      );
      searchCacheRef.current.set(cacheKey, results);
      return results;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return [];
      }

      console.error("Geocoding fetch error:", error);
      return [];
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    cancelPendingSearch();

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    if (nextQuery.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceTimerRef.current = window.setTimeout(async () => {
      const results = await searchLocations(nextQuery);
      setSuggestions(results);
      setIsOpen(results.length > 0);
      setIsLoading(false);
    }, 150);
  };

  const handleSelect = (feature: GeocodingFeature) => {
    setQuery(feature.place_name);
    setSuggestions([]);
    setIsOpen(false);
    onChange(feature.center);
  };

  const handleClear = () => {
    setQuery("");
    setSuggestions([]);
    setIsOpen(false);
    setIsLoading(false);
    cancelPendingSearch();
    onChange(null);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      cancelPendingSearch();
    };
  }, []);

  return (
    <Box ref={containerRef} sx={{ position: "relative" }}>
      <TextField
        fullWidth
        size="small"
        label={label}
        placeholder={placeholder}
        value={displayValue}
        onChange={handleInputChange}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        onKeyDown={event => {
          if (event.key === "Escape") {
            setIsOpen(false);
          } else if (event.key === "Enter" && suggestions.length > 0) {
            event.preventDefault();
            handleSelect(suggestions[0]);
          }
        }}
        autoComplete="off"
        spellCheck={false}
        helperText={value ? formatCoordinate(value, "") : undefined}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <MapPin size={16} />
              </InputAdornment>
            ),
            endAdornment: isLoading ? (
              <InputAdornment position="end">
                <CircularProgress size={16} />
              </InputAdornment>
            ) : displayValue ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleClear}
                  aria-label={`${label}: clear`}
                >
                  <X size={15} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />

      {isOpen && suggestions.length > 0 && (
        <Paper
          elevation={5}
          sx={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 3,
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          <List disablePadding>
            {suggestions.map(feature => (
              <ListItemButton key={feature.id} onClick={() => handleSelect(feature)}>
                <ListItemIcon sx={{ minWidth: 32, color: "error.main" }}>
                  <MapPin size={16} />
                </ListItemIcon>
                <ListItemText
                  primary={feature.text || feature.place_name}
                  secondary={feature.place_name}
                  slotProps={{
                    primary: { noWrap: true, sx: { fontSize: 13.5, fontWeight: 600 } },
                    secondary: { noWrap: true, sx: { fontSize: 12 } },
                  }}
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}

const panelSx = {
  position: "absolute",
  left: { xs: 12, sm: 20 },
  top: { xs: 120, sm: 100 },
  zIndex: "var(--z-overlay-panel)",
  width: { xs: "calc(100% - 24px)", sm: 390 },
  maxWidth: { xs: "calc(100% - 24px)", sm: "calc(100% - 40px)" },
  p: 1.5,
};

export default RoutingPanel;
