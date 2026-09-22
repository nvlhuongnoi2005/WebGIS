import type { ReactNode } from "react";
import { ArrowLeft, ClipboardList, CreditCard, LayoutDashboard, ShieldCheck, Users } from "lucide-react";
import { Box, Button, Divider, List, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher/LanguageSwitcher";
import { pathFor, type AdminSection } from "./adminNavigation";

// Shared frame for every administration page.

function navigate(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function AdminShell({ section, children }: { section: AdminSection; children: ReactNode }) {
  const { t } = useTranslation();
  const navigation = [
    { id: "overview" as const, label: t("admin.overview"), icon: LayoutDashboard },
    { id: "billing" as const, label: t("admin.billingTitle"), icon: CreditCard },
    { id: "users" as const, label: t("admin.userManagement"), icon: Users },
    { id: "audit" as const, label: t("admin.auditLog"), icon: ClipboardList },
  ];
  return <Box component="main" id="main-content" sx={{ height: "100dvh", overflow: "hidden", bgcolor: "background.default", p: { xs: 1.5, sm: 3 } }}>
    <Stack direction={{ xs: "column", md: "row" }} spacing={2.5} sx={{ height: "100%", minHeight: 0, maxWidth: 1440, mx: "auto" }}>
      <Paper component="nav" aria-label={t("admin.navigation")} sx={{ width: { md: 244 }, flexShrink: 0, p: 1.25, borderRadius: 3, height: { md: "fit-content" }, position: { md: "sticky" }, top: { md: 24 }, border: "1px solid rgba(224, 0, 43, 0.15)" }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", justifyContent: "space-between", px: 1, py: 1.25 }}><Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}><Box sx={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 2, bgcolor: "primary.main", color: "#fff" }}><ShieldCheck size={21} /></Box><Box><Typography sx={{ fontWeight: 800 }}>{t("admin.title")}</Typography><Typography variant="caption" color="text.secondary">{t("admin.console")}</Typography></Box></Stack><LanguageSwitcher /></Stack>
        <Divider />
        <List disablePadding sx={{ py: 1 }}>{navigation.map(item => { const Icon = item.icon; const destination = pathFor(item.id); return <ListItemButton key={item.id} component="a" href={destination} onClick={event => { event.preventDefault(); navigate(destination); }} selected={section === item.id} sx={{ my: 0.25, borderRadius: 2, "&.Mui-selected": { bgcolor: "rgba(224, 0, 43, 0.11)", color: "primary.main", "& .MuiListItemText-primary": { fontWeight: 750 } } }}><ListItemIcon sx={{ minWidth: 37, color: "inherit" }}><Icon size={19} /></ListItemIcon><ListItemText primary={item.label} /></ListItemButton>; })}</List>
        <Divider /><Button component="a" href="/map" onClick={event => { event.preventDefault(); navigate("/map"); }} fullWidth startIcon={<ArrowLeft size={17} />} sx={{ mt: 1.25, justifyContent: "flex-start" }}>{t("billing.backToMap")}</Button>
      </Paper>
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", pr: { md: 0.5 }, pb: 3 }}>{children}</Box>
    </Stack>
  </Box>;
}
