import { Layers3, RefreshCw, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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

import { authFetch } from "../../../features/auth/authClient";
import { getTileServerPreviewUrl, type TileServerBaseMap } from "../../../tools/map/MapStyleTool";

interface TileServerBaseMapPanelProps {
  selectedMap: TileServerBaseMap | null;
  datasets: TileServerBaseMap[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  onReload: () => void;
  onSelect: (map: TileServerBaseMap) => void;
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
  selectedMap,
  datasets,
  status,
  error,
  onReload,
  onSelect,
  onClose,
}: TileServerBaseMapPanelProps) {
  const { t } = useTranslation();

  return (
    <Paper className="map-floating-panel" elevation={8} sx={panelSx}>
      <Stack spacing={1.5}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {t("layers.mapCatalogTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("layers.mapCatalogDescription")}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshCw size={15} />}
              disabled={status === "loading"}
              onClick={onReload}
            >
              {t("layers.reloadTileServer")}
            </Button>
            <IconButton size="small" onClick={onClose} aria-label={t("layers.closeBaseMapPanel")}>
              <X size={18} />
            </IconButton>
          </Stack>
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
            <Button
              size="small"
              variant="outlined"
              onClick={onReload}
              sx={{ alignSelf: "flex-start" }}
            >
              {t("layers.reloadTileServer")}
            </Button>
          </Stack>
        )}

        {status !== "loading" && datasets.length > 0 && (
          <DatasetGrid>
            {datasets.map((dataset) => (
              <DatasetCard
                key={dataset.id}
                dataset={dataset}
                selected={selectedMap?.id === dataset.id}
                selectedLabel={t("layers.selected")}
                onClick={() => onSelect(dataset)}
              />
            ))}
          </DatasetGrid>
        )}

        {status !== "loading" && datasets.length === 0 && status !== "error" && (
            <Stack spacing={1} sx={{ py: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {t("layers.noAccessibleMaps")}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={onReload}
                sx={{ alignSelf: "flex-start" }}
              >
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
  const { t } = useTranslation();
  const previewURL = getTileServerPreviewUrl(dataset);

  return (
    <ButtonBase onClick={onClick} sx={{ display: "block", width: "100%", textAlign: "left" }}>
      <Paper
        variant="outlined"
        sx={{
          overflow: "hidden",
          borderColor: selected ? "primary.main" : "divider",
          boxShadow: selected ? 2 : 0,
        }}
      >
        <DatasetPreview
          key={previewURL}
          dataset={dataset}
          previewURL={previewURL}
          selected={selected}
          alt={t("layers.previewAlt", { name: dataset.label })}
        />
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

// The Controller requires a Bearer token before it proxies GeoData. An <img>
// element cannot attach that header, so obtain the private preview with
// authFetch and render a short-lived object URL instead. This also means a
// revoked user cannot keep fetching a new preview directly from the gateway.
function DatasetPreview({
  dataset,
  previewURL,
  selected,
  alt,
}: {
  dataset: TileServerBaseMap;
  previewURL: string;
  selected: boolean;
  alt: string;
}) {
  const { t } = useTranslation();
  const [imageURL, setImageURL] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    let objectURL: string | null = null;
    void authFetch(previewURL, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Preview request failed: ${response.status}`);
        return response.blob();
      })
      .then((image) => {
        if (abort.signal.aborted) return;
        objectURL = URL.createObjectURL(image);
        setImageURL(objectURL);
      })
      .catch(() => {
        // A preview is optional. Keep the map usable when its rendering job is
        // still running or access was revoked while this panel was open.
      });
    return () => {
      abort.abort();
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [previewURL]);

  if (imageURL) {
    return (
      <Box
        component="img"
        src={imageURL}
        alt={alt}
        sx={{
          display: "block",
          width: "100%",
          height: { xs: 150, sm: 170 },
          objectFit: "cover",
          bgcolor: "grey.100",
        }}
      />
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        placeItems: "center",
        width: "100%",
        height: { xs: 150, sm: 170 },
        color: selected ? "primary.main" : "#64748b",
        bgcolor: selected ? "primary.light" : "grey.100",
        backgroundImage:
          "linear-gradient(135deg, transparent 45%, rgba(25, 118, 210, 0.16) 46%, transparent 48%), linear-gradient(45deg, transparent 45%, rgba(229, 57, 53, 0.18) 46%, transparent 48%)",
      }}
    >
      <Stack spacing={0.5} sx={{ alignItems: "center" }}>
        <Layers3 size={28} />
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          {dataset.previewPath ? t("layers.tileServerLoading") : t("layers.vectorOverlay")}
        </Typography>
      </Stack>
    </Box>
  );
}

export default TileServerBaseMapPanel;
