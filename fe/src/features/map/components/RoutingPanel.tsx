import { useEffect, useId, useRef, useState } from "react";

import type { ChangeEvent, ReactNode } from "react";

import {
  Alert,
  Box,
  Button,
  ButtonBase,
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
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Footprints,
  LocateFixed,
  MapPin,
  RotateCcw,
  Route as RouteIcon,
  Search,
  TrendingDown,
  TrendingUp,
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
import type { ElevationPoint } from "../../../tools/routing/ElevationTool";
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
  elevation?: ElevationPoint[];
  isElevationLoading?: boolean;
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
  elevation = [],
  isElevationLoading = false,
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
  const isRouteResult = status === "success";
  const isRouteSearchActive = status === "loading" || isRouteResult;
  const [isElevationOpen, setIsElevationOpen] = useState(true);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(true);

  return (
    <Paper
      className="map-floating-panel"
      elevation={4}
      sx={{
        ...panelSx,
        ...(isRouteResult ? routeResultPanelSx : {}),
      }}
    >
      <Stack
        spacing={1.5}
        sx={{
          minHeight: 0,
          ...(isRouteResult ? { height: "100%", overflowY: "auto", pr: 0.25 } : {}),
        }}
      >
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box sx={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 2, bgcolor: "primary.light", color: "primary.main" }}>
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
        {!isRouteSearchActive && (
          <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {t("routing.vehicle")}
          </Typography>
        )}
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={vehicle}
          onChange={(_, value: RoutingVehicle | null) => value && onVehicleChange(value)}
          sx={{
            display: "grid",
            gridTemplateColumns: isRouteSearchActive
              ? "repeat(7, minmax(0, 1fr))"
              : "repeat(4, minmax(0, 1fr))",
            gap: 0.5,
            "& .MuiToggleButtonGroup-grouped": {
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              m: 0,
            },
          }}
        >
          {vehicles.map(({ value, labelKey, icon: Icon }) => (
            <ToggleButton
              key={value}
              value={value}
              title={t(labelKey)}
              aria-label={t(labelKey)}
              sx={{
                minWidth: 0,
                minHeight: isRouteSearchActive ? 40 : 44,
                px: 0.25,
                flexDirection: "column",
                gap: 0.25,
                textTransform: "none",
              }}
            >
              <Icon size={isRouteSearchActive ? 18 : 17} />
              {!isRouteSearchActive && (
                <Typography variant="caption" sx={{ fontSize: 10.5, lineHeight: 1 }}>
                  {t(labelKey)}
                </Typography>
              )}
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

        {status === "success" && (
          <Box>
            <CollapsibleSectionLabel
              label={t("routing.elevation.title")}
              isOpen={isElevationOpen}
              onClick={() => setIsElevationOpen(open => !open)}
            />
            {isElevationOpen && <ElevationProfile points={elevation} isLoading={isElevationLoading} />}
          </Box>
        )}

        {status === "success" && instructions.length > 0 && (
          <Box>
            <Divider sx={{ mb: 1 }} />
            <CollapsibleSectionLabel
              label={t("routing.instructions")}
              isOpen={isInstructionsOpen}
              onClick={() => setIsInstructionsOpen(open => !open)}
            />
            {isInstructionsOpen && (
              <Stack
                spacing={0.75}
                sx={{
                  minHeight: 0,
                  flex: isRouteResult ? 1 : undefined,
                  maxHeight: isRouteResult ? undefined : 280,
                  overflowY: "auto",
                  pr: 0.5,
                }}
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
                        bgcolor: "primary.light",
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
            )}
          </Box>
        )}

        <Button
          fullWidth
          variant="contained"
          startIcon={status === "loading" ? <CircularProgress size={16} color="inherit" /> : <Search size={17} />}
          disabled={!canCalculate}
          onClick={() => onCalculate()}
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

function CollapsibleSectionLabel({ label, isOpen, onClick }: { label: string; isOpen: boolean; onClick: () => void }) {
  const Icon = isOpen ? ChevronUp : ChevronDown;
  return (
    <ButtonBase
      onClick={onClick}
      aria-expanded={isOpen}
      sx={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", mb: 0.75, borderRadius: 1, textAlign: "left" }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Icon size={16} />
    </ButtonBase>
  );
}

function ElevationProfile({ points, isLoading }: { points: ElevationPoint[]; isLoading: boolean }) {
  const { t } = useTranslation();
  const elevationGradientId = useId().replace(/:/g, "");
  const knownPoints = points.filter((point): point is ElevationPoint & { elevationM: number } => point.elevationM !== null);
  if (isLoading) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "text.secondary" }}>
        <CircularProgress size={15} />
        <Typography variant="caption">{t("routing.elevation.loading")}</Typography>
      </Stack>
    );
  }
  if (knownPoints.length < 2) {
    return <Typography variant="caption" color="text.secondary">{t("routing.elevation.unavailable")}</Typography>;
  }

  const elevations = knownPoints.map(point => point.elevationM);
  const highest = Math.max(...elevations);
  const lowest = Math.min(...elevations);
  let ascent = 0;
  let descent = 0;
  for (let index = 1; index < knownPoints.length; index += 1) {
    const change = knownPoints[index].elevationM - knownPoints[index - 1].elevationM;
    if (change > 0) ascent += change;
    if (change < 0) descent += Math.abs(change);
  }
  const endDistance = Math.max(knownPoints[knownPoints.length - 1].distanceM, 1);
  const elevationRange = Math.max(highest - lowest, 1);
  const chartPoints = knownPoints.map(point => {
    const x = 4 + (point.distanceM / endDistance) * 312;
    const y = 68 - ((point.elevationM - lowest) / elevationRange) * 56;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const chartArea = `M4 68 L${chartPoints} L316 68 Z`;

  return (
    <Box sx={{ p: 1.25, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <Box component="svg" viewBox="0 0 320 72" role="img" aria-label={t("routing.elevation.chartLabel")} sx={{ display: "block", width: "100%", height: 76, mb: 0.75 }}>
        <defs>
          <linearGradient id={elevationGradientId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#2e7d32" />
            <stop offset="50%" stopColor="#f9a825" />
            <stop offset="100%" stopColor="#c62828" />
          </linearGradient>
        </defs>
        <path d="M4 68H316" stroke="currentColor" strokeOpacity="0.16" />
        <path d={chartArea} fill={`url(#${elevationGradientId})`} fillOpacity="0.35" />
        <polyline points={chartPoints} fill="none" stroke={`url(#${elevationGradientId})`} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      </Box>
      <Stack direction="row" spacing={1.25} useFlexGap sx={{ flexWrap: "wrap" }}>
        <ElevationMetric label={t("routing.elevation.highest")} value={highest} />
        <ElevationMetric label={t("routing.elevation.lowest")} value={lowest} />
        <ElevationMetric label={t("routing.elevation.ascent")} value={ascent} icon={<TrendingUp size={14} />} />
        <ElevationMetric label={t("routing.elevation.descent")} value={descent} icon={<TrendingDown size={14} />} />
      </Stack>
    </Box>
  );
}

function ElevationMetric({ label, value, icon }: { label: string; value: number; icon?: ReactNode }) {
  return (
    <Stack direction="row" spacing={0.35} sx={{ alignItems: "center", color: "text.secondary" }}>
      {icon}
      <Typography variant="caption">{label}: <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{Math.round(value)} m</Box></Typography>
    </Stack>
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
                  secondary={feature.context || feature.place_name}
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

const routeResultPanelSx = {
  width: { xs: "calc(100% - 24px)", sm: 520 },
  maxWidth: { xs: "calc(100% - 24px)", sm: "calc(100% - 40px)" },
  height: { xs: "calc(100% - 132px)", sm: "calc(100% - 120px)" },
  maxHeight: { xs: "calc(100% - 132px)", sm: "calc(100% - 120px)" },
  p: { xs: 1.5, sm: 2 },
  overflow: "hidden",
};

export default RoutingPanel;
