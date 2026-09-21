import { useEffect, useState, type ReactNode } from "react";
import { Alert, Box, Button, CircularProgress, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fetchMyBilling, type BillingDetails } from "./billingApi";

export default function BillingPage() {
  const { t, i18n } = useTranslation();
  const [billing, setBilling] = useState<BillingDetails | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchMyBilling().then(result => {
      if (active) setBilling(result);
    }).catch(() => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, []);

  return (
    <PageShell title={t("billing.title")}>
      {error && <Alert severity="error">{t("billing.loadError")}</Alert>}
      {!billing && !error && <Stack sx={{ alignItems: "center", py: 6 }}><CircularProgress /></Stack>}
      {billing && <BillingCard billing={billing} locale={i18n.language} />}
    </PageShell>
  );
}

export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Box component="main" id="main-content" sx={{ minHeight: "100dvh", bgcolor: "background.default", p: { xs: 2, sm: 4 } }}>
      <Stack spacing={3} sx={{ maxWidth: 1180, mx: "auto" }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
            <ReceiptText size={28} />
            <Typography variant="h4" component="h1" sx={{ fontWeight: 750 }}>{title}</Typography>
          </Stack>
          <Button component="a" href="/map" startIcon={<ArrowLeft size={18} />}>{t("billing.backToMap")}</Button>
        </Stack>
        {children}
      </Stack>
    </Box>
  );
}

export function BillingCard({ billing, locale }: { billing: BillingDetails; locale: string }) {
  const { t } = useTranslation();
  const percentage = billing.limitUnits > 0 ? Math.min(100, billing.usedUnits / billing.limitUnits * 100) : 0;
  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="overline" color="text.secondary">{t("billing.plan")}</Typography>
          <Typography variant="h5" sx={{ fontWeight: 750 }}>{billing.plan}</Typography>
        </Box>
        <Box>
          <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.75 }}>
            <Typography variant="body2">{t("billing.usage")}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{billing.usedUnits} / {billing.limitUnits}</Typography>
          </Stack>
          <LinearProgress variant="determinate" value={percentage} sx={{ height: 10, borderRadius: 6 }} />
        </Box>
        <Typography variant="body2" color="text.secondary">
          {t("billing.period")}: {formatPeriod(billing.periodStart, billing.periodEnd, locale)}
        </Typography>
      </Stack>
    </Paper>
  );
}

function formatPeriod(start: string | null, end: string | null, locale: string) {
  if (!start || !end) return "—";
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
}
