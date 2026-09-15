import { randomBytes } from "node:crypto";
import argon2, { type HashOptions } from "argon2";
import type { AuthConfig } from "./config.js";

export class PasswordService {
  private readonly options: HashOptions;

  constructor(config: Pick<AuthConfig, "argon2">) {
    this.options = {
      type: argon2.argon2id,
      memoryCost: config.argon2.memoryCost,
      timeCost: config.argon2.timeCost,
      parallelism: config.argon2.parallelism,
      hashLength: config.argon2.hashLength,
    };
  }

  async hash(password: string): Promise<string> {
    // argon2's encoded PHC string stores algorithm/version/costs/salt/hash.
    return argon2.hash(password, { ...this.options, salt: randomBytes(16) });
  }

  async verify(encodedHash: string, password: string): Promise<boolean> {
    // The library reads the parameters and salt from encodedHash and performs
    // verification using the native Argon2 constant-time comparison.
    return argon2.verify(encodedHash, password);
  }

  needsRehash(encodedHash: string): boolean {
    return argon2.needsRehash(encodedHash, this.options);
  }
}

export function validatePassword(password: string): string | null {
  if (password.length < 8 || password.length > 128) {
    return "Password must be between 8 and 128 characters.";
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Password must include lowercase, uppercase, and a number.";
  }
  return null;
}
