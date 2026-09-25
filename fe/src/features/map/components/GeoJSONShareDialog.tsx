import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";

import type { DrawFeatureCollection } from "../../../tools/draw/DrawTool";
import {
  createGeoJSONShare,
  searchGeoJSONShareRecipients,
  sendGeoJSONShare,
  type GeoJSONShareMapState,
  type GeoJSONShareRecipient,
} from "../geoJSONShareClient";

interface GeoJSONShareDialogProps {
  featureCount: number;
  geoJSON: DrawFeatureCollection;
  mapState: GeoJSONShareMapState;
  onClose: () => void;
}

export default function GeoJSONShareDialog({
  featureCount,
  geoJSON,
  mapState,
  onClose,
}: GeoJSONShareDialogProps) {
  const { t } = useTranslation();
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [createdShareId, setCreatedShareId] = useState<string | null>(null);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientResults, setRecipientResults] = useState<GeoJSONShareRecipient[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<GeoJSONShareRecipient[]>([]);
  const [recipientSearchBusy, setRecipientSearchBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendComplete, setSendComplete] = useState(false);
  const recipientSearchSequence = useRef(0);

  const handleCreateShare = async () => {
    setShareBusy(true);
    setShareError(null);
    setSelectedRecipients([]);
    setSendComplete(false);

    try {
      const result = await createGeoJSONShare(geoJSON, mapState);
      setCreatedShareId(result.id);
      setShareUrl(`${window.location.origin}/share/${result.token}`);
    } catch {
      setShareError(t("draw.shareCreateError"));
    } finally {
      setShareBusy(false);
    }
  };

  const handleRecipientSearch = async (query: string) => {
    setRecipientSearch(query);
    setSendComplete(false);
    setShareError(null);

    const sequence = ++recipientSearchSequence.current;
    if (query.trim().length < 2) {
      setRecipientResults([]);
      setRecipientSearchBusy(false);
      return;
    }

    setRecipientResults([]);
    setRecipientSearchBusy(true);

    try {
      const results = await searchGeoJSONShareRecipients(query.trim());
      if (recipientSearchSequence.current === sequence) {
        setRecipientResults(results);
      }
    } catch {
      if (recipientSearchSequence.current === sequence) {
        setShareError(t("draw.shareRecipientSearchError"));
      }
    } finally {
      if (recipientSearchSequence.current === sequence) {
        setRecipientSearchBusy(false);
      }
    }
  };

  const toggleRecipient = (recipient: GeoJSONShareRecipient) => {
    setSendComplete(false);
    setSelectedRecipients((current) =>
      current.some((item) => item.id === recipient.id)
        ? current.filter((item) => item.id !== recipient.id)
        : [...current, recipient]
    );
  };

  const handleSendShare = async () => {
    if (!createdShareId || selectedRecipients.length === 0) return;

    setSendBusy(true);
    setShareError(null);

    try {
      await sendGeoJSONShare(
        createdShareId,
        selectedRecipients.map((recipient) => recipient.id)
      );
      setSendComplete(true);
    } catch {
      setShareError(t("draw.shareSendError"));
    } finally {
      setSendBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("draw.shareTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <Typography color="text.secondary">
            {t("draw.shareDescription", { count: featureCount })}
          </Typography>
          {shareError && <Alert severity="error">{shareError}</Alert>}
          {shareUrl && (
            <Stack spacing={1}>
              <TextField
                fullWidth
                size="small"
                label={t("draw.shareLink")}
                value={shareUrl}
                slotProps={{ htmlInput: { readOnly: true } }}
              />
              <Divider />
              <Typography variant="subtitle2">{t("draw.shareChooseRecipients")}</Typography>
              <TextField
                fullWidth
                size="small"
                label={t("draw.shareSearchPeople")}
                placeholder={t("draw.shareSearchPeoplePlaceholder")}
                value={recipientSearch}
                onChange={(event) => void handleRecipientSearch(event.target.value)}
              />
              <Typography variant="caption" color="text.secondary">
                {selectedRecipients.length > 0
                  ? t("draw.shareSelectedCount", {
                      count: selectedRecipients.length,
                    })
                  : t("draw.shareSearchHint")}
              </Typography>
              {recipientSearchBusy ? (
                <CircularProgress size={20} />
              ) : recipientSearch.trim().length >= 2 && recipientResults.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t("draw.shareNoPeopleFound")}
                </Typography>
              ) : (
                <Stack spacing={0.25} sx={{ maxHeight: 190, overflowY: "auto" }}>
                  {recipientResults.map((recipient) => (
                    <FormControlLabel
                      key={recipient.id}
                      control={
                        <Checkbox
                          checked={selectedRecipients.some((item) => item.id === recipient.id)}
                          onChange={() => toggleRecipient(recipient)}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2">{recipient.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {recipient.email}
                          </Typography>
                        </Box>
                      }
                      sx={{
                        mx: 0,
                        px: 0.75,
                        borderRadius: 1,
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    />
                  ))}
                </Stack>
              )}
              {sendComplete && (
                <Alert severity="success">
                  {t("draw.shareSent", {
                    count: selectedRecipients.length,
                  })}
                </Alert>
              )}
              <Button
                variant="contained"
                onClick={() => void handleSendShare()}
                disabled={!selectedRecipients.length || sendBusy}
              >
                {sendBusy ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  t("draw.shareSendToPeople")
                )}
              </Button>
            </Stack>
          )}
          <Button
            variant="contained"
            onClick={() => void handleCreateShare()}
            disabled={shareBusy || featureCount === 0}
          >
            {shareBusy ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              t(shareUrl ? "draw.createAnotherShareLink" : "draw.createShareLink")
            )}
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t("profile.cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
