import {
  useCallback,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import {
  AuthContext,
  type AuthContextValue,
  type AuthResult,
  type AuthUser,
  type RegisterDetails,
} from "./AuthStore";

interface StoredAccount extends AuthUser {
  passwordHash: string;
}

const ACCOUNTS_STORAGE_KEY = "webgis.auth.accounts";
const SESSION_STORAGE_KEY = "webgis.auth.session";

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await hashPassword(password);
    const account = readAccounts().find(item =>
      item.email === normalizedEmail && item.passwordHash === passwordHash
    );

    if (!account) return { ok: false, code: "invalidCredentials" };

    const nextUser = toAuthUser(account);
    saveSession(nextUser);
    setUser(nextUser);
    return { ok: true };
  }, []);

  const register = useCallback(async ({
    name,
    email,
    password,
    dateOfBirth,
    phone,
    organization,
  }: RegisterDetails): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    const accounts = readAccounts();

    if (accounts.some(account => account.email === normalizedEmail)) {
      return { ok: false, code: "emailInUse" };
    }

    const account: StoredAccount = {
      id: createUserId(),
      name: name.trim(),
      email: normalizedEmail,
      dateOfBirth,
      phone: phone.trim(),
      organization: organization.trim(),
      passwordHash: await hashPassword(password),
    };
    saveAccounts([...accounts, account]);

    const nextUser = toAuthUser(account);
    saveSession(nextUser);
    setUser(nextUser);
    return { ok: true };
  }, []);

  const resetPassword = useCallback(async (
    email: string,
    password: string
  ): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    const accounts = readAccounts();
    const account = accounts.find(item => item.email === normalizedEmail);

    if (!account) return { ok: false, code: "accountNotFound" };

    const passwordHash = await hashPassword(password);
    saveAccounts(accounts.map(item =>
      item.id === account.id ? { ...item, passwordHash } : item
    ));
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setUser(null);
  }, []);

  const updateContactDetails = useCallback((email: string, phone: string): AuthResult => {
    if (!user) return { ok: false, code: "invalidCredentials" };

    const normalizedEmail = normalizeEmail(email);
    const accounts = readAccounts();
    if (accounts.some(account => account.id !== user.id && account.email === normalizedEmail)) {
      return { ok: false, code: "emailInUse" };
    }

    const nextUser = { ...user, email: normalizedEmail, phone: phone.trim() };
    saveAccounts(accounts.map(account =>
      account.id === user.id
        ? { ...account, email: normalizedEmail, phone: phone.trim() }
        : account
    ));
    saveSession(nextUser);
    setUser(nextUser);
    return { ok: true };
  }, [user]);

  const updateAvatar = useCallback((avatarUrl: string): AuthResult => {
    if (!user) return { ok: false, code: "invalidCredentials" };

    const nextUser = { ...user, avatarUrl };
    try {
      saveAccounts(readAccounts().map(account =>
        account.id === nextUser.id ? { ...account, avatarUrl } : account
      ));
      saveSession(nextUser);
      setUser(nextUser);
      return { ok: true };
    } catch {
      return { ok: false, code: "storageFailed" };
    }
  }, [user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    login,
    register,
    resetPassword,
    logout,
    updateContactDetails,
    updateAvatar,
  }), [login, logout, register, resetPassword, updateAvatar, updateContactDetails, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function readAccounts(): StoredAccount[] {
  return readStoredValue<StoredAccount[]>(ACCOUNTS_STORAGE_KEY, []);
}

function saveAccounts(accounts: StoredAccount[]) {
  window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

function readStoredUser(): AuthUser | null {
  return readStoredValue<AuthUser | null>(SESSION_STORAGE_KEY, null, true);
}

function saveSession(user: AuthUser) {
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
}

function readStoredValue<T>(key: string, fallback: T, fromSession = false): T {
  try {
    const value = (fromSession ? window.sessionStorage : window.localStorage).getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toAuthUser(account: StoredAccount): AuthUser {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    ...(account.dateOfBirth ? { dateOfBirth: account.dateOfBirth } : {}),
    ...(account.phone ? { phone: account.phone } : {}),
    ...(account.organization ? { organization: account.organization } : {}),
    ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {}),
  };
}

function createUserId(): string {
  return window.crypto.randomUUID?.() ?? `user-${Date.now()}-${Math.random()}`;
}

async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}
