import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, BookOpen, KeyRound, ShieldCheck } from "lucide-react";
import { Alert, Box, Button, Chip, CircularProgress, Container, Divider, Paper, Stack, Typography } from "@mui/material";

type Operation = { summary?: string; tags?: string[]; security?: unknown[]; parameters?: Array<{ name: string; in: string; required?: boolean }> };
type OpenAPISpec = { info?: { version?: string; description?: string }; paths?: Record<string, Record<string, Operation>> };
type Endpoint = Operation & { path: string; method: string };

const methodColor: Record<string, "success" | "info" | "warning" | "error"> = { get: "info", post: "success", patch: "warning", delete: "error" };
const methodTint: Record<string, string> = { get: "#1675bc", post: "#087f5b", patch: "#b56b00", delete: "#c92a2a" };
const anchorFor = (tag: string) => `swagger-${tag.toLocaleLowerCase("vi").replace(/[^a-z0-9]+/g, "-")}`;
const vietnameseTag: Record<string, string> = { Authentication: "Xác thực", Administration: "Quản trị", Billing: "Billing quota", Map: "Bản đồ", Khác: "Khác" };
const swaggerFont = '"Segoe UI", Roboto, "Noto Sans", Arial, sans-serif';
const tagLabel = (tag: string) => vietnameseTag[tag] ?? tag;

export default function SwaggerPage() {
  const [spec, setSpec] = useState<OpenAPISpec | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/openapi.json")
      .then(response => { if (!response.ok) throw new Error("OpenAPI unavailable"); return response.json() as Promise<OpenAPISpec>; })
      .then(value => active && setSpec(value))
      .catch(() => active && setError(true));
    return () => { active = false; };
  }, []);

  const endpoints = useMemo<Endpoint[]>(() => Object.entries(spec?.paths ?? {}).flatMap(([path, methods]) => Object.entries(methods)
    .filter(([method]) => ["get", "post", "patch", "delete"].includes(method))
    .map(([method, operation]) => ({ ...operation, path, method }))), [spec]);
  const grouped = useMemo(() => endpoints.reduce<Record<string, Endpoint[]>>((result, endpoint) => {
    const tag = endpoint.tags?.[0] ?? "Khác";
    (result[tag] ??= []).push(endpoint);
    return result;
  }, {}), [endpoints]);

  return <Box component="main" id="main-content" sx={{ height: "100dvh", overflow: "hidden", bgcolor: "#f6f7fb", color: "#17212b", fontFamily: swaggerFont, "& .MuiTypography-root, & .MuiButton-root, & .MuiChip-label": { fontFamily: swaggerFont }, "& code": { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" } }}>
    <Box sx={{ height: "100%", overflowY: "auto", overscrollBehavior: "contain", scrollBehavior: "smooth", "&::-webkit-scrollbar": { width: 10 }, "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(224,0,43,.42)", border: "3px solid #f6f7fb", borderRadius: 20 } }}>
      <Box sx={{ position: "sticky", top: 0, zIndex: 4, borderBottom: "1px solid rgba(23,33,43,.08)", bgcolor: "rgba(246,247,251,.88)", backdropFilter: "blur(14px)" }}>
        <Container maxWidth="xl"><Stack direction="row" sx={{ minHeight: 64, alignItems: "center", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}><Box sx={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 2, bgcolor: "primary.main", color: "#fff" }}><BookOpen size={19} /></Box><Typography sx={{ fontWeight: 850, letterSpacing: ".01em" }}>WEBGIS API REFERENCE</Typography></Stack>
          <Button component="a" href="/api/openapi.json" target="_blank" rel="noreferrer" size="small" startIcon={<ArrowDownToLine size={16} />}>OpenAPI JSON</Button>
        </Stack></Container>
      </Box>

      <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 }, pb: 7 }}><Stack spacing={3}>
        <Paper elevation={0} sx={{ overflow: "hidden", borderRadius: 4, color: "#fff", background: "linear-gradient(121deg, #111d2a 0%, #273d55 54%, #d50032 160%)", boxShadow: "0 20px 45px rgba(20,42,50,.18)" }}><Box sx={{ p: { xs: 2.5, sm: 4, md: 5 }, background: "radial-gradient(circle at 91% 15%, rgba(255,255,255,.18), transparent 25%)" }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ justifyContent: "space-between", alignItems: { md: "end" } }}><Box><Chip label={`OPENAPI ${spec?.info?.version ?? "…"}`} size="small" sx={{ mb: 1.5, bgcolor: "rgba(255,255,255,.14)", color: "#fff", fontWeight: 800 }} /><Typography component="h1" variant="h3" sx={{ fontWeight: 900, letterSpacing: "-.035em" }}>Swagger / OpenAPI</Typography><Typography sx={{ maxWidth: 710, mt: 1, color: "rgba(255,255,255,.8)" }}>{spec?.info?.description ?? "Đang tải tài liệu API từ controller…"}</Typography></Box><Stack direction="row" spacing={1.5}><Stat label="Endpoints" value={endpoints.length} /><Stat label="Nhóm API" value={Object.keys(grouped).length} /></Stack></Stack>
        </Box></Paper>

        {error && <Alert severity="error">Không tải được OpenAPI schema. Hãy kiểm tra controller và endpoint <code>/api/openapi.json</code>.</Alert>}
        {!spec && !error && <Stack sx={{ alignItems: "center", py: 9 }}><CircularProgress /><Typography color="text.secondary" sx={{ mt: 2 }}>Đang tải API reference…</Typography></Stack>}

        {spec && <Stack direction={{ xs: "column", lg: "row" }} spacing={3} sx={{ alignItems: "flex-start" }}>
          <Stack component="aside" spacing={2} sx={{ width: { lg: 248 }, flexShrink: 0, position: { lg: "sticky" }, top: 84 }}>
            <Paper elevation={0} sx={{ p: 1.25, borderRadius: 3, border: "1px solid rgba(23,33,43,.09)" }}><Typography variant="overline" sx={{ px: 1, color: "text.secondary", fontWeight: 800, letterSpacing: ".09em" }}>MỤC LỤC</Typography><Stack spacing={0.5} sx={{ mt: 0.5 }}>{Object.entries(grouped).map(([tag, operations]) => <Button key={tag} component="a" href={`#${anchorFor(tag)}`} color="inherit" sx={{ justifyContent: "space-between", borderRadius: 2, px: 1.2, py: 0.9, textTransform: "none", fontWeight: 700 }}><span>{tagLabel(tag)}</span><Chip label={operations.length} size="small" sx={{ height: 21, fontWeight: 750 }} /></Button>)}</Stack></Paper>
            <Paper elevation={0} sx={{ p: 2, borderRadius: 3, bgcolor: "#fff3f5", border: "1px solid rgba(224,0,43,.18)" }}><Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}><KeyRound size={18} color="#d50032" /><Box><Typography variant="body2" sx={{ fontWeight: 850 }}>Xác thực Bearer</Typography><Typography variant="caption" color="text.secondary">Gửi access token trong header <code>Authorization: Bearer &lt;token&gt;</code>.</Typography></Box></Stack></Paper>
          </Stack>

          <Stack spacing={3} sx={{ minWidth: 0, flex: 1 }}>{Object.entries(grouped).map(([tag, operations]) => <Box component="section" id={anchorFor(tag)} key={tag} sx={{ scrollMarginTop: 84 }}><Stack direction="row" spacing={1.2} sx={{ alignItems: "center", mb: 1.5 }}><Box sx={{ width: 7, height: 30, borderRadius: 10, bgcolor: "primary.main" }} /><Box><Typography variant="h5" sx={{ fontWeight: 900 }}>{tagLabel(tag)}</Typography><Typography variant="caption" color="text.secondary">{operations.length} endpoint{operations.length === 1 ? "" : "s"}</Typography></Box></Stack><Stack spacing={1.2}>{operations.map(endpoint => <EndpointCard endpoint={endpoint} key={`${endpoint.method}-${endpoint.path}`} />)}</Stack></Box>)}</Stack>
        </Stack>}
      </Stack></Container>
    </Box>
  </Box>;
}

