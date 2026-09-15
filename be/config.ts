import { randomBytes } from "node:crypto";

export interface AuthConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  appOrigins: string[];
  jwt: {
    issuer: string;
    audience: string;
    kid: string;
    privateKey?: string;
    publicKey?: string;
    previousPublicKeys: Array<{ kid: string; publicKey: string }>;
    allowEphemeralKeys: boolean;
    accessTtlSeconds: number;
  };
  refresh: {
    pepper: string;
    ttlDays: number;
    secureCookie: boolean;
  };
  argon2: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
    hashLength: number;
  };
  login: {
    maxConcurrent: number;
    windowMs: number;
    maxAttempts: number;
  };
  gatewayConsumer: string;
  valhallaUrl: string;
}

function integer(name: string, fallback: number, minimum: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(value)) return fallback;
  if (value < minimum) throw new Error(`${name} must be at least ${minimum}.`);
  return value;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Set it in be/.env (copy be/.env.example first).`);
  }
  return value;
}

function previousPublicKeys(value: string | undefined): Array<{ kid: string; publicKey: string }> {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every(item =>
      item && typeof item === "object" && typeof (item as { kid?: unknown }).kid === "string" &&
      typeof (item as { publicKey?: unknown }).publicKey === "string"
    )) throw new Error();
    return parsed.map(item => {
      const key = item as { kid: string; publicKey: string };
      return { kid: key.kid, publicKey: key.publicKey.replace(/\\n/g, "\n") };
    });
  } catch {
    throw new Error("AUTH_JWT_PREVIOUS_PUBLIC_KEYS must be a JSON array of { kid, publicKey }.");
  }
}

export function loadConfig(env = process.env): AuthConfig {
  const nodeEnv = (env.NODE_ENV ?? "development") as AuthConfig["nodeEnv"];
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test, or production.");
  }

  const configuredPepper = env.AUTH_REFRESH_TOKEN_PEPPER?.trim();
  if (!configuredPepper && nodeEnv === "production") {
    throw new Error("AUTH_REFRESH_TOKEN_PEPPER is required in production.");
  }

  return {
    nodeEnv,
    port: integer("AUTH_PORT", 3001, 1),
    databaseUrl: required("DATABASE_URL"),
    appOrigins: (env.APP_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map(origin => origin.trim())
      .filter(Boolean),
    jwt: {
      issuer: env.AUTH_JWT_ISSUER ?? "auth-service",
      audience: env.AUTH_JWT_AUDIENCE ?? "api-gateway",
      kid: env.AUTH_JWT_KID ?? "dev-1",
      privateKey: env.AUTH_JWT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      publicKey: env.AUTH_JWT_PUBLIC_KEY?.replace(/\\n/g, "\n"),
      previousPublicKeys: previousPublicKeys(env.AUTH_JWT_PREVIOUS_PUBLIC_KEYS),
      allowEphemeralKeys: env.AUTH_DEV_EPHEMERAL_KEYS === "true",
      accessTtlSeconds: integer("AUTH_ACCESS_TOKEN_TTL_SECONDS", 900, 60),
    },
    refresh: {
      // An explicit value is mandatory in production. An ephemeral value is
      // intentionally only a local-development convenience and invalidates
      // all refresh tokens when the server restarts.
      pepper: configuredPepper ?? randomBytes(32).toString("base64url"),
      ttlDays: integer("AUTH_REFRESH_TOKEN_TTL_DAYS", 30, 1),
      secureCookie: env.AUTH_SECURE_COOKIES
        ? env.AUTH_SECURE_COOKIES === "true"
        : nodeEnv === "production",
    },
    argon2: {
      memoryCost: integer("AUTH_ARGON2_MEMORY_KIB", 19456, 8192),
      timeCost: integer("AUTH_ARGON2_TIME_COST", 2, 1),
      parallelism: integer("AUTH_ARGON2_PARALLELISM", 1, 1),
      hashLength: integer("AUTH_ARGON2_HASH_LENGTH", 32, 32),
    },
    login: {
      maxConcurrent: integer("AUTH_LOGIN_MAX_CONCURRENT", 4, 1),
      windowMs: integer("AUTH_LOGIN_RATE_WINDOW_MS", 60_000, 1_000),
      maxAttempts: integer("AUTH_LOGIN_MAX_ATTEMPTS", 10, 1),
    },
    gatewayConsumer: env.AUTH_GATEWAY_CONSUMER ?? "local-gateway-1",
    valhallaUrl: env.VALHALLA_INTERNAL_URL ?? "http://localhost:8002",
  };
}
