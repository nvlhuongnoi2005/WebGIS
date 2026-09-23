import { authFetch } from "../auth/authClient";
import type { DrawFeatureCollection } from "../../tools/draw/DrawTool";

export interface GeoJSONShareSummary {
  id: string;
  created_at: string;
  expires_at: string;
}

export async function createGeoJSONShare(geojson: DrawFeatureCollection) {
  const response = await authFetch("/api/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ geojson }),
  });
  if (!response.ok) throw new Error("shareCreateFailed");
  return await response.json() as { id: string; token: string; expires_at: string };
}

export async function listGeoJSONShares(): Promise<GeoJSONShareSummary[]> {
  const response = await authFetch("/api/shares");
  if (!response.ok) throw new Error("shareListFailed");
  const result = await response.json() as { shares: GeoJSONShareSummary[] };
  return result.shares;
}

export async function revokeGeoJSONShare(id: string): Promise<void> {
  const response = await authFetch(`/api/shares/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error("shareRevokeFailed");
}

export async function getSharedGeoJSON(token: string): Promise<DrawFeatureCollection> {
  const response = await fetch(`/api/shares/${encodeURIComponent(token)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("shareUnavailable");
  const result = await response.json() as { geojson: DrawFeatureCollection };
  return result.geojson;
}
