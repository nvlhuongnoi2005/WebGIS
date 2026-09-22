import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { fetchAdminAudit, type AuditLog } from "../features/billing/billingApi";
import { LoadingOrError, PageTitle } from "./AdminShared";

function auditAction(t: TFunction, action: string) {
  if (action === "user.created") return t("admin.auditCreated");
  if (action === "user.deleted") return t("admin.auditDeleted");
  if (action === "user.password_reset") return t("admin.auditPasswordReset");
  return t("admin.auditUpdated");
}

function describeAudit(t: TFunction, details: Record<string, unknown>) {
  const changes = details.changes;
  if (changes && typeof changes === "object") {
    return Object.entries(changes as Record<string, unknown>).map(([field, value]) => {
      const pair = value as { from?: unknown; to?: unknown };
      return `${field}: ${String(pair.from ?? "—")} → ${String(pair.to ?? "—")}`;
    }).join(" · ") || t("admin.noChanges");
  }
  const created = details.created ?? details.deleted;
  if (created && typeof created === "object") return Object.entries(created as Record<string, unknown>).map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
  const legacy = Object.entries(details).map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
  return legacy || t("admin.noDetails");
}

export function AdminAuditPage() {
  const { t, i18n } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchAdminAudit().then(value => {
      if (active) {
        setLogs(value);
        setLoading(false);
      }
    }).catch(() => active && setError(true));
    return () => { active = false; };
  }, []);

  return <>
    <PageTitle title={t("admin.auditLog")} description={t("admin.auditDescription")} />
    <LoadingOrError loading={loading} error={error} />
    {!loading && !error && <Stack spacing={1.25}>
      {logs.length === 0 && <Paper sx={{ p: 3, borderRadius: 3 }}><Typography color="text.secondary">{t("admin.noAuditLogs")}</Typography></Paper>}
      {logs.map(log => <Paper key={log.id} sx={{ p: 2, borderRadius: 2.5, borderLeft: "4px solid #e0002b" }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between" }}>
          <Box>
            <Typography sx={{ fontWeight: 750 }}>{auditAction(t, log.action)}</Typography>
            <Typography variant="body2" color="text.secondary">{t("admin.administratorLabel")}: {log.actor || t("admin.deletedAccount")}{log.target ? ` · ${t("admin.accountLabel")}: ${log.target}` : ""}</Typography>
            <Typography variant="body2" sx={{ mt: 0.75 }}>{describeAudit(t, log.details)}</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.createdAt))}</Typography>
        </Stack>
      </Paper>)}
    </Stack>}
  </>;
}
