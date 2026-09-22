import { useEffect, useState } from "react";
import { Box, Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { BillingCard } from "../features/billing/BillingPage";
import { fetchAdminBilling, fetchAdminUserBilling, type BillingDetails } from "../features/billing/billingApi";
import { LoadingOrError, PageTitle } from "./AdminShared";

function formatPeriod(start: string | null, end: string | null, locale: string) {
  if (!start || !end) return "—";
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "short" });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
}

export function AdminBillingPage() {
  const { t, i18n } = useTranslation();
  const [billings, setBillings] = useState<BillingDetails[]>([]);
  const [selected, setSelected] = useState<BillingDetails | null>(null);
  const [range, setRange] = useState<1 | 7 | 30>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchAdminBilling().then(value => {
      if (active) {
        setBillings(value);
        setLoading(false);
      }
    }).catch(() => active && setError(true));
    return () => { active = false; };
  }, []);

  const openBilling = async (billing: BillingDetails) => {
    setError(false);
    try {
      setSelected(await fetchAdminUserBilling(billing.userId, range));
    } catch {
      setError(true);
    }
  };
  const changeRange = async (next: 1 | 7 | 30) => {
    setRange(next);
    if (!selected) return;
    try {
      setSelected(await fetchAdminUserBilling(selected.userId, next));
    } catch {
      setError(true);
    }
  };

  return <>
    <PageTitle title={t("admin.billingTitle")} description={t("admin.billingDescription")} />
    <LoadingOrError loading={loading} error={error} />
    {!loading && !error && <Stack spacing={2.5}>
      {selected && <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: "1px solid rgba(224,0,43,.18)" }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Box><Typography variant="h6" sx={{ fontWeight: 800 }}>{selected.name}</Typography><Typography variant="body2" color="text.secondary">{selected.email}</Typography></Box>
          <Button onClick={() => setSelected(null)}>{t("admin.closeDetails")}</Button>
        </Stack>
        <BillingCard billing={selected} locale={i18n.language} range={range} onRangeChange={value => void changeRange(value)} />
      </Paper>}
      <TableContainer component={Paper} sx={{ borderRadius: 3, border: "1px solid rgba(224,0,43,.14)" }}>
        <Table>
          <TableHead sx={{ bgcolor: "rgba(224,0,43,.08)" }}><TableRow>
            <TableCell>{t("admin.account")}</TableCell><TableCell>{t("admin.plan")}</TableCell><TableCell>{t("admin.used")}</TableCell><TableCell>{t("admin.quotaPeriod")}</TableCell><TableCell />
          </TableRow></TableHead>
          <TableBody>{billings.map(billing => <TableRow key={billing.userId} hover>
            <TableCell><Typography sx={{ fontWeight: 700 }}>{billing.name}</Typography><Typography variant="caption" color="text.secondary">{billing.email}</Typography></TableCell>
            <TableCell>{billing.plan}</TableCell><TableCell>{billing.usedUnits} / {billing.limitUnits}</TableCell><TableCell>{formatPeriod(billing.periodStart, billing.periodEnd, i18n.language)}</TableCell>
            <TableCell align="right"><Button size="small" onClick={() => void openBilling(billing)}>{t("admin.viewQuota")}</Button></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </TableContainer>
    </Stack>}
  </>;
}
