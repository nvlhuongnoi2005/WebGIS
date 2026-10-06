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

const defaultStyle = `{
  "version": 8,
  "sources": {
    "data": { "type": "vector", "tilesetVersionId": "REPLACE_WITH_TILESET_VERSION_UUID" }
  },
  "layers": []
}`;

export function AdminMapsPage() {
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
      .catch(() => setError("Unable to load map publications."));
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
      setError("Unable to create map publication.");
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
      setError(
        "Unable to create style. Use valid MapLibre JSON and managed tileset version UUIDs."
      );
    }
  };
  const openAcl = async (map: Publication) => {
    try {
      setAclMap(map);
      setAcl(await gisAdminApi.acl(map.id));
    } catch {
      setError("Unable to load ACL.");
    }
  };
  const saveAcl = async () => {
    if (!aclMap) return;
    try {
      await gisAdminApi.replaceAcl(aclMap.id, acl);
      setAclMap(null);
    } catch {
      setError("Unable to save ACL.");
    }
  };
  return (
    <>
      <PageTitle
        title="Maps and access"
        description="Publish a versioned style, then grant map:read to users, roles, or groups."
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Stack spacing={2}>
        <Paper sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 700 }}>Create style version</Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
              <TextField
                label="Style name"
                value={styleName}
                onChange={(e) => setStyleName(e.target.value)}
              />
              <TextField
                label="Style slug"
                value={styleSlug}
                onChange={(e) => setStyleSlug(e.target.value)}
              />
              <TextField
                fullWidth
                label="Tileset version UUIDs (comma separated)"
                value={tilesetIDs}
                onChange={(e) => setTilesetIDs(e.target.value)}
              />
              <Button
                disabled={!styleName || !styleSlug || !tilesetIDs}
                onClick={() => void createStyle()}
                variant="outlined"
              >
                Create style
              </Button>
            </Stack>
            <TextField
              multiline
              minRows={7}
              label="MapLibre style JSON"
              value={styleJSON}
              onChange={(e) => setStyleJSON(e.target.value)}
            />
            <Typography variant="caption">
              Use `tilesetVersionId` for every source. Direct tile URLs are rejected.
            </Typography>
          </Stack>
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField label="Map name" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Map slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
            <TextField
              fullWidth
              label="Style version UUID"
              value={styleVersionId}
              onChange={(e) => setStyleVersionId(e.target.value)}
            />
            <Button
              disabled={!name || !slug || !styleVersionId}
              variant="contained"
              onClick={() => void createMap()}
            >
              Create map
            </Button>
          </Stack>
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Style version</TableCell>
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
                        {map.status === "published" ? "Unpublish" : "Publish"}
                      </Button>
                      <Button size="small" onClick={() => void openAcl(map)}>
                        ACL
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
        <DialogTitle>Access: {aclMap?.name}</DialogTitle>
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
                  Remove
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
                label="UUID or role"
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
                Grant
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAclMap(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveAcl()}>
            Save ACL
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
