import type { AuthRepository } from "./db.js";
import type { AccessClaims, RevocationEvent } from "./types.js";

export class RevocationStore {
  private readonly revokedSessions = new Set<string>();
  private readonly revokedTokens = new Set<string>();
  private readonly disabledUsers = new Set<string>();
  private readonly userMinAuthVersion = new Map<string, number>();
  private ready = false;
  private lastEventId = 0;

  isReady(): boolean { return this.ready; }

  markUnavailable(): void { this.ready = false; }

  apply(event: RevocationEvent): void {
    switch (event.type) {
      case "SessionRevoked":
        this.revokedSessions.add(event.sid);
        break;
      case "UserDisabled":
        this.disabledUsers.add(event.user_id);
        this.userMinAuthVersion.set(event.user_id, Math.max(this.userMinAuthVersion.get(event.user_id) ?? 0, event.auth_version));
        break;
      case "PasswordChanged":
      case "UserSessionsRevoked":
        this.userMinAuthVersion.set(event.user_id, Math.max(this.userMinAuthVersion.get(event.user_id) ?? 0, event.auth_version));
        break;
      case "KeyRevoked":
        break;
    }
  }

  revokeToken(jti: string): void { this.revokedTokens.add(jti); }

  rejects(claims: AccessClaims): boolean {
    return this.disabledUsers.has(claims.sub) || this.revokedSessions.has(claims.sid) || this.revokedTokens.has(claims.jti) ||
      claims.av < (this.userMinAuthVersion.get(claims.sub) ?? 0);
  }

  async synchronize(repository: AuthRepository, consumerName: string): Promise<void> {
    let cursor = this.lastEventId || await repository.checkpoint(consumerName);
    for (;;) {
      const events = await repository.eventsAfter(cursor);
      if (!events.length) break;
      for (const item of events) {
        this.apply(item.event);
        cursor = item.id;
      }
      await repository.saveCheckpoint(consumerName, cursor);
    }
    this.lastEventId = cursor;
    this.ready = true;
  }
}

export function createRevocationSynchronizer(
  repository: AuthRepository,
  store: RevocationStore,
  consumerName: string,
  intervalMs = 1_000,
) {
  let timer: NodeJS.Timeout | undefined;
  return {
    async start() {
      await store.synchronize(repository, consumerName);
      timer = setInterval(() => {
        void store.synchronize(repository, consumerName).catch(() => store.markUnavailable());
      }, intervalMs);
      timer.unref();
    },
    stop() { if (timer) clearInterval(timer); },
  };
}
