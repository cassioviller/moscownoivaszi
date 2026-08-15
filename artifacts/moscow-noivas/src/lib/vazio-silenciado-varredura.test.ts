import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";
import { locacaoDaNoiva } from "./locacao-da-noiva";
import { reajustePrevisto } from "./reajuste-da-troca";

/**
 * S-C161 — **frase de vazio afirmada sobre lista silenciada por `?? []`.**
 *
 * A classe nasceu na S-C120 e o E121 já a tinha fechado uma casa antes (número
 * afirmado com a consulta em voo); o que faltava era a régua que impede o
 * PRÓXIMO card de nascer torto. O defeito, na cena que custa: a consulta de
 * avarias responde 500, `(avarias.data ?? [])` engole o erro, e a tela afirma
 * **"Nenhuma avaria registrada — o vestido voltou como saiu."** — a frase que a
 * dona lê antes de decidir NÃO cobrar a avaria (S-C160). Medido em 2026-08-15:
 * eram DOIS sítios vivos, e o segundo não estava em sobra nenhuma —
 * `conversao.tsx` afirmava "Nenhum casamento com data marcada nos próximos
 * meses." sobre `(sazonalidade.data ?? [])`, com o `q.isError` da página
 * guardando OUTRA consulta, três cards acima.
 *
 * ## O critério, declarado
 *
 * 1. **A população** — todo `.ts`/`.tsx` versionado de `src/`, sem os testes
 *    (o recorte da S-C130: pasta é decisão que apodrece; o recorte é UM).
 *    Teste sai porque os autotestes abaixo plantam a grafia de propósito.
 * 2. **A grafia da mentira** — `(consulta.data ?? []).length === 0`, com
 *    `?.campo` opcional no meio: um TESTE DE VAZIO montado direto sobre o
 *    fallback. É essa comparação que transforma o silêncio do `?? []` em
 *    afirmação — o ramo do zero é sempre uma frase categórica.
 * 3. **A exigência** — o arquivo que testa o vazio dessa consulta CONSULTA o
 *    estado dela: `consulta.isError` no próprio arquivo, ou a consulta passada
 *    a `estadoDoCard(...)` / `estadoDasConsultas(...)` (`lib/estado-consulta`).
 *    Erro à frente da frase é o idioma da casa (`Erro` de
 *    `@/components/estado`), mas a régua cobra a LEITURA do estado, não o
 *    desenho — é o que dá para pregar textualmente sem montar a tela.
 *
 * ## A exceção DITA, com o porquê (S-C163)
 *
 * **Silêncio não é mentira, e não entra na grafia.** `(x.data ?? []).length >
 * 0 && <Card/>` cala o card quando a consulta falha — nada é afirmado, e é o
 * comportamento certo para conteúdo acessório (`conversao.tsx:275`, a tabela
 * das vendedoras). O mesmo vale uma camada abaixo: `locacaoDaNoiva` e
 * `reajustePrevisto` leem a lista silenciada da ficha
 * (`contratosDaNoiva = contratos.data?.itens ?? []`) e devolvem `null` —
 * a linha da locação e o aviso do reajuste somem, não viram frase falsa. Uma
 * frase de fallback ali nasceria mentindo, e o teste no fim deste arquivo
 * PREGA esse silêncio para ele não virar afirmação por refactor bem-intencionado.
 *
 * ## O que esta varredura NÃO faz
 *
 * ✘ Não segue atribuição: `const parcelas = [...(contrato?.parcelas ?? [])]`
 *   seguido de `parcelas.length === 0` fica fora da grafia. O caso vivo é
 *   `contratos/[id].tsx:1048/:1126` ("Nenhuma parcela registrada."), e ele foi
 *   MEDIDO antes de virar exceção (S-C162): a página inteira retorna num
 *   `if (isError)` (`:381`) antes de qualquer frase, e o `GET /contratos/:id`
 *   entrega `parcelas` sempre (`contratos.ts:1162` — `with: { parcelas: true }`)
 *   — a frase não nasce de silêncio ali. Se um dia a derivada vier de consulta
 *   sem guarda, é sítio novo desta classe e entra por sobra, não por regex
 *   que finge seguir data-flow.
 * ✘ Não decide QUAL desenho vai no lugar — só cobra que o estado da consulta
 *   seja lido no arquivo que afirma o vazio dela.
 */

const SRC = join(import.meta.dirname, "..");

/**
 * A grafia da mentira: teste de vazio montado direto sobre a lista silenciada.
 * Captura o nome da consulta — é ele que a exigência confere depois.
 */
const GRAFIA = /\(\s*([A-Za-z_$][\w$]*)\.data(?:\?\.[\w$]+)?\s*\?\?\s*\[\]\s*\)\s*\.length\s*===?\s*0/g;

/** Os testes-de-vazio-sobre-fallback de um TEXTO — exportada para os autotestes. */
export function vaziosSilenciadosNoTexto(texto: string): { consulta: string; linha: number }[] {
  const achados: { consulta: string; linha: number }[] = [];
  for (const m of texto.matchAll(GRAFIA)) {
    achados.push({ consulta: m[1]!, linha: texto.slice(0, m.index).split("\n").length });
  }
  return achados;
}

/**
 * A exigência: o arquivo lê o estado da consulta que ele declara vazia.
 * `estadoDoCard`/`estadoDasConsultas` contam porque a decisão mora lá
 * (E121/S-C120) — o argumento é conferido dentro do parêntese da chamada.
 */
export function consultaOEstado(texto: string, consulta: string): boolean {
  const nome = consulta.replace(/\$/g, "\\$");
  return new RegExp(
    `\\b${nome}\\.isError\\b|estadoDoCard\\([^)]*\\b${nome}\\b|estadoDasConsultas\\([^)]*\\b${nome}\\b`,
  ).test(texto);
}

