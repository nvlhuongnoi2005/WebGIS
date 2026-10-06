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
import { useTranslation } from "react-i18next";

export function AdminDataPage() {
  const { t } = useTranslation();
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
      .catch(() => setError(t("admin.gis.loadDatasetsError")));
  useEffect(() => {
    reload();
  }, []);
  const choose = (item: Dataset) => {
    setSelected(item);
    gisAdminApi
      .versions(item.id)
      .then(setVersions)
      .catch(() => setError(t("admin.gis.loadVersionsError")));
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
      setError(t("admin.gis.createDatasetError"));
    }
  };
  const upload = async () => {
    if (!selected || !file) return;
    try {
      await gisAdminApi.upload(selected.id, file);
      setFile(null);
      choose(selected);
    } catch {
      setError(t("admin.gis.uploadError"));
    }
  };
  const inspect = async (version: DatasetVersion) => {
    if (!selected) return;
    try {
      await gisAdminApi.inspect(selected.id, version.id);
      choose(selected);
    } catch {
      setError(t("admin.gis.inspectError"));
    }
  };
  const deleteRaw = async (version: DatasetVersion) => {
    if (!selected) return;
    try {
      await gisAdminApi.deleteRawVersion(selected.id, version.id);
      choose(selected);
      reload();
    } catch {
      setError(t("admin.gis.deleteRawError"));
    }
  };
  return (
    <>
      <PageTitle
        title={t("admin.gis.dataTitle")}
        description={t("admin.gis.dataDescription")}
        action={
          <Button variant="contained" onClick={() => setOpen(true)}>
            {t("admin.gis.newDataset")}
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
                <TableCell>{t("admin.name")}</TableCell>
                <TableCell>{t("admin.gis.slug")}</TableCell>
                <TableCell>{t("admin.gis.latestVersion")}</TableCell>
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
          <Typography sx={{ fontWeight: 700 }}>
            {selected?.name ?? t("admin.gis.selectDataset")}
          </Typography>
          {selected && (
            <Stack spacing={1.5} sx={{ mt: 1.5 }}>
              <Button component="label" variant="outlined">
                {file?.name ?? t("admin.gis.chooseRawFile")}
                <input hidden type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Button>
              <Button disabled={!file} onClick={() => void upload()} variant="contained">
                {t("admin.gis.uploadVersion")}
              </Button>
              {versions.map((version) => (
                <Paper variant="outlined" key={version.id} sx={{ p: 1 }}>
                  <Typography variant="body2">
                    v{version.version} · {version.filename}
                  </Typography>
                  <Typography variant="caption">
                    {t("admin.gis.rawStored")} · {version.format} ·{" "}
                    {t("admin.gis.conversionStatus")}: {version.inspectionStatus}
                    {version.error ? `: ${version.error}` : ""}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button
                      size="small"
                      disabled={
                        version.inspectionStatus === "processing" ||
                        version.inspectionStatus === "ready"
                      }
                      onClick={() => void inspect(version)}
                    >
                      {version.inspectionStatus === "failed"
                        ? t("admin.gis.retryConversion")
                        : t("admin.gis.prepareConversion")}
                    </Button>
                    <Button size="small" color="error" onClick={() => void deleteRaw(version)}>
                      {t("admin.gis.deleteRaw")}
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Paper>
      </Stack>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>{t("admin.gis.newDataset")}</DialogTitle>
        <DialogContent>
          <Stack sx={{ pt: 1 }} spacing={1}>
            <TextField
              label={t("admin.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label={t("admin.gis.slug")}
              helperText={t("admin.gis.slugHelp")}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <TextField
              multiline
              minRows={2}
              label={t("admin.gis.description")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("admin.cancel")}</Button>
          <Button disabled={!name || !slug} onClick={() => void create()} variant="contained">
            {t("admin.gis.create")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
