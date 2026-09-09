import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";


export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
    ],

    optimizeDeps: {
      exclude: ["maplibre-gl"],
    },

    server: {
      proxy: {
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
