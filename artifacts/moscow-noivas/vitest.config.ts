import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Config própria (o vitest a prefere ao vite.config.ts): o config do Vite exige
 * PORT/BASE_PATH do ambiente e lança sem eles — os unit tests não sobem servidor.
 *
 * Escopo: a lógica PURA de src/lib (dinheiro, datas, agregação do financeiro).
 * Comportamento de tela é coberto pelo Playwright em e2e/.
 */
export default defineConfig({
  test: {
    include: ["src/lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
