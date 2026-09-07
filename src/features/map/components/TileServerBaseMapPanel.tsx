import { X } from "lucide-react";
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
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
              gap: 1.5,
            }}
          >
            {baseMaps.map(baseMap => {
              const isSelected = selectedBaseMap?.id === baseMap.id;

              return (
                <ButtonBase
                  key={baseMap.id}
                  onClick={() => onSelect(baseMap)}
                  sx={{ display: "block", width: "100%", textAlign: "left" }}
                >
                  <Paper
                    variant="outlined"
                    sx={{
                      overflow: "hidden",
                      borderColor: isSelected ? "primary.main" : "divider",
                      boxShadow: isSelected ? 2 : 0,
                    }}
                  >
                    <Box
                      component="img"
                      src={getTileServerPreviewUrl(baseMap)}
                      alt={`${baseMap.label} preview`}
                      loading="lazy"
                      sx={{
                        display: "block",
                        width: "100%",
                        height: { xs: 150, sm: 170 },
                        objectFit: "cover",
                        bgcolor: "grey.100",
                      }}
                    />
                    <Stack spacing={0.25} sx={{ p: 1.25 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                        {baseMap.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {baseMap.id}
                      </Typography>
                      {isSelected && (
                        <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600 }}>
                          {t("layers.selected")}
                        </Typography>
                      )}
                    </Stack>
                  </Paper>
                </ButtonBase>
              );
            })}
          </Box>
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

export default TileServerBaseMapPanel;
