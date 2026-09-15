import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { authFetch, setAccessToken } from "./authClient";
import { AuthContext, type AuthContextValue, type AuthResult, type AuthUser, type RegisterDetails } from "./AuthStore";

type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: AuthUser;
};

async function parseResponse(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const acceptTokenResponse = useCallback((payload: TokenResponse) => {
    setAccessToken(payload.access_token);
    setUser(payload.user);
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
    setAccessToken(null);
    setUser(null);
  }, []);

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
        const response = await authFetch("/auth/refresh", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
        });
        if (response.ok && active) acceptTokenResponse(await parseResponse(response) as TokenResponse);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void restoreSession();
    return () => { active = false; };
  }, [acceptTokenResponse]);

  const value = useMemo<AuthContextValue>(() => ({
    user, isLoading, login, register, logout, updateContactDetails, updateAvatar,
  }), [isLoading, login, logout, register, updateAvatar, updateContactDetails, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
