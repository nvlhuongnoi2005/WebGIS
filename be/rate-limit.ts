export class RateLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(private readonly windowMs: number, private readonly maxAttempts: number) {}

  allow(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const recent = (this.attempts.get(key) ?? []).filter(timestamp => timestamp > cutoff);
    if (recent.length >= this.maxAttempts) {
      this.attempts.set(key, recent);
      return false;
    }
    recent.push(now);
    this.attempts.set(key, recent);
    return true;
  }
}

export class Semaphore {
  private current = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly maximum: number) {}

  async acquire(): Promise<() => void> {
    if (this.current >= this.maximum) {
      await new Promise<void>(resolve => this.waiters.push(resolve));
    }
    this.current += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.current -= 1;
      this.waiters.shift()?.();
    };
  }
}
