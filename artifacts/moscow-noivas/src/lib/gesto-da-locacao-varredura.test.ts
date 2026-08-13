import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * **S-C35/E224 — a régua que impede a retirada e a devolução de sumirem da tela
 * de novo.**
 *
 * O E222 mediu o buraco e não o fechou, de propósito (regra da casa: o que
 * aparece fora do escopo vira sobra): **1 de 723 contratos tinha
 * `dataRetirada`, nenhum tinha `dataDevolucao`, e NENHUMA tela do frontend
 * citava os dois campos** — enumerado por `git ls-files`. As colunas existem
 * desde sempre, o spec as declara nas duas portas, a API as grava e o PDF as
 * imprime; só não havia gesto na loja que as preenchesse.
 *
 * A varredura não conta ocorrências: ela pergunta pelas DUAS PONTAS do gesto —
 * onde o contrato NASCE (o diálogo do orçamento, `POST /contratos`) e onde ele
 * se CORRIGE (a ficha do contrato, `PATCH /contratos/:id`). Fechar só a
 * primeira seria o meio conserto do E172: a vendedora digitaria a retirada
 * errada e não teria por onde arrumá-la sem cancelar o contrato.
 *
 * Ela também prega a régua da hora: o valor que sai da tela é um INSTANTE lido
 * no relógio da LOJA, e é `localParaISO` quem o monta. Uma tela que mandasse
 * `new Date(valor)` cru gravaria a hora do navegador de quem clicou — e a hora
 * é exatamente o que a cláusula 4ª decide (10:30 às 19:00).
 */

const RAIZ = join(import.meta.dirname, "..");

/** As duas pontas do gesto, com o que cada uma tem de oferecer. */
const PONTAS = [
  {
    tela: "pages/orcamentos/[id].tsx",
    porta: "POST /contratos — onde o contrato nasce",
  },
  {
    tela: "pages/contratos/[id].tsx",
    porta: "PATCH /contratos/:id — onde a data se corrige",
  },
] as const;

function fonte(relativo: string): string {
  return readFileSync(join(RAIZ, relativo), "utf8");
}

describe("S-C35 — a retirada e a devolução têm onde ser preenchidas", () => {
  it("as duas telas do gesto existem no versionamento", () => {
    const versionados = new Set(arquivosVersionados(RAIZ, ["pages"]));
    for (const { tela } of PONTAS) expect(versionados).toContain(tela);
  });

  it.each(PONTAS)("$tela oferece os dois campos ($porta)", ({ tela }) => {
    const codigo = fonte(tela);
    expect(codigo).toContain("dataRetirada");
    expect(codigo).toContain("dataDevolucao");
  });

  it.each(PONTAS)("$tela lê a hora no relógio da loja, não no do navegador", ({ tela }) => {
    const codigo = fonte(tela);
    // A conversão é uma só, e mora em `lib/retirada-devolucao.ts` (E224).
    expect(codigo).toContain("localParaISO");
  });

  it.each(PONTAS)("$tela não reescreve a hora da cláusula 5ª à mão", ({ tela }) => {
    const codigo = fonte(tela)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    // 630 e 1080 são `LOCACAO_INICIO_PADRAO`/`LOCACAO_FIM_PADRAO` no
    // `@workspace/agenda-core`; "10:30"/"18:00" cravados na tela seriam a
    // segunda grafia da mesma cláusula, que é a classe de defeito do E187.
    expect(codigo).not.toMatch(/"10:30"|'10:30'/);
    expect(codigo).not.toMatch(/T18:00|"18:00"|'18:00'/);
  });

  /**
   * O diálogo que fecha o contrato precisa dizer o que a porta vai recusar —
   * as duas recusas do E222 pelo campo, e o prazo do § único (E218), que este
   * épico ACORDA: `CARNE_DEPOIS_DO_PRAZO` só dispara quando há `dataRetirada`,
   * e até aqui 722 dos 723 contratos não tinham nenhuma.
   */
  it("o diálogo do fecho conhece o prazo do carnê que a retirada acorda", () => {
    const codigo = fonte("pages/orcamentos/[id].tsx");
    expect(codigo).toContain("CARNE_DEPOIS_DO_PRAZO");
    expect(codigo).toContain("foraDoPrazoDaRetirada");
  });
});

/**
 * **S-C91 — a TERCEIRA ponta, e ela só LÊ.**
 *
 * As duas de cima são onde a locação se escreve. Esta é onde ela se lê no
 * telefone: a ficha da noiva é a tela que quem atende abre quando ela liga
 * perguntando *"que dia eu busco o vestido?"*, e até aqui a resposta exigia
 * abrir o contrato. A ficha mostrava a RESERVA (o aviso de data do E189) e não
 * a LOCAÇÃO.
 *
 * A varredura prega as três decisões, porque as três são fáceis de desfazer sem
 * perceber ao mexer numa tela de 850 linhas: a régua da escolha do contrato é
 * UMA (`locacaoDaNoiva`, que não refaz o `find` por ATIVO), o formato é o
 * INSTANTE no relógio da loja (`instanteCurto`) e nunca o dia de negócio em UTC
 * (`diaMesAno`), e o que a ficha lê são os dois campos do contrato.
 */
const FICHA_DA_NOIVA = "pages/noivas/[leadId]/index.tsx";
const REGUA_DA_LOCACAO = "lib/locacao-da-noiva.ts";

describe("S-C91 — a ficha da noiva mostra a locação, não só a reserva", () => {
  it("a ficha e a régua existem no versionamento", () => {
    const versionados = new Set(arquivosVersionados(RAIZ, ["pages", "lib"]));
    expect(versionados).toContain(FICHA_DA_NOIVA);
    expect(versionados).toContain(REGUA_DA_LOCACAO);
  });

  it("a régua lê os dois campos do contrato", () => {
    const codigo = fonte(REGUA_DA_LOCACAO);
    expect(codigo).toContain("dataRetirada");
    expect(codigo).toContain("dataDevolucao");
  });

  it("a ficha da noiva mostra a retirada e a devolução", () => {
    const codigo = fonte(FICHA_DA_NOIVA);
    expect(codigo).toContain("locacaoDaNoiva");
    expect(codigo).toContain("Retirada");
    expect(codigo).toContain("Devolução");
  });

  it("a ficha lê a HORA no relógio da loja — a cláusula 4ª é sobre horas", () => {
    const codigo = fonte(FICHA_DA_NOIVA);
    // `diaMesAno` é dia de NEGÓCIO em UTC (`formatos.ts:230-238`) e continua
    // certo para o aviso da reserva, logo acima no mesmo card. O que ele não
    // pode fazer é formatar a locação: "12/05/2027" não diz a que horas a noiva
    // vem buscar, que é a informação que as cláusulas 4ª e 5ª existem para fixar.
    expect(codigo).toContain("instanteCurto");
  });
});
