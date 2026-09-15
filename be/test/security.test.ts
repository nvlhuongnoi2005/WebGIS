import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { AuthConfig } from "../config.js";
import { authenticate } from "../middleware.js";
import { PasswordService, validatePassword } from "../password.js";
import { RateLimiter } from "../rate-limit.js";
import { RevocationStore } from "../revocation.js";
import { TokenService } from "../token.js";

function config(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    nodeEnv: "test", port: 0, databaseUrl: "postgres://unused", appOrigins: ["http://localhost"],
    jwt: { issuer: "auth-test", audience: "gateway-test", kid: "test-1", previousPublicKeys: [], allowEphemeralKeys: true, accessTtlSeconds: 900 },
    refresh: { pepper: "test-pepper", ttlDays: 1, secureCookie: false },
    argon2: { memoryCost: 19456, timeCost: 2, parallelism: 1, hashLength: 32 },
    login: { maxConcurrent: 2, windowMs: 1_000, maxAttempts: 2 },
    gatewayConsumer: "test", valhallaUrl: "http://localhost:8002",
    ...overrides,
  };
}

async function readyStore(): Promise<RevocationStore> {
  const store = new RevocationStore();
  const fakeRepository = {
    checkpoint: async () => 0,
    eventsAfter: async () => [],
    saveCheckpoint: async () => undefined,
  };
  await store.synchronize(fakeRepository as never, "test");
  return store;
}

test("passwords use distinct Argon2id PHC hashes and reject incorrect passwords", async () => {
  const passwords = new PasswordService(config());
  const one = await passwords.hash("StrongPassword1");
  const two = await passwords.hash("StrongPassword1");
  assert.match(one, /^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  assert.notEqual(one, two);
  assert.doesNotMatch(one, /StrongPassword1/);
  assert.equal(await passwords.verify(one, "StrongPassword1"), true);
  assert.equal(await passwords.verify(one, "WrongPassword1"), false);
  assert.equal(passwords.needsRehash(one), false);
  assert.equal(validatePassword("Lapnv@2005"), null);
  assert.notEqual(validatePassword("short1A"), null);
});

test("JWT verification rejects forged, wrong issuer/audience, expired, and none-algorithm tokens", async () => {
  const tokens = await TokenService.create(config());
  const issued = await tokens.issueAccessToken({ sub: "user-a", sid: "session-a", av: 1, scope: ["map:read"], plan: "free" });
  assert.equal((await tokens.verifyAccessToken(issued.token)).sub, "user-a");

  const other = await TokenService.create(config());
  await assert.rejects(() => other.verifyAccessToken(issued.token));

  const wrongIssuer = await TokenService.create(config({ jwt: { ...config().jwt, issuer: "other-issuer" } }));
  await assert.rejects(() => wrongIssuer.verifyAccessToken(issued.token));
  const wrongAudience = await TokenService.create(config({ jwt: { ...config().jwt, audience: "other-audience" } }));
  await assert.rejects(() => wrongAudience.verifyAccessToken(issued.token));

  const expired = await TokenService.create(config({ jwt: { ...config().jwt, accessTtlSeconds: -1 } }));
  const expiredToken = await expired.issueAccessToken({ sub: "u", sid: "s", av: 1, scope: [], plan: "free" });
  await assert.rejects(() => expired.verifyAccessToken(expiredToken.token));
  await assert.rejects(() => tokens.verifyAccessToken("eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1In0."));
});

test("gateway authentication uses only a local JWT/revoke cache and blocks revoked values", async () => {
  const tokens = await TokenService.create(config());
  const revocations = await readyStore();
  const issued = await tokens.issueAccessToken({ sub: "user-a", sid: "session-a", av: 1, scope: ["map:read"], plan: "free" });
  const claims = await tokens.verifyAccessToken(issued.token);
  const app = express();
  app.get("/protected", authenticate(tokens, revocations), (request, response) => response.json({ user: request.auth?.sub }));
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const request = () => fetch(`http://127.0.0.1:${port}/protected`, { headers: { Authorization: `Bearer ${issued.token}` } });
  try {
    assert.equal((await request()).status, 200);
    revocations.apply({ type: "SessionRevoked", sid: claims.sid, user_id: claims.sub, timestamp: new Date().toISOString() });
    assert.equal((await request()).status, 401);
    const next = await tokens.issueAccessToken({ sub: "user-a", sid: "session-b", av: 1, scope: ["map:read"], plan: "free" });
    revocations.apply({ type: "PasswordChanged", user_id: "user-a", auth_version: 2, timestamp: new Date().toISOString() });
    assert.equal((await fetch(`http://127.0.0.1:${port}/protected`, { headers: { Authorization: `Bearer ${next.token}` } })).status, 401);
    const disabled = await tokens.issueAccessToken({ sub: "user-b", sid: "session-c", av: 9, scope: ["map:read"], plan: "free" });
    revocations.apply({ type: "UserDisabled", user_id: "user-b", auth_version: 1, timestamp: new Date().toISOString() });
    assert.equal((await fetch(`http://127.0.0.1:${port}/protected`, { headers: { Authorization: `Bearer ${disabled.token}` } })).status, 401);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("rate limiter applies the configured window to each identity key", () => {
  const limiter = new RateLimiter(1_000, 2);
  assert.equal(limiter.allow("ip:127.0.0.1", 1), true);
  assert.equal(limiter.allow("ip:127.0.0.1", 2), true);
  assert.equal(limiter.allow("ip:127.0.0.1", 3), false);
  assert.equal(limiter.allow("ip:127.0.0.1", 1_002), true);
});

test("gateway becomes unavailable when its durable revoke stream is stale", async () => {
  const store = await readyStore();
  assert.equal(store.isReady(), true);
  store.markUnavailable();
  assert.equal(store.isReady(), false);
});
