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

const vehicles: Array<{ value: RoutingVehicle; label: string; icon: typeof Car }> = [
  { value: "auto", label: "Ô tô", icon: Car },
  { value: "motorcycle", label: "Xe máy", icon: Bike },
  { value: "bicycle", label: "Xe đạp", icon: Bike },
  { value: "pedestrian", label: "Đi bộ", icon: Footprints },
  { value: "bus", label: "Xe buýt", icon: Bus },
  { value: "truck", label: "Xe tải", icon: Truck },
  { value: "taxi", label: "Taxi", icon: Car },
];

function formatCoordinate(point: MapCoordinates | null) {
  return point ? `${point[1].toFixed(5)}, ${point[0].toFixed(5)}` : "Chưa chọn trên bản đồ";
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
  const canCalculate = Boolean(origin && destination) && status !== "loading";

  return (
    <Paper elevation={4} sx={panelSx}>
      <Stack spacing={1.5}>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box sx={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 2, bgcolor: "primary.50", color: "primary.main" }}>
              <RouteIcon size={18} />
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>Tìm đường</Typography>
              <Typography variant="caption" color="text.secondary">Chọn A và B trên bản đồ</Typography>
            </Box>
          </Stack>
          <IconButton size="small" onClick={onReset} title="Đặt lại điểm A và B" aria-label="Đặt lại điểm A và B">
            <RotateCcw size={17} />
          </IconButton>
        </Stack>

        <Stack spacing={0.75}>
          <PointRow color="#16a34a" label="A · Điểm xuất phát" value={formatCoordinate(origin)} />
          <PointRow color="#dc2626" label="B · Điểm đến" value={formatCoordinate(destination)} />
        </Stack>

        <Divider />
        <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Phương tiện
        </Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={vehicle}
          onChange={(_, value: RoutingVehicle | null) => value && onVehicleChange(value)}
          sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.5, "& .MuiToggleButtonGroup-grouped": { border: "1px solid", borderColor: "divider", borderRadius: "8px !important", m: 0 } }}
        >
          {vehicles.map(({ value, label, icon: Icon }) => (
            <ToggleButton key={value} value={value} sx={{ minWidth: 0, minHeight: 44, px: 0.25, flexDirection: "column", gap: 0.25, textTransform: "none" }}>
              <Icon size={17} />
              <Typography variant="caption" sx={{ fontSize: 10.5, lineHeight: 1 }}>{label}</Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {error && <Alert severity="error" variant="outlined" sx={{ fontSize: 12 }}>{error}</Alert>}

        {status === "success" && typeof distanceKm === "number" && typeof timeSeconds === "number" && (
          <Stack direction="row" spacing={1} sx={{ p: 1.25, borderRadius: 2, bgcolor: "success.50", color: "success.900", alignItems: "center" }}>
            <CheckCircle2 size={20} color="#15803d" />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {formatRouteDuration(timeSeconds)} · {distanceKm.toFixed(1)} km
              </Typography>
              <Typography variant="caption" color="text.secondary">Tuyến đường phù hợp với phương tiện đã chọn</Typography>
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
          {status === "loading" ? "Đang tìm đường…" : "Tìm đường"}
        </Button>

        {(!origin || !destination) && (
          <Stack direction="row" spacing={0.75} sx={{ color: "text.secondary", alignItems: "center" }}>
            <LocateFixed size={15} />
            <Typography variant="caption">{origin ? "Nhấp tiếp để chọn điểm B" : "Nhấp bản đồ để chọn điểm A"}</Typography>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function PointRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <Stack direction="row" spacing={1} sx={{ minWidth: 0, alignItems: "center" }}>
      <Box sx={{ width: 10, height: 10, flexShrink: 0, borderRadius: "50%", bgcolor: color, border: "2px solid white", boxShadow: `0 0 0 1px ${color}` }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{label}</Typography>
        <Typography variant="body2" noWrap sx={{ color: value === "Chưa chọn trên bản đồ" ? "text.disabled" : "text.primary" }}>{value}</Typography>
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
