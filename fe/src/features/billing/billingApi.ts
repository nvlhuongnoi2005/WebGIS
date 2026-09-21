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
  dailyRequests: Array<{ date: string; requests: number }>;
}

export interface AdminDashboardMetrics {
  totalAccounts: number;
  onlineUsers: number;
  ageGroups: Array<{ label: string; count: number }>;
}
export interface AdminUser {
  id: string; name: string; email: string; role: "user" | "admin"; status: "ACTIVE" | "DISABLED" | "LOCKED"; plan: string; limitUnits: number; usedUnits: number; online: boolean;
}
export interface AuditLog { id: number; actor: string; target: string; action: string; createdAt: string; }

async function getJson<T>(path: string): Promise<T> {
  const response = await authFetch(path);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function fetchMyBilling(range: 1 | 7 | 30) {
  return getJson<BillingDetails>(`/api/billing?range=${range}`);
}

export function fetchAdminDashboard() {
  return getJson<AdminDashboardMetrics>("/api/admin/dashboard");
}

export async function fetchAdminBilling() {
  const response = await getJson<{ billings: BillingDetails[] }>("/api/admin/billing");
  return response.billings;
}
export async function fetchAdminUsers() { return (await getJson<{ users: AdminUser[] }>("/api/admin/users")).users; }
export async function updateAdminUser(id: string, update: Partial<Pick<AdminUser, "role" | "status" | "plan" | "limitUnits">>) {
  const response = await authFetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
}
export async function fetchAdminAudit() { return (await getJson<{ logs: AuditLog[] }>("/api/admin/audit")).logs; }
