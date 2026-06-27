import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config(); // carrega .env (DATABASE_URL) para os testes de integração

export default defineConfig({
  resolve: {
    // espelha o alias "@/*" do tsconfig para os testes resolverem @/lib, @/generated, etc.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    pool: "forks",
    fileParallelism: false,
  },
});
