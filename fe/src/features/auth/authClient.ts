import { publishNotification } from "../notifications/notificationEvents";

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
	accessToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

function csrfToken(): string | undefined {
  const item = document.cookie.split("; ").find(cookie => cookie.startsWith("csrf_token="));
  return item?.slice("csrf_token=".length);
}

function authPath(input: RequestInfo | URL): string {
  if (input instanceof Request) return new URL(input.url).pathname;
  return new URL(input.toString(), window.location.origin).pathname;
}

function expireSession(): void {
  accessToken = null;
  onSessionExpired?.();
}

function notifyQuotaExceeded(response: Response): void {
  if (response.status !== 429) return;
  publishNotification({
    kind: "quota",
    titleKey: "notifications.quotaTitle",
    descriptionKey: "notifications.quotaDescription",
    dedupeKey: "quota-exceeded",
    actionHref: "/billing",
    actionLabelKey: "notifications.viewUsage",
  });
}

async function renewAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const headers = new Headers({ "Content-Type": "application/json" });
    const csrf = csrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
    try {
      const response = await fetch("/auth/refresh", {
        method: "POST", headers, credentials: "include", body: "{}",
      });
      if (!response.ok) {
        expireSession();
        return false;
      }
      const payload = await response.json() as { access_token?: unknown };
      if (typeof payload.access_token !== "string" || !payload.access_token) {
        expireSession();
        return false;
      }
      setAccessToken(payload.access_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const csrf = csrfToken();
  if (csrf && !["GET", "HEAD", "OPTIONS"].includes(init.method ?? "GET")) {
    headers.set("X-CSRF-Token", csrf);
  }
  const response = await fetch(input, { ...init, headers, credentials: "include" });
  // Login and refresh failures are handled by their callers. For protected API
  // calls, renew an expired 15-minute access token once before giving up.
  if (response.status !== 401 || !accessToken || authPath(input).startsWith("/auth/")) {
    notifyQuotaExceeded(response);
    return response;
  }
  if (!await renewAccessToken()) return response;
  const retryHeaders = new Headers(init.headers);
  if (accessToken) retryHeaders.set("Authorization", `Bearer ${accessToken}`);
  if (csrf && !["GET", "HEAD", "OPTIONS"].includes(init.method ?? "GET")) retryHeaders.set("X-CSRF-Token", csrf);
  const retry = await fetch(input, { ...init, headers: retryHeaders, credentials: "include" });
  if (retry.status === 401) expireSession();
  notifyQuotaExceeded(retry);
  return retry;
}
