import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  SignJWT,
  decodeProtectedHeader,
  exportJWK,
  exportSPKI,
  generateKeyPair,
  importPKCS8,
  importSPKI,
  jwtVerify,
  type CryptoKey,
} from "jose";
import type { AuthConfig } from "./config.js";
import type { AccessClaims } from "./types.js";

export class TokenError extends Error {}

export class TokenService {
  private constructor(
    private readonly config: AuthConfig,
    private readonly privateKey: CryptoKey,
    private readonly publicKeys: Map<string, CryptoKey>,
  ) {}

  static async create(config: AuthConfig): Promise<TokenService> {
    const { privateKey: privatePem, publicKey: publicPem, allowEphemeralKeys } = config.jwt;
    if (privatePem && publicPem) {
      const keys = new Map<string, CryptoKey>([[config.jwt.kid, await importSPKI(publicPem, "EdDSA")]]);
      for (const key of config.jwt.previousPublicKeys) keys.set(key.kid, await importSPKI(key.publicKey, "EdDSA"));
      return new TokenService(config, await importPKCS8(privatePem, "EdDSA"), keys);
    }
    if (!allowEphemeralKeys) {
      throw new Error("AUTH_JWT_PRIVATE_KEY and AUTH_JWT_PUBLIC_KEY are required.");
    }
    const pair = await generateKeyPair("EdDSA");
    return new TokenService(config, pair.privateKey, new Map([[config.jwt.kid, pair.publicKey]]));
  }

  async issueAccessToken(claims: Omit<AccessClaims, "jti">): Promise<{ token: string; expiresIn: number }> {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sid: claims.sid,
      av: claims.av,
      scope: claims.scope,
      plan: claims.plan,
    })
      .setProtectedHeader({ alg: "EdDSA", kid: this.config.jwt.kid, typ: "JWT" })
      .setIssuer(this.config.jwt.issuer)
      .setAudience(this.config.jwt.audience)
      .setSubject(claims.sub)
      .setIssuedAt(now)
      .setExpirationTime(now + this.config.jwt.accessTtlSeconds)
      .setJti(randomUUID())
      .sign(this.privateKey);
    return { token, expiresIn: this.config.jwt.accessTtlSeconds };
  }

  async verifyAccessToken(token: string): Promise<AccessClaims> {
    try {
      const unverifiedHeader = decodeProtectedHeader(token);
      if (unverifiedHeader.alg !== "EdDSA" || typeof unverifiedHeader.kid !== "string") throw new TokenError("Invalid token key.");
      const publicKey = this.publicKeys.get(unverifiedHeader.kid);
      if (!publicKey) throw new TokenError("Invalid token key.");
      const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
        algorithms: ["EdDSA"],
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience,
      });
      if (protectedHeader.alg !== "EdDSA" || protectedHeader.kid !== unverifiedHeader.kid) {
        throw new TokenError("Invalid token key.");
      }
      if (
        typeof payload.sub !== "string" || typeof payload.sid !== "string" ||
        typeof payload.jti !== "string" || !Number.isInteger(payload.av) ||
        !Array.isArray(payload.scope) || !payload.scope.every(scope => typeof scope === "string") ||
        typeof payload.plan !== "string"
      ) {
        throw new TokenError("Invalid token claims.");
      }
      return {
        sub: payload.sub,
        sid: payload.sid,
        av: payload.av as number,
        scope: payload.scope as string[],
        plan: payload.plan,
        jti: payload.jti,
      };
    } catch {
      throw new TokenError("Invalid access token.");
    }
  }

  createRefreshToken(): string {
    return randomBytes(48).toString("base64url");
  }

  hashRefreshToken(token: string): string {
    return createHmac("sha256", this.config.refresh.pepper).update(token).digest("base64url");
  }

  matchesRefreshToken(expectedHash: string, candidateHash: string): boolean {
    const expected = Buffer.from(expectedHash);
    const candidate = Buffer.from(candidateHash);
    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  }

  async publicKeyPem(): Promise<string> {
    const current = this.publicKeys.get(this.config.jwt.kid);
    if (!current) throw new Error("Current public key is unavailable.");
    return exportSPKI(current);
  }

  async publicJwks(): Promise<Record<string, unknown>[]> {
    return Promise.all(Array.from(this.publicKeys.entries()).map(async ([kid, key]) =>
      ({ ...(await exportJWK(key)), kid, alg: "EdDSA", use: "sig" }),
    ));
  }
}
