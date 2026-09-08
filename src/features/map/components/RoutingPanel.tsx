import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
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
  RotateCcw,
  Route as RouteIcon,
  Search,
  Truck,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatRouteDuration, type RoutingVehicle } from "../../../tools/RoutingTool";
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
  return point ? `${point[1].toFixed(5)}, ${point[0].toFixed(5)}` : notSelected;
}

function RoutingPanel({
  origin,
  destination,
  vehicle,
  status,
  error,
  distanceKm,
  timeSeconds,
  onVehicleChange,
  onCalculate,
  onReset,
}: RoutingPanelProps) {
  const { t } = useTranslation();
  const canCalculate = Boolean(origin && destination) && status !== "loading";
  const notSelected = t("routing.notSelected");
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

        <Stack spacing={0.75}>
          <PointRow color="#16a34a" label={`A · ${t("routing.origin")}`} value={formatCoordinate(origin, notSelected)} selected={Boolean(origin)} />
          <PointRow color="#dc2626" label={`B · ${t("routing.destination")}`} value={formatCoordinate(destination, notSelected)} selected={Boolean(destination)} />
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

function PointRow({ color, label, value, selected }: { color: string; label: string; value: string; selected: boolean }) {
  return (
    <Stack direction="row" spacing={1} sx={{ minWidth: 0, alignItems: "center" }}>
      <Box sx={{ width: 10, height: 10, flexShrink: 0, borderRadius: "50%", bgcolor: color, border: "2px solid white", boxShadow: `0 0 0 1px ${color}` }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{label}</Typography>
        <Typography variant="body2" noWrap sx={{ color: selected ? "text.primary" : "text.disabled" }}>{value}</Typography>
      </Box>
    </Stack>
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
