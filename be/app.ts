import { randomBytes, timingSafeEqual } from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { AuthConfig } from "./config.js";
import { AuthRepository, toPublicUser } from "./db.js";
import { authenticate, authorize, requestId } from "./middleware.js";
import { PasswordService, validatePassword } from "./password.js";
import { RateLimiter, Semaphore } from "./rate-limit.js";
import { RevocationStore } from "./revocation.js";
import { TokenService } from "./token.js";
import type { RevocationEvent, UserRecord } from "./types.js";

const credentialsError = { error: "Invalid credentials" };
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  name: z.string().trim().min(1).max(120).optional(),
  dateOfBirth: z.string().date().optional(),
  phone: z.string().trim().max(32).optional(),
  organization: z.string().trim().max(160).optional(),
}).strict();
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
const refreshSchema = z.object({ refresh_token: z.string().min(32).max(512).optional() }).strict();
const changePasswordSchema = z.object({ current_password: z.string().min(1).max(128), new_password: z.string().min(1).max(128) }).strict();
const profileSchema = z.object({ email: emailSchema.optional(), phone: z.string().trim().max(32).optional(), avatarUrl: z.string().max(1_000_000).optional() }).strict();

export interface AppDependencies {
  config: AuthConfig;
  repository: AuthRepository;
  passwords: PasswordService;
  tokens: TokenService;
  revocations: RevocationStore;
}

function clientIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}

function cookieOptions(config: AuthConfig) {
  return {
    httpOnly: true,
    secure: config.refresh.secureCookie,
    sameSite: "strict" as const,
    path: "/auth",
    maxAge: config.refresh.ttlDays * 24 * 60 * 60 * 1000,
  };
}

