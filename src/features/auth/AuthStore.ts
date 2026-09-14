import { createContext } from "react";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  dateOfBirth?: string;
  phone?: string;
  organization?: string;
  avatarUrl?: string;
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
    code: "emailInUse" | "invalidCredentials" | "accountNotFound";
  };

export interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (details: RegisterDetails) => Promise<AuthResult>;
  resetPassword: (email: string, password: string) => Promise<AuthResult>;
  logout: () => void;
  updateContactDetails: (email: string, phone: string) => AuthResult;
  updateAvatar: (avatarUrl: string) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
