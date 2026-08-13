import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CAMPOS_EXIGIDOS_NO_CONTRATO } from "@/lib/qualificacao";

/**
 * Régua — **a lista do cliente espelha a do servidor.**
 *
 * O E215 tem uma lista de campos obrigatórios em dois lugares, e as duas cópias
 * são inevitáveis: uma no servidor
 * (`api-server/src/lib/qualificacao-da-locataria.ts`), que RECUSA o fecho, e
 * uma aqui, que AVISA antes. Cópia inevitável não é desculpa para cópia solta —
 * é a S-C33 e a S-C55 na mesma semana, e as duas ensinaram que lista curada à
 * mão apodrece em silêncio.
 *
 * O modo de falhar é assimétrico, e é por isso que a régua existe:
 *
 * - Campo **no servidor e não aqui**: a tela deixa a vendedora salvar a ficha
 *   achando que está completa, e o 422 aparece na frente da noiva.
 * - Campo **aqui e não no servidor**: a tela pede um dado que ninguém exige, e
 *   a vendedora digita à toa.
 *
 * Ela lê o FONTE do servidor em vez de importá-lo porque os dois pacotes não se
 * importam — o cliente não depende do `api-server`, e criar essa dependência
 * para uma régua seria pagar um acoplamento de build por uma conferência de
 * teste.
 */

const FONTE_DO_SERVIDOR = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "api-server",
  "src",
  "lib",
  "qualificacao-da-locataria.ts",
);

/**
 * Os campos obrigatórios declarados no servidor, lidos do fonte.
 * `CAMPOS_DA_QUALIFICACAO` é uma lista de `{ campo, rotulo, obrigatorio }`, e
 * só interessam os `obrigatorio: true`.
 */
function obrigatoriosDoServidor(): string[] {
  const fonte = readFileSync(FONTE_DO_SERVIDOR, "utf8");
  const inicio = fonte.indexOf("CAMPOS_DA_QUALIFICACAO = [");
  expect(
    inicio,
    "a lista do servidor mudou de nome — reaponte esta régua, não a apague",
  ).toBeGreaterThan(-1);
  const fim = fonte.indexOf("] as const;", inicio);
  const bloco = fonte.slice(inicio, fim);

  const campos: string[] = [];
  for (const linha of bloco.split("\n")) {
    const m = linha.match(/\{\s*campo:\s*"([^"]+)".*obrigatorio:\s*(true|false)/);
    if (m && m[2] === "true") campos.push(m[1]!);
  }
  return campos;
}

describe("E215 — a lista do cliente espelha a do servidor", () => {
  it("lê a lista do servidor, e não um conjunto vazio", () => {
    // `[]` de sonda cega e `[]` de repositório limpo são o mesmo valor — a
    // lição da S-C55, e a razão de esta asserção existir antes da comparação.
    expect(obrigatoriosDoServidor().length).toBeGreaterThanOrEqual(10);
  });

  it("os campos exigidos são os MESMOS, na mesma ordem", () => {
    // A ordem importa: é a ordem do papel, e é nela que a recusa do 422 lista
    // o que falta. Duas ordens diferentes fariam a tela destacar os campos numa
    // sequência e o erro citá-los noutra.
    expect([...CAMPOS_EXIGIDOS_NO_CONTRATO]).toEqual(obrigatoriosDoServidor());
  });

  it("o complemento é o único da qualificação que NÃO é exigido", () => {
    const fonte = readFileSync(FONTE_DO_SERVIDOR, "utf8");
    expect(fonte).toMatch(/campo:\s*"enderecoComplemento".*obrigatorio:\s*false/);
    expect([...CAMPOS_EXIGIDOS_NO_CONTRATO]).not.toContain("enderecoComplemento");
  });

  it("são doze — e o número é conferido para o dia em que a lista esvaziar", () => {
    expect(CAMPOS_EXIGIDOS_NO_CONTRATO.length).toBe(12);
  });
});