function issueCsrfCookie(response: Response, config: AuthConfig): void {
  response.cookie("csrf_token", randomBytes(24).toString("base64url"), {
    httpOnly: false,
    secure: config.refresh.secureCookie,
    sameSite: "strict",
    path: "/",
    maxAge: config.refresh.ttlDays * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookies(response: Response, config: AuthConfig): void {
  response.clearCookie("refresh_token", { ...cookieOptions(config), maxAge: undefined });
  response.clearCookie("csrf_token", { httpOnly: false, secure: config.refresh.secureCookie, sameSite: "strict", path: "/" });
}

async function issueLoginResponse(
  response: Response,
  config: AuthConfig,
  tokens: TokenService,
  user: UserRecord,
  sessionId: string,
  refreshToken: string,
): Promise<void> {
  const access = await tokens.issueAccessToken({
    sub: user.id, sid: sessionId, av: user.authVersion, scope: user.scopes, plan: user.plan,
  });
  response.cookie("refresh_token", refreshToken, cookieOptions(config));
  issueCsrfCookie(response, config);
  response.status(200).json({ access_token: access.token, token_type: "Bearer", expires_in: access.expiresIn, user: toPublicUser(user) });
}

function csrfForCookieRefresh(request: Request): boolean {
  const cookie = request.cookies?.refresh_token;
  if (typeof cookie !== "string") return true;
  const csrf = request.cookies?.csrf_token;
  const header = request.header("x-csrf-token");
  if (typeof csrf !== "string" || typeof header !== "string") return false;
  const expected = Buffer.from(csrf);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createApp(deps: AppDependencies) {
  const { config, repository, passwords, tokens, revocations } = deps;
  const app = express();
  const loginLimiter = new RateLimiter(config.login.windowMs, config.login.maxAttempts);
  const loginSemaphore = new Semaphore(config.login.maxConcurrent);
  const dummyPasswordHash = await passwords.hash("not-a-real-password-37B2!");

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(requestId);
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.appOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH"],
    allowedHeaders: ["Authorization", "Content-Type", "X-CSRF-Token", "X-Request-Id"],
  }));
  app.use(express.json({ limit: "128kb" }));
  app.use(cookieParser());

  app.get("/health", (_request, response) => response.status(revocations.isReady() ? 200 : 503).json({ ok: revocations.isReady() }));
  app.get("/auth/.well-known/jwks.json", async (_request, response, next) => {
    try { response.json({ keys: await tokens.publicJwks() }); } catch (error) { next(error); }
  });

  app.post("/auth/register", async (request, response, next) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Invalid registration request" });
    const policyError = validatePassword(parsed.data.password);
    if (policyError) return response.status(400).json({ error: policyError });
    try {
      const passwordHash = await passwords.hash(parsed.data.password);
      const user = await repository.transaction(async db => {
        if (await repository.findUserByEmail(parsed.data.email, db)) return null;
        const created = await repository.createUser({ ...parsed.data, passwordHash }, db);
        await db.query(
          `INSERT INTO user_quotas (user_id, period_start, period_end, limit_units)
           VALUES ($1, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 1000)`, [created.id],
        );
        return created;
      });
      if (!user) return response.status(409).json({ error: "Email is already registered" });
      // Password hashes are never returned or logged.
      return response.status(201).json({ user: toPublicUser(user) });
    } catch (error) {
      // A unique constraint is the final protection in case of concurrent registration.
      if ((error as { code?: string }).code === "23505") return response.status(409).json({ error: "Email is already registered" });
      return next(error);
    }
  });

  app.post("/auth/login", async (request, response, next) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(credentialsError);
    const rateKeys = [`ip:${clientIp(request)}`, `identity:${parsed.data.email}`];
    if (!rateKeys.every(key => loginLimiter.allow(key))) return response.status(429).json({ error: "Too many attempts. Try again later." });
    const release = await loginSemaphore.acquire();
    try {
      const user = await repository.findUserByEmail(parsed.data.email);
      let validPassword = false;
      try { validPassword = await passwords.verify(user?.passwordHash ?? dummyPasswordHash, parsed.data.password); } catch { validPassword = false; }
      if (!user || !validPassword || user.status !== "ACTIVE") return response.status(401).json(credentialsError);
      if (passwords.needsRehash(user.passwordHash)) {
        await repository.pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [await passwords.hash(parsed.data.password), user.id]);
      }
      const refreshToken = tokens.createRefreshToken();
      const session = await repository.transaction(async db => {
        const created = await repository.createSession({
          userId: user.id,
          refreshTokenHash: tokens.hashRefreshToken(refreshToken),
          expiresAt: new Date(Date.now() + config.refresh.ttlDays * 86_400_000),
          userAgent: request.header("user-agent")?.slice(0, 500), ipAddress: clientIp(request),
        }, db);
        await repository.setLastLogin(user.id, db);
        return created;
      });
      // Audit log deliberately contains metadata only, never a credential/token.
      console.info(JSON.stringify({ event: "login_success", user_id: user.id, request_id: request.requestId }));
      return issueLoginResponse(response, config, tokens, user, session.id, refreshToken);
    } catch (error) { return next(error); } finally { release(); }
  });

  app.post("/auth/refresh", async (request, response, next) => {
    const parsed = refreshSchema.safeParse(request.body ?? {});
    const refreshToken = parsed.success ? parsed.data.refresh_token ?? request.cookies?.refresh_token : undefined;
    if (!refreshToken || !csrfForCookieRefresh(request)) return response.status(401).json({ error: "Unauthorized" });
    try {
      const hash = tokens.hashRefreshToken(refreshToken);
      const result = await repository.transaction(async db => {
        const session = await repository.findSessionForRefresh(hash, db);
        if (!session) {
          const replay = await repository.findRefreshHistory(hash, db);
          if (replay) {
            await repository.revokeSession(replay.sessionId, db);
            const event: RevocationEvent = { type: "SessionRevoked", sid: replay.sessionId, user_id: replay.userId, timestamp: new Date().toISOString() };
            await repository.publish(event, db);
            return { replay: event } as const;
          }
          return null;
        }
        if (!tokens.matchesRefreshToken(session.refreshTokenHash, hash) || session.revokedAt || session.expiresAt <= new Date()) return null;
        const user = await repository.findUserById(session.userId, db);
        if (!user || user.status !== "ACTIVE") return null;
        const nextRefreshToken = tokens.createRefreshToken();
        await repository.rotateRefreshToken(session, tokens.hashRefreshToken(nextRefreshToken), db);
        return { user, sid: session.id, refreshToken: nextRefreshToken } as const;
      });
      if (!result || "replay" in result) {
        if (result?.replay) revocations.apply(result.replay);
        clearRefreshCookies(response, config);
        return response.status(401).json({ error: "Unauthorized" });
      }
      return issueLoginResponse(response, config, tokens, result.user, result.sid, result.refreshToken);
    } catch (error) { return next(error); }
  });

  app.post("/auth/logout", authenticate(tokens, revocations), async (request, response, next) => {
    try {
      const event = await repository.transaction(async db => {
        const session = await repository.revokeSession(request.auth!.sid, db);
        if (!session) return null;
        const nextEvent: RevocationEvent = { type: "SessionRevoked", sid: request.auth!.sid, user_id: session.userId, timestamp: new Date().toISOString() };
        await repository.publish(nextEvent, db);
        return nextEvent;
      });
      if (event) revocations.apply(event);
      clearRefreshCookies(response, config);
      return response.status(204).end();
    } catch (error) { return next(error); }
  });

  app.post("/auth/logout-all", authenticate(tokens, revocations), async (request, response, next) => {
    try {
      const event = await repository.transaction(async db => {
        await repository.revokeAllSessions(request.auth!.sub, db);
        const version = await repository.incrementAuthVersion(request.auth!.sub, db);
        const nextEvent: RevocationEvent = { type: "UserSessionsRevoked", user_id: request.auth!.sub, auth_version: version, timestamp: new Date().toISOString() };
        await repository.publish(nextEvent, db);
        return nextEvent;
      });
      revocations.apply(event);
      clearRefreshCookies(response, config);
      return response.status(204).end();
    } catch (error) { return next(error); }
  });

  app.post("/auth/change-password", authenticate(tokens, revocations), async (request, response, next) => {
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Invalid password change request" });
    const policyError = validatePassword(parsed.data.new_password);
    if (policyError) return response.status(400).json({ error: policyError });
    try {
      const user = await repository.findUserById(request.auth!.sub);
      if (!user || user.status !== "ACTIVE" || !await passwords.verify(user.passwordHash, parsed.data.current_password)) {
        return response.status(401).json(credentialsError);
      }
      const nextHash = await passwords.hash(parsed.data.new_password);
      const event = await repository.transaction(async db => {
        await repository.revokeAllSessions(user.id, db);
        const version = await repository.updatePassword(user.id, nextHash, db);
        const nextEvent: RevocationEvent = { type: "PasswordChanged", user_id: user.id, auth_version: version, timestamp: new Date().toISOString() };
        await repository.publish(nextEvent, db);
        return nextEvent;
      });
      revocations.apply(event);
      clearRefreshCookies(response, config);
      console.info(JSON.stringify({ event: "password_changed", user_id: user.id, request_id: request.requestId }));
      return response.status(204).end();
    } catch (error) { return next(error); }
  });

  app.get("/auth/me", authenticate(tokens, revocations), async (request, response, next) => {
    try {
      const user = await repository.findUserById(request.auth!.sub);
      if (!user || user.status !== "ACTIVE") return response.status(401).json({ error: "Unauthorized" });
      return response.json({ user: toPublicUser(user) });
    } catch (error) { return next(error); }
  });

  app.patch("/auth/me", authenticate(tokens, revocations), async (request, response, next) => {
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success || !Object.keys(parsed.data).length) return response.status(400).json({ error: "Invalid profile update" });
    try { return response.json({ user: toPublicUser(await repository.updateProfile(request.auth!.sub, parsed.data)) }); }
    catch (error) {
      if ((error as { code?: string }).code === "23505") return response.status(409).json({ error: "Email is already registered" });
      return next(error);
    }
  });

  // Demonstrates the Gateway path: verify locally, authorize scope, reserve
  // quota atomically, then invoke an internal-only worker with fresh context.
  app.post("/api/gateway/route", authenticate(tokens, revocations), authorize("route:calculate"), async (request, response, next) => {
    try {
      if (!await repository.reserveQuota(request.auth!.sub, 1)) return response.status(429).json({ error: "Quota exceeded" });
      const workerResponse = await fetch(`${config.valhallaUrl.replace(/\/$/, "")}/route`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-user-id": request.auth!.sub,
          "x-internal-session-id": request.auth!.sid,
          "x-internal-scopes": request.auth!.scope.join(" "),
          "x-internal-plan": request.auth!.plan,
          "x-request-id": request.auth!.requestId,
          "x-trace-id": request.auth!.requestId,
        },
        body: JSON.stringify(request.body),
      });
      const body = await workerResponse.text();
      const contentType = workerResponse.headers.get("content-type") ?? "application/json";
      return response.status(workerResponse.status).type(contentType).send(body);
    } catch (error) { return next(error); }
  });

  app.get("/api/gateway/map", authenticate(tokens, revocations), authorize("map:read"), (request, response) => {
    response.json({ user_id: request.auth!.sub, plan: request.auth!.plan, request_id: request.auth!.requestId });
  });

  app.post("/api/admin/users/:userId/disable", authenticate(tokens, revocations), authorize("admin:manage-users"), async (request, response, next) => {
    try {
      const userId = Array.isArray(request.params.userId) ? request.params.userId[0] : request.params.userId;
      if (!userId) return response.status(400).json({ error: "Invalid user id" });
      const event = await repository.transaction(async db => {
        const version = await repository.disableUser(userId, db);
        if (!version) return null;
        const nextEvent: RevocationEvent = { type: "UserDisabled", user_id: userId, auth_version: version, timestamp: new Date().toISOString() };
        await repository.publish(nextEvent, db);
        return nextEvent;
      });
      if (!event) return response.status(404).json({ error: "User not found" });
      revocations.apply(event);
      return response.status(204).end();
    } catch (error) { return next(error); }
  });

  app.use((_request, response) => response.status(404).json({ error: "Not found" }));
  app.use((error: unknown, request: Request, response: Response, next: NextFunction) => {
    void next;
    // Internal details (including database errors) never reach the client.
    void error;
    console.error(JSON.stringify({ event: "request_failed", request_id: request.requestId }));
    response.status(500).json({ error: "Internal server error" });
  });
  return app;
}
