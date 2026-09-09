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
        "/api/valhalla": {
          target: env.VITE_VALHALLA_URL,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api\/valhalla/, ""),
        },
      },
    },
  };
});
