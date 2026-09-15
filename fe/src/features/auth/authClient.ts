let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

function csrfToken(): string | undefined {
  const item = document.cookie.split("; ").find(cookie => cookie.startsWith("csrf_token="));
  return item?.slice("csrf_token=".length);
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const csrf = csrfToken();
  if (csrf && !["GET", "HEAD", "OPTIONS"].includes(init.method ?? "GET")) {
    headers.set("X-CSRF-Token", csrf);
  }
  return fetch(input, { ...init, headers, credentials: "include" });
}
