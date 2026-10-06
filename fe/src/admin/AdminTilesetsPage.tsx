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

export function AdminTilesetsPage() {
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
      .catch(() => setError("Unable to load tilesets."));
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
      .catch(() => setError("Unable to load dataset versions."));
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
      setError("Unable to queue the GDAL build.");
    }
  };
  return (
    <>
      <PageTitle
        title="Tilesets"
        description="Build versioned vector MBTiles from a ready dataset version."
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
            label="Dataset"
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
            label="Ready version"
            value={version}
            onChange={(e) => {
              setVersion(e.target.value);
              const found = versions.find((v) => v.id === e.target.value);
              setLayer(found?.layers?.[0]?.name ?? "");
            }}
            sx={{ minWidth: 180 }}
          >
            {versions
              .filter((v) => v.status === "ready")
              .map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  v{v.version} · {v.filename}
                </MenuItem>
              ))}
          </TextField>
          <TextField label="Layer" value={layer} onChange={(e) => setLayer(e.target.value)} />
          <TextField label="Tileset name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <Button
            disabled={!dataset || !version || !layer || !name || !slug}
            variant="contained"
            onClick={() => void createAndBuild()}
          >
            Build
          </Button>
        </Stack>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Dataset</TableCell>
              <TableCell>Slug</TableCell>
              <TableCell>Latest</TableCell>
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
