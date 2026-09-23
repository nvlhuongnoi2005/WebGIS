import { authFetch } from "../auth/authClient";
import type { DrawFeatureCollection } from "../../tools/draw/DrawTool";

export interface GeoJSONShareSummary {
  id: string;
  created_at: string;
  expires_at: string;
  token?: string;
  feature_count: number;
  preview_svg: string;
}

export interface GeoJSONShareRecipient {
  id: string;
  name: string;
  email: string;
}

export interface ReceivedGeoJSONShare {
  id: string;
  created_at: string;
  expires_at: string;
  owner_name: string;
  owner_email: string;
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

export async function getOrCreateGeoJSONShareLink(id: string): Promise<string> {
  const response = await authFetch(`/api/shares/${encodeURIComponent(id)}/link`, { method: "POST" });
  if (!response.ok) throw new Error("shareLinkLoadFailed");
  const result = await response.json() as { token: string };
  return result.token;
}

export async function revokeGeoJSONShare(id: string): Promise<void> {
  const response = await authFetch(`/api/shares/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error("shareRevokeFailed");
}

export async function searchGeoJSONShareRecipients(query: string): Promise<GeoJSONShareRecipient[]> {
  const response = await authFetch(`/api/shares/recipients?q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error("shareRecipientSearchFailed");
  const result = await response.json() as { users: GeoJSONShareRecipient[] };
  return result.users;
}

export async function sendGeoJSONShare(id: string, recipientIds: string[]): Promise<void> {
  const response = await authFetch(`/api/shares/${encodeURIComponent(id)}/recipients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_ids: recipientIds }),
  });
  if (!response.ok) throw new Error("shareSendFailed");
}

export async function listReceivedGeoJSONShares(): Promise<ReceivedGeoJSONShare[]> {
  const response = await authFetch("/api/shares/received");
  if (!response.ok) throw new Error("receivedSharesFailed");
  const result = await response.json() as { shares: ReceivedGeoJSONShare[] };
  return result.shares;
}

export async function getReceivedGeoJSON(id: string): Promise<DrawFeatureCollection> {
  const response = await authFetch(`/api/shares/received/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("shareUnavailable");
  const result = await response.json() as { geojson: DrawFeatureCollection };
  return result.geojson;
}

export async function getSharedGeoJSON(token: string): Promise<DrawFeatureCollection> {
  const response = await fetch(`/api/shares/${encodeURIComponent(token)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("shareUnavailable");
  const result = await response.json() as { geojson: DrawFeatureCollection };
  return result.geojson;
}
