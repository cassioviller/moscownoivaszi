import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * E184 — **o manual promete um prazo; o código decide outro, e ninguém percebe.**
 *
 * A `varredura-manuais` já existente confere o MENU: que a lista de itens que
 * cada manual promete é a lista que o perfil abre. Ela não olha a prosa, e é
 * por isso que dois erros atravessaram um dia inteiro de trabalho sem serem
 * vistos:
 *
 * - A **S-O39** fechou no E176 (*"o link dura o que a proposta durar"*) e
 *   **quatro manuais continuaram dizendo que o link morre em 7 dias** — o
 *   manual do proprietário ainda a listava como decisão pendente que já tinha
 *   sido tomada.
 * - O **E183** unificou o recorte da fila de ajustes com a cor, e o manual da
 *   costureira seguiu ensinando a **contornar o defeito**: *"abra Todos uma vez
 *   por semana para não perder um casamento vermelho que ficou de fora"*.
 *
 * As duas são a mesma classe da S-O42 na direção da documentação: **conserto
 * feito, papel não atualizado.** Uma varredura de prosa inteira não existe;
 * esta prega o pedaço que É verificável — os prazos que saem de constante de
 * código.
 *
 * O contrato é do lado do manual: a célula que cita um prazo derivado do
 * código declara de QUAL régua ela sai.
 *
 *     <td class="prazo" data-regua="PORTAL_TTL_MS">30 dias, renovados …</td>
 *
 * Aqui a constante é lida da FONTE (não importada — pacotes diferentes, a mesma
 * limitação da S-O19), convertida em dias ou horas, e o número tem de aparecer
 * no texto da célula. Mudou a constante, o manual fica vermelho no mesmo commit.
 */

const RAIZ = path.resolve(__dirname, "..", "..", "..", "..");

const versionados = (glob: string) =>
  execFileSync("git", ["ls-files", glob], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

const ler = (arquivo: string) => readFileSync(path.join(RAIZ, arquivo), "utf8");

/**
 * Onde cada régua mora, e como ela se lê em português.
 *
 * `unidade` não é enfeite: `SESSAO_TTL_MS` são 8 HORAS, e um teste que
 * convertesse tudo para dias diria "0 dias" e passaria verde sobre um manual
 * que dissesse qualquer coisa.
 */
const REGUAS = {
  CONVITE_TTL_MS: { arquivo: "artifacts/api-server/src/lib/auth.ts", unidade: "dias" },
  SESSAO_TTL_MS: { arquivo: "artifacts/api-server/src/lib/auth.ts", unidade: "horas" },
  LOOKBOOK_TTL_MS: { arquivo: "artifacts/api-server/src/routes/lookbooks.ts", unidade: "dias" },
  PORTAL_TTL_MS: { arquivo: "artifacts/api-server/src/routes/portal.ts", unidade: "dias" },
  VALIDADE_PADRAO_DIAS: { arquivo: "artifacts/api-server/src/routes/orcamentos.ts", unidade: "dias" },
} as const;

type NomeDaRegua = keyof typeof REGUAS;

/** Lê `const NOME = <expressão>;` da fonte e avalia a expressão aritmética. */
function valorDaRegua(nome: NomeDaRegua): number {
  const fonte = ler(REGUAS[nome].arquivo);
  const m = new RegExp(`const ${nome} = ([^;]+);`).exec(fonte);
  expect(m, `${nome} sumiu de ${REGUAS[nome].arquivo} — ou mudou de forma`).toBeTruthy();
  // A expressão é sempre aritmética literal (`7 * 24 * 60 * 60 * 1000`).
  // eslint-disable-next-line no-eval
  const bruto = eval(m![1]!) as number;
  const { unidade } = REGUAS[nome];
  if (nome.endsWith("_DIAS")) return bruto;
  return unidade === "horas" ? bruto / (60 * 60 * 1000) : bruto / (24 * 60 * 60 * 1000);
}

type Citacao = { manual: string; regua: NomeDaRegua; texto: string };

function citacoes(): Citacao[] {
  const achadas: Citacao[] = [];
  for (const manual of versionados("docs/manuais/*.html")) {
    const html = ler(manual);
    for (const m of html.matchAll(/<td class="prazo" data-regua="([A-Z_]+)">([^<]*)<\/td>/g)) {
      achadas.push({ manual, regua: m[1] as NomeDaRegua, texto: m[2]! });
    }
  }
  return achadas;
}

describe("varredura — o prazo que o manual promete é o que o código decide (E184)", () => {
  const citadas = citacoes();

  it("olha para citações de verdade — não para um conjunto vazio", () => {
    // Piso de população: sem isto, apagar todos os `data-regua` deixaria a
    // varredura verde e muda. É a régua de sempre das varreduras daqui.
    expect(versionados("docs/manuais/*.html").length, "os manuais sumiram do versionamento").toBe(5);
    expect(citadas.length, "as anotações `data-regua` sumiram dos manuais").toBeGreaterThanOrEqual(9);
  });

  it("toda régua citada por um manual existe no código", () => {
    const desconhecidas = citadas.filter((c) => !(c.regua in REGUAS));
    expect(desconhecidas.map((c) => `${c.manual} → ${c.regua}`)).toEqual([]);
  });

  it("e o número que o manual escreve é o número que a constante vale", () => {
    const divergentes = citadas.filter((c) => {
      const esperado = valorDaRegua(c.regua);
      // O texto é frase, não número puro ("30 dias, renovados a cada abertura
      // dela"). O que se cobra é que o NÚMERO certo apareça nela.
      return !new RegExp(`\\b${esperado}\\b`).test(c.texto);
    });

    expect(
      divergentes.map((c) => `${c.manual.replace("docs/manuais/", "")} diz "${c.texto}" para ${c.regua} (vale ${valorDaRegua(c.regua)} ${REGUAS[c.regua].unidade})`),
      "o manual promete um prazo que o código não pratica",
    ).toEqual([]);
  });

  /**
   * O caso que originou tudo isto: a S-O39 fechou e a frase ficou. Aqui não dá
   * para pregar a igualdade — **o prazo do link deixou de ser constante**, e
   * passou a ser a validade da proposta, que a vendedora define por orçamento.
   * O que se prega é a AUSÊNCIA da frase antiga, que descrevia um defeito
   * fechado como se fosse comportamento.
   */
  it("nenhum manual ressuscita o link de 7 dias (S-O39, fechada no E176)", () => {
    const reincidentes = versionados("docs/manuais/*.html").filter((m) =>
      /link da proposta morre em 7 dias|link morre em 7 dias/i.test(ler(m)),
    );
    expect(
      reincidentes,
      "o link passou a durar o que a proposta durar — o manual voltou a contar a limitação antiga",
    ).toEqual([]);
  });
});
