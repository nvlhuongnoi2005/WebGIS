import { authFetch } from "../auth/authClient";

export interface BillingDetails {
  userId: string;
  name: string;
  email: string;
  plan: string;
  periodStart: string | null;
  periodEnd: string | null;
  limitUnits: number;
  usedUnits: number;
}

export interface AdminDashboardMetrics {
  totalAccounts: number;
  onlineUsers: number;
  ageGroups: Array<{ label: string; count: number }>;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await authFetch(path);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function fetchMyBilling() {
  return getJson<BillingDetails>("/api/billing");
}

export function fetchAdminDashboard() {
  return getJson<AdminDashboardMetrics>("/api/admin/dashboard");
}

export async function fetchAdminBilling() {
  const response = await getJson<{ billings: BillingDetails[] }>("/api/admin/billing");
  return response.billings;
}