/** A população da varredura: o fonte versionado de `src/`, sem os testes. */
function arquivosDeTela(): string[] {
  return arquivosVersionados(SRC, ["."]).filter(
    (r) => /\.tsx?$/.test(r) && !r.includes(".test.") && !r.includes("__tests__"),
  );
}

type Sitio = { arquivo: string; consulta: string; linha: number };

function varrer(): { sitios: Sitio[]; denuncias: string[] } {
  const sitios: Sitio[] = [];
  const denuncias: string[] = [];
  for (const arquivo of arquivosDeTela()) {
    const texto = readFileSync(join(SRC, arquivo), "utf8");
    for (const v of vaziosSilenciadosNoTexto(texto)) {
      sitios.push({ arquivo, ...v });
      if (!consultaOEstado(texto, v.consulta)) {
        denuncias.push(
          `${arquivo}:${v.linha} testa o vazio de \`(${v.consulta}.data ?? [])\` sem ler ` +
            `\`${v.consulta}.isError\` — um 500 nessa consulta vira a frase categórica de vazio. ` +
            `Ponha o \`Erro\` de @/components/estado à frente da frase (o idioma da S-C120), ` +
            `ou passe a consulta a estadoDoCard/estadoDasConsultas.`,
        );
      }
    }
  }
  return { sitios, denuncias };
}

const { sitios: SITIOS, denuncias: DENUNCIAS } = varrer();

describe("S-C161 — frase de vazio só depois de a consulta responder", () => {
  it("nenhum teste de vazio sobre lista silenciada fica sem ler o estado da consulta", () => {
    expect(DENUNCIAS).toEqual([]);
  });

  it("a varredura enumera pelo versionamento, e olha para os 196 fontes de tela", () => {
    // Piso, não retrato (critério da S-C46): `git ls-files` devolvendo pouco
    // faria a denúncia vazia por não ter olhado nada. Medido em 2026-08-15: 196.
    expect(arquivosDeTela().length).toBeGreaterThan(140);
  });

  it("o retrato é 2 sítios que testam vazio sobre fallback, e crescer é uma decisão que se escreve", () => {
    // Igualdade, como no retrato da S-C130: o sítio novo desta grafia fica
    // VERMELHO aqui mesmo quando já nasce com `isError` lido — vermelho é onde
    // se escreve por que ele nasceu (e se a frase dele é honesta).
    expect(SITIOS.map((s) => `${s.arquivo}#${s.consulta}`).sort()).toEqual([
      "pages/noivas/conversao.tsx#sazonalidade",
      "pages/reservas/[bloqueioId].tsx#avarias",
    ]);
  });
});

describe("S-C161 — a peneira prova que enxerga, e que não vê o que não é a classe", () => {
  it("acha o sítio da S-C160, na grafia literal da tela", () => {
    expect(vaziosSilenciadosNoTexto(`{(avarias.data ?? []).length === 0 ? (`)).toEqual([
      { consulta: "avarias", linha: 1 },
    ]);
  });

  it("acha o fallback com campo no meio — a grafia da S-C120", () => {
    expect(
      vaziosSilenciadosNoTexto(`{(contratos.data?.itens ?? []).length === 0 && (`),
    ).toEqual([{ consulta: "contratos", linha: 1 }]);
  });

  it("NÃO conta o silêncio — `.length > 0 &&` cala o card e não afirma nada (S-C163)", () => {
    expect(vaziosSilenciadosNoTexto(`{(desempenho.data ?? []).length > 0 && (`)).toEqual([]);
  });

  it("NÃO conta o teste de vazio sobre const derivada — data-flow não se finge com regex", () => {
    expect(vaziosSilenciadosNoTexto(`{parcelas.length === 0 ? (`)).toEqual([]);
  });

  it("a exigência reconhece as três leituras de estado, e reprova a ausência", () => {
    expect(consultaOEstado(`if (avarias.isError) return null;`, "avarias")).toBe(true);
    expect(consultaOEstado(`const e = estadoDoCard(podeVer, avarias);`, "avarias")).toBe(true);
    expect(consultaOEstado(`estadoDasConsultas(atendimentos,\n  avarias)`, "avarias")).toBe(true);
    // O caso que produziu a denúncia real: outra consulta tem `isError`, a
    // denunciada não — foi exatamente o desenho de conversao.tsx antes do fecho.
    expect(consultaOEstado(`q.isError ? x : (avarias.data ?? [])`, "avarias")).toBe(false);
  });
});

describe("S-C163 — o silêncio dos helpers é pregado: lista silenciada vira null, nunca frase", () => {
  it("locacaoDaNoiva sem recorte fica calada — a ausência é silêncio, não linha vazia", () => {
    // A ficha faz `locacaoDaNoiva(locacaoLida.data ?? null)`: a consulta que
    // falhou entrega null, e null aqui é card que NÃO desenha. Uma frase de
    // fallback ("sem retirada marcada") nasceria falsa num 500.
    expect(locacaoDaNoiva(null)).toBeNull();
    expect(locacaoDaNoiva(undefined)).toBeNull();
  });

  it("reajustePrevisto sobre a lista silenciada fica calado — sem contrato ativo não há aviso", () => {
    // `contratosDaNoiva = contratos.data?.itens ?? []` é a MESMA lista da
    // S-C120: quando a consulta falha, o helper recebe [] e devolve null — o
    // aviso de reajuste some em vez de prometer R$ 0,00 de cláusula 17ª.
    expect(
      reajustePrevisto({ contratos: [], deDia: "2027-05-10", paraDia: "2028-05-10" }),
    ).toBeNull();
  });
});
