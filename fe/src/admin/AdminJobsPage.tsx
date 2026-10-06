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
export function AdminJobsPage() {
  const [jobs, setJobs] = useState<GISJob[]>([]);
  const [error, setError] = useState("");
  const [log, setLog] = useState<string | null>(null);
  const reload = () =>
    gisAdminApi
      .jobs()
      .then(setJobs)
      .catch(() => setError("Unable to load processing jobs."));
  useEffect(() => {
    reload();
  }, []);
  const openLog = (id: string) =>
    gisAdminApi
      .jobLog(id)
      .then((x) => setLog(x.log || x.error))
      .catch(() => setError("Unable to load job log."));
  return (
    <>
      <PageTitle
        title="GIS jobs"
        description="GDAL processing jobs are claimed by workers with a short database lease."
        action={<Button onClick={reload}>Refresh</Button>}
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
              <TableCell>Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Attempt</TableCell>
              <TableCell>Error</TableCell>
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
                      Log
                    </Button>
                    {["failed", "canceled"].includes(job.status) && (
                      <Button
                        size="small"
                        onClick={() => void gisAdminApi.retry(job.id).then(reload)}
                      >
                        Retry
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
        <DialogTitle>Job log</DialogTitle>
        <DialogContent>
          <Typography component="pre" sx={{ whiteSpace: "pre-wrap" }}>
            {log}
          </Typography>
        </DialogContent>
      </Dialog>
    </>
  );
}
