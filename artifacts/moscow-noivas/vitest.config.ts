import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Config própria (o vitest a prefere ao vite.config.ts): o config do Vite exige
 * PORT/BASE_PATH do ambiente e lança sem eles — os unit tests não sobem servidor.
 *
 * **S15 — o `include` era `src/lib/**​/*.test.ts`, e essa linha custou caro.**
 *
 * Ela dizia "a lógica pura mora em `src/lib`, e comportamento de tela é do
 * Playwright" — o que continua verdade e continua sendo o caminho preferido. O
 * problema não era a doutrina: era o SILÊNCIO. Um teste escrito em qualquer
 * outro lugar de `src/` não rodava, e o vitest respondia "No test files found"
 * como se estivesse tudo bem — foi assim que o teste do `<Erro>` morreu antes de
 * nascer.
 *
 * O preço apareceu num conserto de PERMISSÃO (E111): os dois gates das telas de
 * cobrança e de recebimento pediam `financeiro.editar` para botões que o
 * servidor guarda por `leads`. Foram corrigidos e ficaram sem teste, porque não
 * havia onde escrever um. **Gate de permissão sem teste é a classe que volta
 * calada**, e é por isso que esta sobra subiu de 🟡 para 🟠.
 *
 * A régua de onde escrever o quê NÃO muda: cálculo continua em `src/lib` como
 * função pura, jornada continua no Playwright. O que passa a caber no meio é o
 * caso que nenhum dos dois pega bem — **um componente que decide MOSTRAR ou não
 * mostrar**, caro de montar no E2E (exige perfil customizado e sessão própria) e
 * invisível da lógica pura.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    /**
     * O DOM é POR ARQUIVO (`// @vitest-environment jsdom` no topo), e não
     * global — medido: ligar `environment: "jsdom"` para todo mundo derrubou
     * `src/lib/aparencia.test.ts`, que lê o CSS do disco e passou a receber
     * *"The URL must be of scheme file"* do resolvedor de URL do jsdom.
     *
     * Escrevi aqui, antes de medir, que o docblock era pior por "depender de
     * alguém lembrar". Estava errado nos dois lados: o custo do global é uma
     * regressão em teste que já existia, e o custo do esquecimento é
     * `document is not defined` na primeira execução — alto e imediato, não
     * silencioso. Barato e ruidoso ganha de global e surpreendente.
     */
    setupFiles: ["src/teste/setup.ts"],
  },
  // O JSX aqui é o `react-jsx` do tsconfig, e precisa ser dito: sem isto o
  // esbuild usa a transformação CLÁSSICA e o teste morre em "React is not
  // defined" — o app não quebra porque quem monta ele é o plugin do Vite, que
  // este config não carrega de propósito (ele exige PORT/BASE_PATH).
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
