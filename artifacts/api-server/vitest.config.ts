import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Testes de integração compartilham o mesmo banco; execução serial
    // evita interferência entre arquivos de teste.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
