import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * E133 (B7) — as telas de formulário longo avisam antes de perder.
 *
 * O hook (`use-confirmar-saida`) existia desde o E97 e 6 telas seguiam nuas —
 * a pior delas o formulário de interesses, preenchido DURANTE o atendimento,
 * com a noiva falando. O teste do backlog ("formulário sujo registra o
 * listener") pedia render, que o repo decidiu não ter (E99/E121); o que se
 * trava aqui é a ADOÇÃO: cada tela do achado chama o hook, e remover a
 * chamada fica vermelho. O boolean honesto de cada uma é revisão de código —
 * está comentado em cada call-site.
 */
describe("E133 — o hook de saída está nas telas que perdiam trabalho", () => {
  const RAIZ = join(import.meta.dirname, "..");
  const TELAS = [
    "pages/vestidos/vestido-form.tsx",
    "pages/noivas/[leadId]/interesses.tsx",
    "pages/catalogo/novo.tsx",
    "pages/catalogo/[atributoId]/editar.tsx",
    "pages/atendimentos/config.tsx",
    // As duas que JÁ usavam (E97) — se saírem, também é regressão:
    "pages/noivas/noiva-form.tsx",
    "pages/atendimentos/novo.tsx",
  ];

  it.each(TELAS)("%s chama useConfirmarSaida", (tela) => {
    const fonte = readFileSync(join(RAIZ, tela), "utf8");
    expect(fonte).toMatch(/useConfirmarSaida\(/);
  });
});
