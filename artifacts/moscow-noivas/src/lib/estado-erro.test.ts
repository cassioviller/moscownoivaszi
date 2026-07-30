import { describe, expect, it } from "vitest";
import { mensagemApi } from "./erro-api";

/**
 * E99 — o que estes casos guardam é a regra, não o pixel.
 *
 * O app não tem infraestrutura de render (sem jsdom, sem testing-library — é a
 * mesma limitação que o E93 encontrou e resolveu um nível acima, no Playwright),
 * e o `vitest.config` do frontend só coleta os testes dentro de `src/lib`:
 * teste de componente não chega a ser executado. Por isso este arquivo mora
 * aqui, e não ao lado do componente.
 *
 * O que dá para testar é a DECISÃO que o componente encapsula: qual texto sai de
 * um erro. E é justamente ela que estava errada no componente anterior.
 */
describe("Erro — o componente compartilhado parou de falar protocolo", () => {
  /** O que o `EstadoErro` antigo fazia, reproduzido para a diferença ficar. */
  const comoEra = (erro: unknown) =>
    erro instanceof Error ? erro.message : "Falha inesperada.";

  /** O que o `<Erro>` novo faz — a mesma régua do E92, agora aqui também. */
  const comoE = (erro: unknown, mensagens?: Record<string, string>) =>
    mensagemApi(erro, "Falha inesperada. Tente de novo em um instante.", mensagens);

  it("erro de rede não vira o texto do protocolo", () => {
    const err = new Error("HTTP 404 Not Found");
    expect(comoEra(err)).toBe("HTTP 404 Not Found");
    expect(comoE(err)).toBe("Não consegui falar com o sistema. Tente de novo em um instante.");
  });

  it("o `detalhe` do servidor, escrito em português, passa a aparecer", () => {
    const err = { data: { error: "X", detalhe: "Essa noiva não é desta loja." } };
    // O componente antigo não sabia ler `detalhe`: caía no fallback genérico.
    expect(comoEra(err)).toBe("Falha inesperada.");
    expect(comoE(err)).toBe("Essa noiva não é desta loja.");
  });

  it("o dicionário da tela ganha de tudo — é onde ela sabe o que fazer", () => {
    const err = { data: { error: "AVARIA_JA_COBRADA", detalhe: "já cobrada" } };
    expect(comoE(err, { AVARIA_JA_COBRADA: "Este reparo já virou parcela." })).toBe(
      "Este reparo já virou parcela.",
    );
  });

  it("sem erro nenhum, o fallback orienta em vez de assustar", () => {
    expect(comoE(undefined)).toBe("Falha inesperada. Tente de novo em um instante.");
  });
});
