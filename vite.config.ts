import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";

import { postgisRoadsPlugin } from "./server/postgisRoads.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      postgisRoadsPlugin({
        databaseUrl: env.POSTGIS_DATABASE_URL || env.DATABASE_URL,
        host: env.POSTGIS_HOST,
        port: env.POSTGIS_PORT,
        database: env.POSTGIS_DATABASE,
        user: env.POSTGIS_USER,
        password: env.POSTGIS_PASSWORD,
        schema: env.POSTGIS_SCHEMA,
        table: env.POSTGIS_LINES_TABLE,
        maxFeatures: env.POSTGIS_MAX_FEATURES,
        ssl: env.POSTGIS_SSL,
      }),
    ],

    optimizeDeps: {
      exclude: ["maplibre-gl"],
    },
  };
});
