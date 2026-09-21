import { useEffect, useState, type ReactNode } from "react";
import { Alert, Box, Button, CircularProgress, Paper, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fetchMyBilling, type BillingDetails } from "./billingApi";

export default function BillingPage() {
  const { t, i18n } = useTranslation();
  const [billing, setBilling] = useState<BillingDetails | null>(null);
  const [range, setRange] = useState<1 | 7 | 30>(7);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchMyBilling(range).then(result => {
      if (active) setBilling(result);
    }).catch(() => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [range]);

  const changeRange = (nextRange: 1 | 7 | 30) => {
    setError(false);
    setRange(nextRange);
  };

  return (
    <PageShell title={t("billing.title")}>
      {error && <Alert severity="error">{t("billing.loadError")}</Alert>}
      {!billing && !error && <Stack sx={{ alignItems: "center", py: 6 }}><CircularProgress /></Stack>}
      {billing && <BillingCard billing={billing} locale={i18n.language} range={range} onRangeChange={changeRange} />}
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

export function BillingCard({ billing, locale, range, onRangeChange }: { billing: BillingDetails; locale: string; range: 1 | 7 | 30; onRangeChange: (range: 1 | 7 | 30) => void }) {
  const { t } = useTranslation();
  const totalRequests = billing.dailyRequests.reduce((total, item) => total + item.requests, 0);
  const maximumRequests = Math.max(...billing.dailyRequests.map(item => item.requests), 1);
  return (
    <Stack spacing={2.5}>
      <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, background: "linear-gradient(135deg, rgba(224, 0, 43, 0.12), rgba(255,255,255,0) 60%)" }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between" }}>
          <Box>
            <Typography variant="overline" color="text.secondary">{t("billing.plan")}</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, textTransform: "capitalize" }}>{billing.plan}</Typography>
            <Typography variant="body2" color="text.secondary">{t("billing.period")}: {formatPeriod(billing.periodStart, billing.periodEnd, locale)}</Typography>
          </Box>
          <Stack direction="row" spacing={3} sx={{ alignItems: "center" }}>
            <Metric label={t("billing.requestsInRange")} value={totalRequests} />
            <Metric label={t("billing.monthlyUsage")} value={`${billing.usedUnits} / ${billing.limitUnits}`} />
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 750 }}>{t("billing.requestChart")}</Typography>
              <Typography variant="body2" color="text.secondary">{t("billing.routeRequestsDescription")}</Typography>
            </Box>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={range}
              onChange={(_, value: 1 | 7 | 30 | null) => value && onRangeChange(value)}
              aria-label={t("billing.range")}
            >
              <ToggleButton value={1}>{t("billing.today")}</ToggleButton>
              <ToggleButton value={7}>{t("billing.last7Days")}</ToggleButton>
              <ToggleButton value={30}>{t("billing.last30Days")}</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <Stack direction="row" spacing={range === 30 ? 0.5 : 1} sx={{ height: 220, alignItems: "end", pt: 2 }} role="img" aria-label={t("billing.chartLabel", { count: totalRequests })}>
            {billing.dailyRequests.map(item => <RequestBar key={item.date} item={item} max={maximumRequests} locale={locale} compact={range === 30} />)}
          </Stack>
          <Typography variant="caption" color="text.secondary">{t("billing.dailyTrackingNote")}</Typography>
        </Stack>
      </Paper>
    </Stack>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <Box sx={{ minWidth: 88 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{ fontWeight: 800 }}>{value}</Typography></Box>;
}

function RequestBar({ item, max, locale, compact }: { item: BillingDetails["dailyRequests"][number]; max: number; locale: string; compact: boolean }) {
  const date = new Date(`${item.date}T00:00:00`);
  const height = item.requests ? Math.max(10, item.requests / max * 160) : 3;
  const label = new Intl.DateTimeFormat(locale, compact ? { day: "numeric" } : { weekday: "short", day: "numeric" }).format(date);
  return (
    <Tooltip title={`${new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)}: ${item.requests}`}>
      <Stack spacing={0.75} sx={{ alignItems: "center", justifyContent: "end", flex: 1, minWidth: 0, height: "100%" }}>
        {!compact && <Typography variant="caption" sx={{ fontWeight: 700 }}>{item.requests}</Typography>}
        <Box sx={{ width: "100%", maxWidth: compact ? 18 : 46, minHeight: 3, height, borderRadius: "8px 8px 2px 2px", background: "linear-gradient(180deg, #e0002b 0%, #ff879d 100%)", transition: "height 180ms ease" }} />
        <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
      </Stack>
    </Tooltip>
  );
}

function formatPeriod(start: string | null, end: string | null, locale: string) {
  if (!start || !end) return "—";
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
}
