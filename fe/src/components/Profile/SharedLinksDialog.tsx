import { useCallback, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Link2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getOrCreateGeoJSONShareLink,
  listGeoJSONShares,
  revokeGeoJSONShare,
  type GeoJSONShareSummary,
} from "../../features/map/geoJSONShareClient";

interface SharedLinksDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function SharedLinksDialog({ open, onClose }: SharedLinksDialogProps) {
  const { t } = useTranslation();
  const [shares, setShares] = useState<GeoJSONShareSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingID, setOpeningID] = useState<string | null>(null);
  const [revokingID, setRevokingID] = useState<string | null>(null);
  const [shareURL, setShareURL] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadShares = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setShares(await listGeoJSONShares());
    } catch {
      setError(t("draw.shareListError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const showShareLink = async (share: GeoJSONShareSummary) => {
    setOpeningID(share.id);
    setError(null);
    try {
      const token = share.token || (await getOrCreateGeoJSONShareLink(share.id));
      setShares((current) =>
        current.map((item) => (item.id === share.id ? { ...item, token } : item))
      );
      setShareURL(`${window.location.origin}/share/${token}`);
    } catch {
      setError(t("draw.shareLinkLoadError"));
    } finally {
      setOpeningID(null);
    }
  };

  const revokeShare = async (share: GeoJSONShareSummary) => {
    if (!window.confirm(t("draw.shareRevokeConfirm"))) return;
    setRevokingID(share.id);
    setError(null);
    try {
      await revokeGeoJSONShare(share.id);
      setShares((current) => current.filter((item) => item.id !== share.id));
      if (shareURL.endsWith(`/share/${share.token}`)) setShareURL("");
    } catch {
      setError(t("draw.shareRevokeError"));
    } finally {
      setRevokingID(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ transition: { onEntered: () => void loadShares() } }}
    >
      <DialogTitle>{t("profile.yourLinks")}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={1.5}>
          <Typography color="text.secondary">{t("profile.yourLinksDescription")}</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {shareURL && (
            <TextField
              fullWidth
              size="small"
              label={t("draw.shareLink")}
              value={shareURL}
              slotProps={{ htmlInput: { readOnly: true } }}
            />
          )}
          {loading ? (
            <CircularProgress size={24} />
          ) : shares.length === 0 ? (
            <Typography color="text.secondary">{t("draw.noActiveShares")}</Typography>
          ) : (
            shares.map((share) => (
              <Stack
                key={share.id}
                direction="row"
                spacing={1}
                sx={{
                  alignItems: "center",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 2,
                  p: 1,
                }}
              >
                <Box
                  component="img"
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(share.preview_svg)}`}
                  alt={t("draw.sharePreviewAlt")}
                  sx={{
                    width: 112,
                    height: 68,
                    flex: "0 0 auto",
                    objectFit: "contain",
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                  }}
                />
                <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {t("draw.sharePreviewCount", { count: share.feature_count })}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t("profile.linkCreated", {
                      date: new Date(share.created_at).toLocaleDateString(),
                    })}
                  </Typography>
                </Stack>
                <Stack spacing={0.5}>
                  <Button
                    size="small"
                    startIcon={
                      openingID === share.id ? <CircularProgress size={14} /> : <Link2 size={15} />
                    }
                    onClick={() => void showShareLink(share)}
                    disabled={openingID === share.id}
                  >
                    {t("profile.showLink")}
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    startIcon={
                      revokingID === share.id ? (
                        <CircularProgress size={14} />
                      ) : (
                        <Trash2 size={15} />
                      )
                    }
                    onClick={() => void revokeShare(share)}
                    disabled={revokingID === share.id}
                  >
                    {t("draw.revokeShare")}
                  </Button>
                </Stack>
              </Stack>
            ))
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>{t("profile.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
