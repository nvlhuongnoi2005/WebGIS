import { config as loadEnvironment } from "dotenv";
import { resolve } from "node:path";

// Backend secrets are deliberately separate from the frontend Vite .env file.
// `be/.env` is ignored by Git; use be/.env.example as its starting point.
loadEnvironment({ path: resolve(import.meta.dirname, ".env"), quiet: true });
