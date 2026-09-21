import { useEffect, useState, type ReactNode } from "react";
import { Alert, Box, CircularProgress, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { Activity, ShieldCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageShell } from "./BillingPage";
import { fetchAdminAudit, fetchAdminBilling, fetchAdminDashboard, fetchAdminUsers, updateAdminUser, type AdminDashboardMetrics, type AdminUser, type AuditLog, type BillingDetails } from "./billingApi";

export default function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [billings, setBillings] = useState<BillingDetails[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([fetchAdminDashboard(), fetchAdminBilling(), fetchAdminUsers(), fetchAdminAudit()]).then(([nextMetrics, nextBillings, nextUsers, nextAudit]) => {
      if (!active) return;
      setMetrics(nextMetrics);
      setBillings(nextBillings);
      setUsers(nextUsers);
      setAudit(nextAudit);
    }).catch(() => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, []);

  const saveUser = async (id: string, update: Parameters<typeof updateAdminUser>[1]) => {
    try { await updateAdminUser(id, update); setUsers(await fetchAdminUsers()); setAudit(await fetchAdminAudit()); }
    catch { setError(true); }
  };

  return (
    <PageShell title={t("admin.title")}>
      {error && <Alert severity="error">{t("admin.loadError")}</Alert>}
      {!metrics && !error && <Stack sx={{ alignItems: "center", py: 6 }}><CircularProgress /></Stack>}
      {metrics && <>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <MetricCard icon={<Users size={23} />} label={t("admin.totalAccounts")} value={metrics.totalAccounts} />
          <MetricCard icon={<Activity size={23} />} label={t("admin.onlineUsers")} value={metrics.onlineUsers} />
        </Stack>
        <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>{t("admin.ageDistribution")}</Typography>
          <Stack direction="row" spacing={1.5} sx={{ height: 180, alignItems: "end" }}>
            {metrics.ageGroups.map(group => <AgeBar key={group.label} label={group.label} value={group.count} max={Math.max(...metrics.ageGroups.map(item => item.count), 1)} />)}
          </Stack>
        </Paper>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>{t("admin.billingDetails")}</Typography>
          <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
            <Table size="small" aria-label={t("admin.billingDetails")}>
              <TableHead><TableRow><TableCell>{t("admin.account")}</TableCell><TableCell>{t("billing.plan")}</TableCell><TableCell>{t("billing.monthlyUsage")}</TableCell><TableCell>{t("billing.period")}</TableCell></TableRow></TableHead>
              <TableBody>
                {billings.map(billing => <TableRow key={billing.userId} hover>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 700 }}>{billing.name}</Typography><Typography variant="caption" color="text.secondary">{billing.email}</Typography></TableCell>
                  <TableCell>{billing.plan}</TableCell>
                  <TableCell>{billing.usedUnits} / {billing.limitUnits}</TableCell>
                  <TableCell>{billing.periodStart && billing.periodEnd ? `${new Intl.DateTimeFormat(i18n.language, { dateStyle: "short" }).format(new Date(billing.periodStart))} – ${new Intl.DateTimeFormat(i18n.language, { dateStyle: "short" }).format(new Date(billing.periodEnd))}` : "—"}</TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>{t("admin.userManagement")}</Typography>
          <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
            <Table size="small"><TableHead><TableRow><TableCell>{t("admin.account")}</TableCell><TableCell>{t("admin.role")}</TableCell><TableCell>{t("admin.status")}</TableCell><TableCell>{t("billing.plan")}</TableCell><TableCell>{t("admin.quota")}</TableCell><TableCell>{t("admin.online")}</TableCell></TableRow></TableHead>
              <TableBody>{users.map(user => <TableRow key={user.id} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 700 }}>{user.name}</Typography><Typography variant="caption" color="text.secondary">{user.email}</Typography></TableCell>
                <TableCell><Select size="small" value={user.role} onChange={event => void saveUser(user.id, { role: event.target.value as AdminUser["role"] })}><MenuItem value="user">user</MenuItem><MenuItem value="admin">admin</MenuItem></Select></TableCell>
                <TableCell><Select size="small" value={user.status} onChange={event => void saveUser(user.id, { status: event.target.value as AdminUser["status"] })}><MenuItem value="ACTIVE">ACTIVE</MenuItem><MenuItem value="DISABLED">DISABLED</MenuItem><MenuItem value="LOCKED">LOCKED</MenuItem></Select></TableCell>
                <TableCell><TextField size="small" defaultValue={user.plan} onBlur={event => event.target.value !== user.plan && void saveUser(user.id, { plan: event.target.value })} /></TableCell>
                <TableCell><TextField size="small" type="number" defaultValue={user.limitUnits} onBlur={event => { const limitUnits = Number(event.target.value); if (Number.isFinite(limitUnits) && limitUnits !== user.limitUnits) void saveUser(user.id, { limitUnits }); }} /></TableCell>
                <TableCell><Typography variant="caption" color={user.online ? "success.main" : "text.secondary"}>{user.online ? t("admin.online") : t("admin.offline")}</Typography></TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </TableContainer>
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>{t("admin.auditLog")}</Typography>
          <Paper sx={{ borderRadius: 3, p: 2 }}><Stack spacing={1}>{audit.slice(0, 8).map(entry => <Stack key={entry.id} direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}><Typography variant="body2"><ShieldCheck size={14} /> {entry.actor} · {entry.action} · {entry.target}</Typography><Typography variant="caption" color="text.secondary">{new Intl.DateTimeFormat(i18n.language,{dateStyle:"short",timeStyle:"short"}).format(new Date(entry.createdAt))}</Typography></Stack>)}</Stack></Paper>
        </Box>
      </>}
    </PageShell>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <Paper sx={{ p: 2.5, borderRadius: 3, flex: 1 }}><Stack direction="row" spacing={1.5} sx={{ alignItems: "center", color: "primary.main" }}>{icon}<Box><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h4" color="text.primary" sx={{ fontWeight: 750 }}>{value}</Typography></Box></Stack></Paper>;
}

function AgeBar({ label, value, max }: { label: string; value: number; max: number }) {
  return <Stack spacing={0.75} sx={{ alignItems: "center", flex: 1, minWidth: 28, height: "100%", justifyContent: "end" }}><Typography variant="caption">{value}</Typography><Box sx={{ width: "100%", maxWidth: 48, minHeight: value ? 4 : 0, height: `${value / max * 128}px`, borderRadius: "8px 8px 2px 2px", bgcolor: "primary.main" }} /><Typography variant="caption" color="text.secondary">{label}</Typography></Stack>;
}
