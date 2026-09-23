import { useContext, useEffect, useState } from "react";
import { Alert, AppBar, Box, Button, CircularProgress, List, ListItem, ListItemButton, ListItemText, Stack, Toolbar, Typography } from "@mui/material";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { listReceivedGeoJSONShares, type ReceivedGeoJSONShare } from "./geoJSONShareClient";
import { AppNavigationContext } from "../../appNavigation";

export default function SharedWithMePage() {
  const { t } = useTranslation();
  const navigate = useContext(AppNavigationContext);
  const [shares, setShares] = useState<ReceivedGeoJSONShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void listReceivedGeoJSONShares().then(result => {
      if (active) setShares(result);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return (
    <Box component="main" id="main-content" sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
      <AppBar position="static" color="inherit" elevation={1}>
        <Toolbar sx={{ gap: 1 }}>
          <Button onClick={() => navigate("/map")} startIcon={<ArrowLeft size={18} />}>{t("draw.backToMap")}</Button>
          <Typography variant="h6">{t("draw.sharedInboxTitle")}</Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ maxWidth: 760, mx: "auto", p: { xs: 2, sm: 4 } }}>
        <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>{t("draw.sharedInboxTitle")}</Typography>
        {loading ? (
          <Stack sx={{ alignItems: "center", py: 8 }}><CircularProgress /></Stack>
        ) : error ? (
          <Alert severity="error">{t("draw.sharedInboxError")}</Alert>
        ) : shares.length === 0 ? (
          <Typography color="text.secondary">{t("draw.sharedInboxEmpty")}</Typography>
        ) : (
          <List sx={{ bgcolor: "background.paper", borderRadius: 2, boxShadow: 1 }}>
            {shares.map(share => (
              <ListItem key={share.id} disablePadding divider>
                <ListItemButton onClick={() => navigate(`/shared-with-me/${encodeURIComponent(share.id)}`)}>
                  <ListItemText
                    primary={t("draw.sharedBy", { name: share.owner_name })}
                    secondary={`${share.owner_email} · ${t("draw.shareExpires", { date: new Date(share.expires_at).toLocaleDateString() })}`}
                  />
                  <ArrowRight size={18} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
}