function Stat({ label, value }: { label: string; value: number }) { return <Box sx={{ px: 2, py: 1.25, minWidth: 118, borderRadius: 2.5, bgcolor: "rgba(255,255,255,.1)" }}><Typography variant="caption" sx={{ color: "rgba(255,255,255,.75)" }}>{label}</Typography><Typography variant="h5" sx={{ fontWeight: 850 }}>{value}</Typography></Box>; }

function EndpointCard({ endpoint }: { endpoint: Endpoint }) { return <Paper elevation={0} sx={{ overflow: "hidden", borderRadius: 3, border: "1px solid rgba(23,33,43,.1)", borderLeft: `5px solid ${methodTint[endpoint.method]}` }}><Box sx={{ p: { xs: 1.5, sm: 2.1 }, bgcolor: "#fff" }}><Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}><Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}><Chip label={endpoint.method.toUpperCase()} color={methodColor[endpoint.method]} size="small" sx={{ fontWeight: 900, minWidth: 70, letterSpacing: ".04em" }} /><Typography component="code" sx={{ fontWeight: 800, fontSize: { xs: ".82rem", sm: ".94rem" }, overflowWrap: "anywhere" }}>{endpoint.path}</Typography></Stack><Chip icon={endpoint.security?.length ? <ShieldCheck size={15} /> : undefined} label={endpoint.security?.length ? "Bearer JWT" : "Công khai"} size="small" variant="outlined" color={endpoint.security?.length ? "secondary" : "default"} /></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 1.25, pl: { sm: 10 } }}>{endpoint.summary}</Typography>{endpoint.parameters?.length ? <><Divider sx={{ my: 1.5 }} /><Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", pl: { sm: 10 } }}>{endpoint.parameters.map(parameter => <Chip key={`${endpoint.path}-${parameter.name}`} label={`${parameter.name} · ${parameter.in}${parameter.required ? " · bắt buộc" : ""}`} size="small" variant="outlined" />)}</Stack></> : null}</Box></Paper>; }
