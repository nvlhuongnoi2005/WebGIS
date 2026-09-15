import { randomUUID, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { TokenService } from "./token.js";
import type { RevocationStore } from "./revocation.js";
import type { AuthenticatedRequestContext } from "./types.js";

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthenticatedRequestContext;
    requestId?: string;
  }
}

function denyAuthentication(response: Response): void {
  response.status(401).json({ error: "Unauthorized" });
}

export function requestId(request: Request, response: Response, next: NextFunction): void {
  request.requestId = randomUUID();
  response.setHeader("X-Request-Id", request.requestId);
  next();
}

export function authenticate(tokens: TokenService, revocations: RevocationStore) {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (!revocations.isReady()) {
      response.status(503).json({ error: "Authentication temporarily unavailable" });
      return;
    }
    const header = request.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      denyAuthentication(response);
      return;
    }
    try {
      const claims = await tokens.verifyAccessToken(header.slice("Bearer ".length));
      if (revocations.rejects(claims)) {
        denyAuthentication(response);
        return;
      }
      request.auth = { ...claims, requestId: request.requestId ?? randomUUID() };
      next();
    } catch {
      // Do not log credentials or distinguish invalid, expired, or revoked tokens.
      denyAuthentication(response);
    }
  };
}

export function authorize(...requiredScopes: string[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.auth) {
      denyAuthentication(response);
      return;
    }
    if (!requiredScopes.every(scope => request.auth?.scope.includes(scope))) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function validateCsrf(request: Request, response: Response, next: NextFunction): void {
  const cookie = request.cookies?.csrf_token;
  const header = request.header("x-csrf-token");
  if (typeof cookie !== "string" || typeof header !== "string") {
    response.status(403).json({ error: "Invalid CSRF token" });
    return;
  }
  const a = Buffer.from(cookie);
  const b = Buffer.from(header);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    response.status(403).json({ error: "Invalid CSRF token" });
    return;
  }
  next();
}
