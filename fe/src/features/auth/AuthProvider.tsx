import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { authFetch, setAccessToken, setSessionExpiredHandler } from "./authClient";
import { AuthContext, type AuthContextValue, type AuthResult, type AuthUser, type RegisterDetails } from "./AuthStore";

type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  idle_timeout_seconds: number;
  user: AuthUser;
};

const DEFAULT_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

async function parseResponse(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const idleTimeoutMs = useRef(DEFAULT_IDLE_TIMEOUT_MS);
  const lastActivityAt = useRef(Date.now());
  const lastHeartbeatAt = useRef(0);

  const expireSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  const acceptTokenResponse = useCallback((payload: TokenResponse) => {
    setAccessToken(payload.access_token);
    setUser(payload.user);
    idleTimeoutMs.current = Math.max(60_000, (payload.idle_timeout_seconds || DEFAULT_IDLE_TIMEOUT_MS / 1000) * 1000);
    lastActivityAt.current = Date.now();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    try {
      const response = await authFetch("/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
      });
      if (response.status >= 500) return { ok: false, code: "serviceUnavailable" };
      if (!response.ok) return { ok: false, code: "invalidCredentials" };
      acceptTokenResponse(await parseResponse(response) as TokenResponse);
      return { ok: true };
    } catch { return { ok: false, code: "serviceUnavailable" }; }
  }, [acceptTokenResponse]);

  const register = useCallback(async (details: RegisterDetails): Promise<AuthResult> => {
    try {
      const response = await authFetch("/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details),
      });
      if (response.status === 409) return { ok: false, code: "emailInUse" };
      if (response.status >= 500) return { ok: false, code: "serviceUnavailable" };
      if (!response.ok) return { ok: false, code: "registrationFailed" };
      // Preserve seamless registration without ever persisting credentials in the browser.
      return login(details.email, details.password);
    } catch { return { ok: false, code: "serviceUnavailable" }; }
  }, [login]);

  const logout = useCallback(async () => {
    try { await authFetch("/auth/logout", { method: "POST" }); } catch { /* clear local state regardless */ }
    expireSession();
  }, [expireSession]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const response = await authFetch("/auth/refresh", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      if (!response.ok) {
        expireSession();
        return false;
      }
      acceptTokenResponse(await parseResponse(response) as TokenResponse);
      return true;
    } catch {
      expireSession();
      return false;
    }
  }, [acceptTokenResponse, expireSession]);

  useEffect(() => {
    setSessionExpiredHandler(expireSession);
    return () => setSessionExpiredHandler(null);
  }, [expireSession]);

  useEffect(() => {
    if (!user) return;
    const recordActivity = () => {
      const now = Date.now();
      if (now - lastActivityAt.current >= idleTimeoutMs.current) {
        expireSession();
        return;
      }
      lastActivityAt.current = now;
      if (now - lastHeartbeatAt.current >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatAt.current = now;
        void refreshSession();
      }
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach(event => window.addEventListener(event, recordActivity, { passive: true }));
    const watchdog = window.setInterval(() => {
      if (Date.now() - lastActivityAt.current >= idleTimeoutMs.current) expireSession();
    }, 60_000);
    return () => {
      events.forEach(event => window.removeEventListener(event, recordActivity));
      window.clearInterval(watchdog);
    };
  }, [expireSession, refreshSession, user]);

  const updateProfile = useCallback(async (body: Record<string, string>): Promise<AuthResult> => {
    try {
      const response = await authFetch("/auth/me", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (response.status === 409) return { ok: false, code: "emailInUse" };
      if (!response.ok) return { ok: false, code: "storageFailed" };
      const payload = await parseResponse(response) as { user: AuthUser };
      setUser(payload.user);
      return { ok: true };
    } catch { return { ok: false, code: "storageFailed" }; }
  }, []);

  const updateContactDetails = useCallback((email: string, phone: string) => updateProfile({ email, phone }), [updateProfile]);
  const updateAvatar = useCallback((avatarUrl: string) => updateProfile({ avatarUrl }), [updateProfile]);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      try {
        await refreshSession();
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void restoreSession();
    return () => { active = false; };
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(() => ({
    user, isLoading, login, register, logout, updateContactDetails, updateAvatar,
  }), [isLoading, login, logout, register, updateAvatar, updateContactDetails, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
