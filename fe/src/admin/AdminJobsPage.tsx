import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { PageTitle } from "./AdminShared";
import { gisAdminApi, type GISJob } from "./gisAdminApi";
import { useTranslation } from "react-i18next";
export function AdminJobsPage() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<GISJob[]>([]);
  const [error, setError] = useState("");
  const [log, setLog] = useState<string | null>(null);
  const reload = () =>
    gisAdminApi
      .jobs()
      .then(setJobs)
      .catch(() => setError(t("admin.gis.loadJobsError")));
  useEffect(() => {
    reload();
  }, []);
  const openLog = (id: string) =>
    gisAdminApi
      .jobLog(id)
      .then((x) => setLog(x.log || x.error))
      .catch(() => setError(t("admin.gis.loadLogError")));
  return (
    <>
      <PageTitle
        title={t("admin.gis.jobsTitle")}
        description={t("admin.gis.jobsDescription")}
        action={<Button onClick={reload}>{t("admin.gis.refresh")}</Button>}
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Paper sx={{ p: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t("admin.gis.type")}</TableCell>
              <TableCell>{t("admin.status")}</TableCell>
              <TableCell>{t("admin.gis.attempt")}</TableCell>
              <TableCell>{t("admin.gis.error")}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell>{job.type}</TableCell>
                <TableCell>{job.status}</TableCell>
                <TableCell>
                  {job.attempt}/{job.maxAttempts}
                </TableCell>
                <TableCell>{job.error}</TableCell>
                <TableCell>
                  <Stack direction="row">
                    <Button size="small" onClick={() => void openLog(job.id)}>
                      {t("admin.gis.log")}
                    </Button>
                    {["failed", "canceled"].includes(job.status) && (
                      <Button
                        size="small"
                        onClick={() => void gisAdminApi.retry(job.id).then(reload)}
                      >
                        {t("admin.gis.retry")}
                      </Button>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      <Dialog open={log !== null} onClose={() => setLog(null)} fullWidth maxWidth="md">
        <DialogTitle>{t("admin.gis.jobLog")}</DialogTitle>
        <DialogContent>
          <Typography component="pre" sx={{ whiteSpace: "pre-wrap" }}>
            {log}
          </Typography>
        </DialogContent>
      </Dialog>
    </>
  );
}
