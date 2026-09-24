import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { authFetch, setAccessToken, setSessionExpiredHandler } from "./authClient";
import {
  AuthContext,
  type AuthContextValue,
  type AuthResult,
  type AuthUser,
  type RegisterDetails,
} from "./AuthStore";
import { publishNotification } from "../notifications/notificationEvents";

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
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reauthenticationRequired, setReauthenticationRequired] = useState(false);
  const idleTimeoutMs = useRef(DEFAULT_IDLE_TIMEOUT_MS);
  const lastActivityAt = useRef(0);
  const lastHeartbeatAt = useRef(0);

  const expireSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  const requireReauthentication = useCallback(() => {
    setReauthenticationRequired(true);
    expireSession();
  }, [expireSession]);

  const acceptTokenResponse = useCallback((payload: TokenResponse) => {
    setAccessToken(payload.access_token);
    setUser(payload.user);
    setReauthenticationRequired(false);
    idleTimeoutMs.current = Math.max(
      60_000,
      (payload.idle_timeout_seconds || DEFAULT_IDLE_TIMEOUT_MS / 1000) * 1000
    );
    lastActivityAt.current = Date.now();
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      try {
        const response = await authFetch("/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (response.status >= 500) return { ok: false, code: "serviceUnavailable" };
        if (!response.ok) {
          const payload = (await parseResponse(response)) as { code?: string } | null;
          if (payload?.code === "accountDisabled" || payload?.code === "accountLocked")
            return { ok: false, code: payload.code };
          return { ok: false, code: "invalidCredentials" };
        }
        acceptTokenResponse((await parseResponse(response)) as TokenResponse);
        return { ok: true };
      } catch {
        return { ok: false, code: "serviceUnavailable" };
      }
    },
    [acceptTokenResponse]
  );

  const register = useCallback(
    async (details: RegisterDetails): Promise<AuthResult> => {
      try {
        const response = await authFetch("/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(details),
        });
        if (response.status === 409) return { ok: false, code: "emailInUse" };
        if (response.status >= 500) return { ok: false, code: "serviceUnavailable" };
        if (!response.ok) return { ok: false, code: "registrationFailed" };
        // Preserve seamless registration without ever persisting credentials in the browser.
        const result = await login(details.email, details.password);
        if (result.ok) {
          publishNotification({
            kind: "welcome",
            titleKey: "notifications.welcomeTitle",
            descriptionKey: "notifications.welcomeDescription",
          });
        }
        return result;
      } catch {
        return { ok: false, code: "serviceUnavailable" };
      }
    },
    [login]
  );

  const logout = useCallback(async () => {
    try {
      await authFetch("/auth/logout", { method: "POST" });
    } catch {
      /* clear local state regardless */
    }
    setReauthenticationRequired(false);
    expireSession();
  }, [expireSession]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<AuthResult> => {
      try {
        const response = await authFetch("/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
        });
        if (response.status === 401) return { ok: false, code: "currentPasswordInvalid" };
        if (response.status === 400) {
          const payload = (await parseResponse(response)) as { code?: string } | null;
          return {
            ok: false,
            code:
              payload?.code === "passwordMustDiffer"
                ? "newPasswordSameAsCurrent"
                : "newPasswordInvalid",
          };
        }
        if (!response.ok) return { ok: false, code: "serviceUnavailable" };
        setReauthenticationRequired(false);
        expireSession();
        return { ok: true };
      } catch {
        return { ok: false, code: "serviceUnavailable" };
      }
    },
    [expireSession]
  );

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const response = await authFetch("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        expireSession();
        return false;
      }
      acceptTokenResponse((await parseResponse(response)) as TokenResponse);
      return true;
    } catch {
      expireSession();
      return false;
    }
  }, [acceptTokenResponse, expireSession]);

  useEffect(() => {
    lastActivityAt.current = Date.now();
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(requireReauthentication);
    return () => setSessionExpiredHandler(null);
  }, [requireReauthentication]);

  useEffect(() => {
    if (!user) return;

    const eventSource = new EventSource("/auth/session-events", { withCredentials: true });
    const handleSessionUpdate = () => {
      eventSource.close();
      requireReauthentication();
    };
    const handleShareReceived = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { share_id?: unknown; owner_name?: unknown };
        if (typeof payload.share_id !== "string" || typeof payload.owner_name !== "string") return;
        publishNotification({
          kind: "share",
          titleKey: "notifications.shareReceivedTitle",
          descriptionKey: "notifications.shareReceivedDescription",
          values: { owner: payload.owner_name },
          dedupeKey: `shared-map:${payload.share_id}`,
          actionHref: `/shared-with-me/${encodeURIComponent(payload.share_id)}`,
          actionLabelKey: "notifications.openShare",
        });
      } catch {
        /* Ignore malformed stream data and keep the session stream open. */
      }
    };
    eventSource.addEventListener("session-updated", handleSessionUpdate);
    eventSource.addEventListener("share-received", handleShareReceived);
    return () => {
      eventSource.removeEventListener("session-updated", handleSessionUpdate);
      eventSource.removeEventListener("share-received", handleShareReceived);
      eventSource.close();
    };
  }, [requireReauthentication, user]);

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
    events.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    const watchdog = window.setInterval(() => {
      if (Date.now() - lastActivityAt.current >= idleTimeoutMs.current) expireSession();
    }, 60_000);
    return () => {
      events.forEach((event) => window.removeEventListener(event, recordActivity));
      window.clearInterval(watchdog);
    };
  }, [expireSession, refreshSession, user]);

  const updateProfile = useCallback(async (body: Record<string, string>): Promise<AuthResult> => {
    try {
      const response = await authFetch("/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 409) return { ok: false, code: "emailInUse" };
      if (!response.ok) return { ok: false, code: "storageFailed" };
      const payload = (await parseResponse(response)) as { user: AuthUser };
      setUser(payload.user);
      return { ok: true };
    } catch {
      return { ok: false, code: "storageFailed" };
    }
  }, []);

  const updateContactDetails = useCallback(
    (email: string, phone: string) => updateProfile({ email, phone }),
    [updateProfile]
  );
  const updateAvatar = useCallback(
    (avatarUrl: string) => updateProfile({ avatarUrl }),
    [updateProfile]
  );

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
    return () => {
      active = false;
    };
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      reauthenticationRequired,
      login,
      register,
      logout,
      changePassword,
      updateContactDetails,
      updateAvatar,
      acknowledgeReauthentication: () => setReauthenticationRequired(false),
    }),
    [
      changePassword,
      isLoading,
      login,
      logout,
      reauthenticationRequired,
      register,
      updateAvatar,
      updateContactDetails,
      user,
    ]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
