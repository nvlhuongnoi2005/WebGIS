import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const frontendRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(frontendRoot, "..");

export default defineConfig(({ mode }) => {
  // Keep the existing root .env file private while making fe/ Vite's root.
  const env = loadEnv(mode, workspaceRoot, "");

  return {
    root: frontendRoot,
    envDir: workspaceRoot,
    plugins: [
      react(),
    ],

    optimizeDeps: {
      exclude: ["maplibre-gl"],
    },

    server: {
      proxy: {
        "/auth": {
          target: env.VITE_AUTH_URL || "http://localhost:3001",
          changeOrigin: true,
        },
        "/api/gateway": {
          target: env.VITE_AUTH_URL || "http://localhost:3001",
          changeOrigin: true,
        },
        "/api/nominatim": {
          target: env.VITE_NOMINATIM_URL || "http://localhost:8083",
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api\/nominatim/, ""),
        },
        "/api/valhalla": {
          target: env.VITE_VALHALLA_URL || "http://localhost:8002",
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api\/valhalla/, ""),
        },
        "/api/tile-catalog": {
          target:
            env.VITE_TILE_SERVER_CATALOG_URL ||
            env.VITE_TILE_SERVER_URL ||
            "http://localhost:8080",
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api\/tile-catalog/, ""),
        },
        "/api/tiles": {
          target: env.VITE_TILE_SERVER_URL || "http://localhost:8080",
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api\/tiles/, ""),
        },
      },
    },
  };
});
