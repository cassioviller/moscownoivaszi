import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        /**
         * D8/E104 — o que é COMPARTILHADO por muitas rotas sai do pedaço de cada
         * uma e vira um pedaço próprio, cacheável entre navegações e entre
         * deploys que não mexem nele.
         *
         * Sem isto, o `React.lazy` por rota resolve metade do problema: as 50
         * rotas passam a ser 50 pedaços, mas cada um carrega a fatia do cliente
         * gerado e do date-fns que usa, e o que é comum acaba duplicado ou
         * empurrado de volta para o chunk de entrada.
         *
         * A régua é por ORIGEM, não por nome de arquivo: o que vem de
         * `@workspace/api-client-react` é contrato de API (regenera junto com o
         * `openapi.yaml`); `date-fns` e o `react-day-picker` que o usa são
         * biblioteca de terceiros que muda em outro ritmo. Separá-los faz o
         * cache do navegador sobreviver ao deploy que só mexe em tela.
         */
        manualChunks(id) {
          if (id.includes("api-client-react") || id.includes("@workspace/api-zod")) {
            return "api-client";
          }
          if (id.includes("node_modules/date-fns") || id.includes("react-day-picker")) {
            return "datas";
          }
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
            return "react";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // Proxy /api → api-server apenas quando E2E_API_PROXY está definido
    // (usado pelos testes Playwright). Sem efeito no run normal do Replit.
    ...(process.env.E2E_API_PROXY
      ? { proxy: { "/api": { target: process.env.E2E_API_PROXY, changeOrigin: false } } }
      : {}),
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
