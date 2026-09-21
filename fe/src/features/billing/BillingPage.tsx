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
    <Box
      component="main"
      id="main-content"
      sx={{
        height: "100dvh",
        overflowY: "auto",
        overflowX: "hidden",
        overscrollBehavior: "contain",
        bgcolor: "background.default",
        backgroundImage: "radial-gradient(circle at 4% 4%, rgba(224, 0, 43, 0.10), transparent 25rem), radial-gradient(circle at 96% 10%, rgba(50, 94, 210, 0.12), transparent 28rem), radial-gradient(circle at 55% 100%, rgba(0, 138, 126, 0.10), transparent 30rem)",
        p: { xs: 2, sm: 4 },
      }}
    >
      <Stack spacing={3} sx={{ maxWidth: 1180, mx: "auto" }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
            <Box sx={{ display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: 2.5, color: "#fff", background: "linear-gradient(135deg, #e0002b, #8b3cc7 58%, #2369bf)" }}><ReceiptText size={24} /></Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 750 }}>{title}</Typography>
          </Stack>
          <Button component="a" href="/map" startIcon={<ArrowLeft size={18} />} sx={{ bgcolor: "rgba(224, 0, 43, 0.08)", "&:hover": { bgcolor: "rgba(224, 0, 43, 0.15)" } }}>{t("billing.backToMap")}</Button>
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
      <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: "1px solid rgba(224, 0, 43, 0.16)", background: "linear-gradient(135deg, rgba(224, 0, 43, 0.17), rgba(139, 60, 199, 0.11) 52%, rgba(34, 149, 139, 0.10))" }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between" }}>
          <Box>
            <Typography variant="overline" color="text.secondary">{t("billing.plan")}</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, textTransform: "capitalize" }}>{billing.plan}</Typography>
            <Typography variant="body2" color="text.secondary">{t("billing.period")}: {formatPeriod(billing.periodStart, billing.periodEnd, locale)}</Typography>
          </Box>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Metric label={t("billing.requestsInRange")} value={totalRequests} tone="blue" />
            <Metric label={t("billing.monthlyUsage")} value={`${billing.usedUnits} / ${billing.limitUnits}`} tone="orange" />
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: "1px solid rgba(38, 103, 201, 0.13)", background: "linear-gradient(155deg, rgba(38, 103, 201, 0.08), rgba(255,255,255,0) 42%)" }}>
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
            {billing.dailyRequests.map((item, index) => <RequestBar key={item.date} item={item} max={maximumRequests} locale={locale} compact={range === 30} index={index} />)}
          </Stack>
          <Typography variant="caption" color="text.secondary">{t("billing.dailyTrackingNote")}</Typography>
        </Stack>
      </Paper>
    </Stack>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone: "blue" | "orange" }) {
  const tones = {
    blue: { background: "rgba(38, 103, 201, 0.13)", color: "#164c99" },
    orange: { background: "rgba(230, 128, 25, 0.15)", color: "#a45100" },
  };
  return <Box sx={theme => ({ minWidth: 116, px: 1.5, py: 1, borderRadius: 2.5, ...tones[tone], color: theme.palette.mode === "dark" ? tone === "blue" ? "#9dc1ff" : "#ffd28e" : tones[tone].color })}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{ fontWeight: 800, color: "inherit" }}>{value}</Typography></Box>;
}

function RequestBar({ item, max, locale, compact, index }: { item: BillingDetails["dailyRequests"][number]; max: number; locale: string; compact: boolean; index: number }) {
  const date = new Date(`${item.date}T00:00:00`);
  const height = item.requests ? Math.max(10, item.requests / max * 160) : 3;
  const label = new Intl.DateTimeFormat(locale, compact ? { day: "numeric" } : { weekday: "short", day: "numeric" }).format(date);
  return (
    <Tooltip title={`${new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)}: ${item.requests}`}>
      <Stack spacing={0.75} sx={{ alignItems: "center", justifyContent: "end", flex: 1, minWidth: 0, height: "100%" }}>
        {!compact && <Typography variant="caption" sx={{ fontWeight: 700 }}>{item.requests}</Typography>}
        <Box sx={{ width: "100%", maxWidth: compact ? 18 : 46, minHeight: 3, height, borderRadius: "8px 8px 2px 2px", background: BAR_GRADIENTS[index % BAR_GRADIENTS.length], boxShadow: "0 5px 10px rgba(42, 66, 128, 0.15)", transition: "height 180ms ease" }} />
        <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
      </Stack>
    </Tooltip>
  );
}

const BAR_GRADIENTS = [
  "linear-gradient(180deg, #e0002b 0%, #ff8aa0 100%)",
  "linear-gradient(180deg, #2563c8 0%, #79a8ff 100%)",
  "linear-gradient(180deg, #007d75 0%, #6ad6c8 100%)",
  "linear-gradient(180deg, #8540ba 0%, #c596ed 100%)",
  "linear-gradient(180deg, #d16a00 0%, #ffc05a 100%)",
];

function formatPeriod(start: string | null, end: string | null, locale: string) {
  if (!start || !end) return "—";
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
}
