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
import { gisAdminApi, type Dataset, type DatasetVersion } from "./gisAdminApi";

export function AdminDataPage() {
  const [items, setItems] = useState<Dataset[]>([]);
  const [selected, setSelected] = useState<Dataset | null>(null);
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const reload = () =>
    gisAdminApi
      .datasets()
      .then(setItems)
      .catch(() => setError("Unable to load GIS datasets."));
  useEffect(() => {
    reload();
  }, []);
  const choose = (item: Dataset) => {
    setSelected(item);
    gisAdminApi
      .versions(item.id)
      .then(setVersions)
      .catch(() => setError("Unable to load versions."));
  };
  const create = async () => {
    try {
      await gisAdminApi.createDataset({ name, slug, description });
      setOpen(false);
      setName("");
      setSlug("");
      setDescription("");
      reload();
    } catch {
      setError("Unable to create dataset.");
    }
  };
  const upload = async () => {
    if (!selected || !file) return;
    try {
      await gisAdminApi.upload(selected.id, file);
      setFile(null);
      choose(selected);
    } catch {
      setError("Upload failed. Only GeoJSON, GeoPackage, and Shapefile ZIP are supported.");
    }
  };
  return (
    <>
      <PageTitle
        title="GIS data"
        description="Upload raw vector data and follow each immutable dataset version."
        action={
          <Button variant="contained" onClick={() => setOpen(true)}>
            New dataset
          </Button>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Slug</TableCell>
                <TableCell>Latest version</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  hover
                  key={item.id}
                  onClick={() => choose(item)}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.slug}</TableCell>
                  <TableCell>{item.latestVersion}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
        <Paper sx={{ p: 2, flex: 1 }}>
        <Typography sx={{ fontWeight: 700 }}>{selected?.name ?? "Select a dataset"}</Typography>
          {selected && (
            <Stack spacing={1.5} sx={{ mt: 1.5 }}>
              <Button component="label" variant="outlined">
                {file?.name ?? "Choose raw file"}
                <input
                  hidden
                  type="file"
                  accept=".geojson,.json,.gpkg,.zip"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </Button>
              <Button disabled={!file} onClick={() => void upload()} variant="contained">
                Upload version
              </Button>
              {versions.map((version) => (
                <Paper variant="outlined" key={version.id} sx={{ p: 1 }}>
                  <Typography variant="body2">
                    v{version.version} · {version.filename}
                  </Typography>
                  <Typography variant="caption">
                    {version.status}
                    {version.error ? `: ${version.error}` : ""}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          )}
        </Paper>
      </Stack>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>New dataset</DialogTitle>
        <DialogContent>
          <Stack sx={{ pt: 1 }} spacing={1}>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField
              label="Slug"
              helperText="lowercase letters, numbers, hyphens"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <TextField
              multiline
              minRows={2}
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!name || !slug} onClick={() => void create()} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
