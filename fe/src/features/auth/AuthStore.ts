import { createContext } from "react";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  dateOfBirth?: string;
  phone?: string;
  organization?: string;
  avatarUrl?: string;
  plan: string;
  role: "user" | "admin";
  scopes: string[];
  mustChangePassword?: boolean;
}

export interface RegisterDetails {
  name: string;
  email: string;
  password: string;
  dateOfBirth: string;
  phone: string;
  organization: string;
}

export type AuthResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "emailInUse"
        | "invalidCredentials"
        | "accountDisabled"
        | "accountLocked"
        | "registrationFailed"
        | "serviceUnavailable"
        | "storageFailed"
        | "currentPasswordInvalid"
        | "newPasswordInvalid"
        | "newPasswordSameAsCurrent";
    };

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  reauthenticationRequired: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (details: RegisterDetails) => Promise<AuthResult>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthResult>;
  updateContactDetails: (email: string, phone: string) => Promise<AuthResult>;
  updateAvatar: (avatarUrl: string) => Promise<AuthResult>;
  acknowledgeReauthentication: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
