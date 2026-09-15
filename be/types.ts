export type UserStatus = "ACTIVE" | "DISABLED" | "LOCKED";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  authVersion: number;
  scopes: string[];
  plan: string;
  name: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  organization: string | null;
  avatarUrl: string | null;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  dateOfBirth?: string;
  phone?: string;
  organization?: string;
  avatarUrl?: string;
  plan: string;
  scopes: string[];
}

export interface SessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface AccessClaims {
  sub: string;
  sid: string;
  av: number;
  scope: string[];
  plan: string;
  jti: string;
}

export type RevocationEvent =
  | { type: "UserDisabled"; user_id: string; auth_version: number; timestamp: string }
  | { type: "SessionRevoked"; sid: string; user_id: string; timestamp: string }
  | { type: "PasswordChanged"; user_id: string; auth_version: number; timestamp: string }
  | { type: "UserSessionsRevoked"; user_id: string; auth_version: number; timestamp: string }
  | { type: "KeyRevoked"; key_id: string; user_id: string; timestamp: string };

export interface AuthenticatedRequestContext extends AccessClaims {
  requestId: string;
}
