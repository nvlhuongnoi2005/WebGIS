import "./env.js";
import { loadConfig } from "./config.js";
import { AuthRepository } from "./db.js";

const repository = new AuthRepository(loadConfig());
try {
  await repository.migrate();
  console.info("Authentication schema is up to date.");
} finally {
  await repository.close();
}
