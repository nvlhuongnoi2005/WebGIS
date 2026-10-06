import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { PageTitle } from "./AdminShared";
import { gisAdminApi, type ACLEntry, type Publication } from "./gisAdminApi";
import { useTranslation } from "react-i18next";

const defaultStyle = `{
  "version": 8,
  "sources": {
    "data": { "type": "vector", "tilesetVersionId": "REPLACE_WITH_TILESET_VERSION_UUID" }
  },
  "layers": []
}`;

export function AdminMapsPage() {
  const { t } = useTranslation();
  const [maps, setMaps] = useState<Publication[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [styleVersionId, setStyleVersionId] = useState("");
  const [styleName, setStyleName] = useState("");
  const [styleSlug, setStyleSlug] = useState("");
  const [styleJSON, setStyleJSON] = useState(defaultStyle);
  const [tilesetIDs, setTilesetIDs] = useState("");
  const [aclMap, setAclMap] = useState<Publication | null>(null);
  const [acl, setAcl] = useState<ACLEntry[]>([]);
  const [subjectType, setSubjectType] = useState<ACLEntry["subjectType"]>("user");
  const [subjectId, setSubjectId] = useState("");
  const reload = () =>
    gisAdminApi
      .maps()
      .then(setMaps)
      .catch(() => setError(t("admin.gis.loadMapsError")));
  useEffect(() => {
    reload();
  }, []);
  const createMap = async () => {
    try {
      await gisAdminApi.createMap({
        name,
        slug,
        description: "",
        styleVersionId: styleVersionId || undefined,
      });
      setName("");
      setSlug("");
      reload();
    } catch {
      setError(t("admin.gis.createMapError"));
    }
  };
  const createStyle = async () => {
    try {
      const style = await gisAdminApi.createStyle({ name: styleName, slug: styleSlug });
      const ids = tilesetIDs
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      const result = await gisAdminApi.createStyleVersion(style.id, {
        styleJson: JSON.parse(styleJSON),
        tilesetVersionIds: ids,
      });
      setStyleVersionId(result.id);
      setStyleName("");
      setStyleSlug("");
    } catch {
      setError(t("admin.gis.createStyleError"));
    }
  };
  const openAcl = async (map: Publication) => {
    try {
      setAclMap(map);
      setAcl(await gisAdminApi.acl(map.id));
    } catch {
      setError(t("admin.gis.loadAclError"));
    }
  };
  const saveAcl = async () => {
    if (!aclMap) return;
    try {
      await gisAdminApi.replaceAcl(aclMap.id, acl);
      setAclMap(null);
    } catch {
      setError(t("admin.gis.saveAclError"));
    }
  };
  return (
    <>
      <PageTitle title={t("admin.gis.mapsTitle")} description={t("admin.gis.mapsDescription")} />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Stack spacing={2}>
        <Paper sx={{ p: 2 }}>
          <Typography sx={{ fontWeight: 700 }}>{t("admin.gis.createStyleVersion")}</Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
              <TextField
                label={t("admin.gis.styleName")}
                value={styleName}
                onChange={(e) => setStyleName(e.target.value)}
              />
              <TextField
                label={t("admin.gis.styleSlug")}
                value={styleSlug}
                onChange={(e) => setStyleSlug(e.target.value)}
              />
              <TextField
                fullWidth
                label={t("admin.gis.tilesetVersionIds")}
                value={tilesetIDs}
                onChange={(e) => setTilesetIDs(e.target.value)}
              />
              <Button
                disabled={!styleName || !styleSlug || !tilesetIDs}
                onClick={() => void createStyle()}
                variant="outlined"
              >
                {t("admin.gis.createStyle")}
              </Button>
            </Stack>
            <TextField
              multiline
              minRows={7}
              label={t("admin.gis.styleJson")}
              value={styleJSON}
              onChange={(e) => setStyleJSON(e.target.value)}
            />
            <Typography variant="caption">{t("admin.gis.styleHelp")}</Typography>
          </Stack>
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              label={t("admin.gis.mapName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label={t("admin.gis.mapSlug")}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <TextField
              fullWidth
              label={t("admin.gis.styleVersionId")}
              value={styleVersionId}
              onChange={(e) => setStyleVersionId(e.target.value)}
            />
            <Button
              disabled={!name || !slug || !styleVersionId}
              variant="contained"
              onClick={() => void createMap()}
            >
              {t("admin.gis.createMap")}
            </Button>
          </Stack>
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("admin.name")}</TableCell>
                <TableCell>{t("admin.status")}</TableCell>
                <TableCell>{t("admin.gis.styleVersion")}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {maps.map((map) => (
                <TableRow key={map.id}>
                  <TableCell>{map.name}</TableCell>
                  <TableCell>{map.status}</TableCell>
                  <TableCell>{map.styleVersionId}</TableCell>
                  <TableCell>
                    <Stack direction="row">
                      <Button
                        size="small"
                        onClick={() =>
                          void gisAdminApi.publish(map.id, map.status !== "published").then(reload)
                        }
                      >
                        {map.status === "published"
                          ? t("admin.gis.unpublish")
                          : t("admin.gis.publish")}
                      </Button>
                      <Button size="small" onClick={() => void openAcl(map)}>
                        {t("admin.gis.acl")}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Stack>
      <Dialog open={!!aclMap} onClose={() => setAclMap(null)} fullWidth>
        <DialogTitle>
          {t("admin.gis.access")}: {aclMap?.name}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 1 }}>
            {acl.map((entry, index) => (
              <Stack
                key={`${entry.subjectType}-${entry.subjectId}-${index}`}
                direction="row"
                spacing={1}
              >
                <TextField value={entry.subjectType} size="small" disabled />
                <TextField value={entry.subjectId} size="small" fullWidth disabled />
                <Button onClick={() => setAcl((current) => current.filter((_, i) => i !== index))}>
                  {t("admin.gis.remove")}
                </Button>
              </Stack>
            ))}
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                value={subjectType}
                onChange={(e) => setSubjectType(e.target.value as ACLEntry["subjectType"])}
              >
                {["user", "role", "group"].map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </TextField>
              <TextField
                size="small"
                label={t("admin.gis.uuidOrRole")}
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                fullWidth
              />
              <Button
                disabled={!subjectId}
                onClick={() => {
                  setAcl((current) => [...current, { subjectType, subjectId, action: "map:read" }]);
                  setSubjectId("");
                }}
              >
                {t("admin.gis.grant")}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAclMap(null)}>{t("admin.cancel")}</Button>
          <Button variant="contained" onClick={() => void saveAcl()}>
            {t("admin.gis.saveAcl")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
