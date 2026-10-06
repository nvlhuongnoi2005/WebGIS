import { authFetch } from "../features/auth/authClient";

export type Dataset = {
  id: string;
  slug: string;
  name: string;
  description: string;
  latestVersion: number;
};
export type DatasetVersion = {
  id: string;
  version: number;
  filename: string;
  size: number;
  format: string;
  status: string;
  inspectionStatus: "not_requested" | "processing" | "ready" | "failed";
  layers: Array<{ name: string }>;
  error: string;
};
export type Tileset = {
  id: string;
  datasetId: string;
  slug: string;
  name: string;
  latestVersion: number;
};
export type TilesetVersion = {
  id: string;
  version: number;
  datasetVersionId: string;
  layer: string;
  sourceLayer: string;
  status: string;
  error: string;
};
export type GISStyle = { id: string; slug: string; name: string; latestVersion: number };
export type Publication = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: string;
  styleVersionId: string;
};
export type GISJob = {
  id: string;
  type: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  error: string;
  createdAt: string;
};
export type ACLEntry = {
  id?: string;
  subjectType: "user" | "role" | "group";
  subjectId: string;
  action: "map:read";
};

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(path, init);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}
async function empty(path: string, init: RequestInit): Promise<void> {
  const response = await authFetch(path, init);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
}
const body = (value: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});

export const gisAdminApi = {
  datasets: () => json<{ datasets: Dataset[] }>("/api/admin/datasets").then((x) => x.datasets),
  createDataset: (value: { slug: string; name: string; description: string }) =>
    json<Dataset>("/api/admin/datasets", body(value)),
  versions: (id: string) =>
    json<{ versions: DatasetVersion[] }>(`/api/admin/datasets/${id}/versions`).then(
      (x) => x.versions
    ),
  upload: async (id: string, file: File) => {
    const form = new FormData();
    form.set("file", file);
    return json<{ id: string; version: number }>(`/api/admin/datasets/${id}/versions`, {
      method: "POST",
      body: form,
    });
  },
  inspect: (datasetId: string, versionId: string) =>
    json<{ jobId: string }>(`/api/admin/datasets/${datasetId}/versions/${versionId}/inspect`, {
      method: "POST",
    }),
  deleteRawVersion: (datasetId: string, versionId: string) =>
    empty(`/api/admin/datasets/${datasetId}/versions/${versionId}`, { method: "DELETE" }),
  tilesets: () => json<{ tilesets: Tileset[] }>("/api/admin/tilesets").then((x) => x.tilesets),
  createTileset: (value: { datasetId: string; slug: string; name: string }) =>
    json<Tileset>("/api/admin/tilesets", body(value)),
  tilesetVersions: (id: string) =>
    json<{ versions: TilesetVersion[] }>(`/api/admin/tilesets/${id}/versions`).then(
      (x) => x.versions
    ),
  buildTileset: (
    id: string,
    value: { datasetVersionId: string; layer: string; sourceLayer: string }
  ) => json<{ jobId: string }>(`/api/admin/tilesets/${id}/build`, body(value)),
  styles: () => json<{ styles: GISStyle[] }>("/api/admin/styles").then((x) => x.styles),
  createStyle: (value: { slug: string; name: string }) =>
    json<GISStyle>("/api/admin/styles", body(value)),
  createStyleVersion: (id: string, value: { styleJson: unknown; tilesetVersionIds: string[] }) =>
    json<{ id: string }>(`/api/admin/styles/${id}/versions`, body(value)),
  maps: () => json<{ maps: Publication[] }>("/api/admin/maps").then((x) => x.maps),
  createMap: (value: {
    slug: string;
    name: string;
    description: string;
    styleVersionId?: string;
  }) => json<Publication>("/api/admin/maps", body(value)),
  publish: (id: string, publish: boolean) =>
    empty(`/api/admin/maps/${id}/${publish ? "publish" : "unpublish"}`, { method: "POST" }),
  acl: (id: string) =>
    json<{ entries: ACLEntry[] }>(`/api/admin/maps/${id}/acl`).then((x) => x.entries),
  replaceAcl: (id: string, entries: ACLEntry[]) =>
    empty(`/api/admin/maps/${id}/acl`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    }),
  jobs: () => json<{ jobs: GISJob[] }>("/api/admin/jobs").then((x) => x.jobs),
  jobLog: (id: string) => json<{ log: string; error: string }>(`/api/admin/jobs/${id}/logs`),
  retry: (id: string) => empty(`/api/admin/jobs/${id}/retry`, { method: "POST" }),
};
