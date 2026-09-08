import { Layers3, X } from "lucide-react";
import type { ReactNode } from "react";
import {
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";

import {
  getTileServerPreviewUrl,
  type TileServerBaseMap,
} from "../../../tools/MapStyleTool";

interface TileServerBaseMapPanelProps {
  selectedBaseMap: TileServerBaseMap | null;
  baseMaps: TileServerBaseMap[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  onReload: () => void;
  onSelect: (baseMap: TileServerBaseMap) => void;
  overlays: TileServerBaseMap[];
  selectedOverlayIds: string[];
  onToggleOverlay: (overlay: TileServerBaseMap) => void;
  onClose: () => void;
}

const panelSx = {
  position: "absolute",
  left: "50%",
  top: "50%",
  zIndex: "var(--z-overlay-panel)",
  width: { xs: "calc(100% - 24px)", sm: 720 },
  maxWidth: "calc(100% - 24px)",
  maxHeight: "calc(100% - 48px)",
  overflow: "auto",
  p: { xs: 1.5, sm: 2 },
  transform: "translate(-50%, -50%)",
};

function TileServerBaseMapPanel({
  selectedBaseMap,
  baseMaps,
  status,
  error,
  onReload,
  onSelect,
  overlays,
  selectedOverlayIds,
  onToggleOverlay,
  onClose,
}: TileServerBaseMapPanelProps) {
  const { t } = useTranslation();

  return (
    <Paper elevation={8} sx={panelSx}>
      <Stack spacing={1.5}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {t("data.tileServer")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("layers.tileServerBaseMapDescription")}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label={t("layers.closeBaseMapPanel")}>
            <X size={18} />
          </IconButton>
        </Stack>

        {status === "loading" && (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", py: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2">{t("layers.tileServerLoading")}</Typography>
          </Stack>
        )}

        {status === "error" && (
          <Stack spacing={1} sx={{ py: 1 }}>
            <Typography variant="body2" color="error.main">
              {error || t("layers.tileServerError")}
            </Typography>
            <Button size="small" variant="outlined" onClick={onReload} sx={{ alignSelf: "flex-start" }}>
              {t("layers.reloadTileServer")}
            </Button>
          </Stack>
        )}

        {status !== "loading" && baseMaps.length > 0 && (
          <DatasetGrid>
            {baseMaps.map(baseMap => (
              <DatasetCard
                key={baseMap.id}
                dataset={baseMap}
                selected={selectedBaseMap?.id === baseMap.id}
                selectedLabel={t("layers.selected")}
                onClick={() => onSelect(baseMap)}
              />
            ))}
          </DatasetGrid>
        )}

        {status !== "loading" && (
          <Stack spacing={1}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <Layers3 size={17} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Overlays
              </Typography>
              <Typography variant="caption" color="text.secondary">
                (chọn nhiều)
              </Typography>
            </Stack>

            {overlays.length > 0 ? (
              <DatasetGrid>
                {overlays.map(overlay => (
                  <DatasetCard
                    key={overlay.id}
                    dataset={overlay}
                    selected={selectedOverlayIds.includes(overlay.id)}
                    selectedLabel="Đang hiển thị"
                    onClick={() => onToggleOverlay(overlay)}
                  />
                ))}
              </DatasetGrid>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Chưa có overlay nào được đăng ký trong tile server.
              </Typography>
            )}
          </Stack>
        )}

        {status !== "loading" && baseMaps.length === 0 && status !== "error" && (
          <Stack spacing={1} sx={{ py: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t("layers.noTileServerData")}
            </Typography>
            <Button size="small" variant="outlined" onClick={onReload} sx={{ alignSelf: "flex-start" }}>
              {t("layers.reloadTileServer")}
            </Button>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function DatasetGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
        gap: 1.5,
      }}
    >
      {children}
    </Box>
  );
}

function DatasetCard({
  dataset,
  selected,
  selectedLabel,
  onClick,
}: {
  dataset: TileServerBaseMap;
  selected: boolean;
  selectedLabel: string;
  onClick: () => void;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{ display: "block", width: "100%", textAlign: "left" }}
    >
      <Paper
        variant="outlined"
        sx={{
          overflow: "hidden",
          borderColor: selected ? "primary.main" : "divider",
          boxShadow: selected ? 2 : 0,
        }}
      >
        {dataset.kind === "vector" ? (
          <Box
            sx={{
              display: "grid",
              placeItems: "center",
              width: "100%",
              height: { xs: 150, sm: 170 },
              color: selected ? "primary.main" : "#64748b",
              bgcolor: selected ? "primary.50" : "grey.100",
              backgroundImage: "linear-gradient(135deg, transparent 45%, rgba(25, 118, 210, 0.16) 46%, transparent 48%), linear-gradient(45deg, transparent 45%, rgba(229, 57, 53, 0.18) 46%, transparent 48%)",
            }}
          >
            <Stack spacing={0.5} sx={{ alignItems: "center" }}>
              <Layers3 size={28} />
              <Typography variant="caption" sx={{ fontWeight: 700 }}>Vector overlay</Typography>
            </Stack>
          </Box>
        ) : (
          <Box
            component="img"
            src={getTileServerPreviewUrl(dataset)}
            alt={`${dataset.label} preview`}
            loading="lazy"
            sx={{
              display: "block",
              width: "100%",
              height: { xs: 150, sm: 170 },
              objectFit: "cover",
              bgcolor: "grey.100",
            }}
          />
        )}
        <Stack spacing={0.25} sx={{ p: 1.25 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
            {dataset.label}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {dataset.id}
          </Typography>
          {selected && (
            <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600 }}>
              {selectedLabel}
            </Typography>
          )}
        </Stack>
      </Paper>
    </ButtonBase>
  );
}

export default TileServerBaseMapPanel;
