import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The dev server proxies /api to FastAPI, so the browser sees a single origin and the
// backend needs no CORS middleware.
//
// Override the backend with API_TARGET in web/.env.local when port 8000 is taken by
// another project, e.g. API_TARGET=http://127.0.0.1:8001
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const target = env.API_TARGET || "http://127.0.0.1:8000";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
