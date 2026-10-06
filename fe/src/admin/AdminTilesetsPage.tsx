import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { PageTitle } from "./AdminShared";
import { gisAdminApi, type Dataset, type DatasetVersion, type Tileset } from "./gisAdminApi";
import { useTranslation } from "react-i18next";

export function AdminTilesetsPage() {
  const { t } = useTranslation();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [tilesets, setTilesets] = useState<Tileset[]>([]);
  const [dataset, setDataset] = useState("");
  const [version, setVersion] = useState("");
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [layer, setLayer] = useState("");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const reload = () =>
    Promise.all([gisAdminApi.datasets(), gisAdminApi.tilesets()])
      .then(([d, t]) => {
        setDatasets(d);
        setTilesets(t);
      })
      .catch(() => setError(t("admin.gis.loadTilesetsError")));
  useEffect(() => {
    reload();
  }, []);
  const chooseDataset = (id: string) => {
    setDataset(id);
    setVersion("");
    setLayer("");
    gisAdminApi
      .versions(id)
      .then(setVersions)
      .catch(() => setError(t("admin.gis.loadVersionsError")));
  };
  const createAndBuild = async () => {
    try {
      const tileset = await gisAdminApi.createTileset({ datasetId: dataset, slug, name });
      await gisAdminApi.buildTileset(tileset.id, {
        datasetVersionId: version,
        layer,
        sourceLayer: layer,
      });
      setSlug("");
      setName("");
      reload();
    } catch {
      setError(t("admin.gis.buildError"));
    }
  };
  return (
    <>
      <PageTitle
        title={t("admin.gis.tilesetsTitle")}
        description={t("admin.gis.tilesetsDescription")}
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
          <TextField
            select
            label={t("admin.gis.dataset")}
            value={dataset}
            onChange={(e) => chooseDataset(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            {datasets.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t("admin.gis.readyVersion")}
            value={version}
            onChange={(e) => {
              setVersion(e.target.value);
              const found = versions.find((v) => v.id === e.target.value);
              setLayer(found?.layers?.[0]?.name ?? "");
            }}
            sx={{ minWidth: 180 }}
          >
            {versions
              .filter((v) => v.inspectionStatus === "ready" || v.status === "ready")
              .map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  v{v.version} · {v.filename}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            label={t("admin.gis.layer")}
            value={layer}
            onChange={(e) => setLayer(e.target.value)}
          />
          <TextField
            label={t("admin.gis.tilesetName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            label={t("admin.gis.slug")}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <Button
            disabled={!dataset || !version || !layer || !name || !slug}
            variant="contained"
            onClick={() => void createAndBuild()}
          >
            {t("admin.gis.build")}
          </Button>
        </Stack>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t("admin.name")}</TableCell>
              <TableCell>{t("admin.gis.dataset")}</TableCell>
              <TableCell>{t("admin.gis.slug")}</TableCell>
              <TableCell>{t("admin.gis.latestVersion")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tilesets.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.datasetId}</TableCell>
                <TableCell>{t.slug}</TableCell>
                <TableCell>v{t.latestVersion}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </>
  );
}
