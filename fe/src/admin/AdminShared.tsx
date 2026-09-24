import type { ReactNode } from "react";
import { Alert, Box, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

// Reusable primitives for the administration screens.

export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      sx={{ mb: 3, justifyContent: "space-between", alignItems: { sm: "center" } }}
    >
      <Box>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 800 }}>
          {title}
        </Typography>
        <Typography color="text.secondary">{description}</Typography>
      </Box>
      {action}
    </Stack>
  );
}
export function LoadingOrError({ loading, error }: { loading: boolean; error: boolean }) {
  const { t } = useTranslation();
  if (error) return <Alert severity="error">{t("admin.loadError")}</Alert>;
  return loading ? (
    <Stack sx={{ alignItems: "center", py: 8 }}>
      <CircularProgress />
    </Stack>
  ) : null;
}
export function MetricCard({
  icon,
  label,
  value,
  tone = "red",
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: "red" | "blue";
}) {
  const colors =
    tone === "red" ? ["#e0002b", "rgba(224,0,43,.09)"] : ["#2563c8", "rgba(37,99,200,.09)"];
  return (
    <Paper
      sx={{
        p: 2.5,
        borderRadius: 3,
        flex: 1,
        bgcolor: colors[1],
        border: `1px solid ${colors[0]}22`,
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", color: colors[0] }}>
        <Box
          sx={{
            display: "grid",
            placeItems: "center",
            width: 42,
            height: 42,
            borderRadius: 2,
            bgcolor: "background.paper",
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {value}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
export function DonutChart({
  title,
  description,
  groups,
}: {
  title: string;
  description: string;
  groups: Array<{ label: string; count: number }>;
}) {
  const { t } = useTranslation();
  const colors = [
    "#e0002b",
    "#2563c8",
    "#008b7f",
    "#8540ba",
    "#d16a00",
    "#c23e8a",
    "#64748b",
    "#0f766e",
  ];
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const slices = groups.map((group, index) => {
    const start = total
      ? (groups.slice(0, index).reduce((sum, item) => sum + item.count, 0) / total) * 100
      : 0;
    return `${colors[index % colors.length]} ${start}% ${total ? start + (group.count / total) * 100 : 0}%`;
  });
  return (
    <Paper
      sx={{
        flex: 1,
        minWidth: 0,
        p: { xs: 2, sm: 3 },
        borderRadius: 3,
        border: "1px solid rgba(224,0,43,.14)",
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 750 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, minHeight: 40 }}>
        {description}
      </Typography>
      {groups.length ? (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={3}
          sx={{ mt: 2.5, alignItems: "center" }}
        >
          <Box
            role="img"
            aria-label={title}
            sx={{
              position: "relative",
              flexShrink: 0,
              width: 188,
              height: 188,
              borderRadius: "50%",
              background: `conic-gradient(${slices.join(", ")})`,
            }}
          >
            <Box
              sx={{
                position: "absolute",
                inset: 40,
                display: "grid",
                placeItems: "center",
                borderRadius: "50%",
                bgcolor: "background.paper",
                textAlign: "center",
              }}
            >
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                  {total}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("admin.accounts")}
                </Typography>
              </Box>
            </Box>
          </Box>
          <Stack spacing={1} sx={{ flex: 1, width: "100%" }}>
            {groups.map((group, index) => (
              <Stack
                key={group.label}
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, alignItems: "center" }}>
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      flexShrink: 0,
                      borderRadius: "50%",
                      bgcolor: colors[index % colors.length],
                    }}
                  />
                  <Typography variant="body2" noWrap>
                    {group.label}
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ fontWeight: 700, flexShrink: 0 }}>
                  {group.count} ({Math.round((group.count / total) * 100)}%)
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
          {t("admin.noData")}
        </Typography>
      )}
    </Paper>
  );
}
