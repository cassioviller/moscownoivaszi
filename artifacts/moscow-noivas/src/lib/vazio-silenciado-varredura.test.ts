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
 * ## A segunda grafia — a DERIVADA (S-C250/S-C251)
 *
 * O parágrafo abaixo dizia *"não segue atribuição"*, e a S-C250 mediu quanto
 * isso custava: **20 atribuições da forma `const X = …consulta.data ?? []…`
 * seguidas de `X.length === 0`, cinco delas sem estado lido.** A sobra falava
 * em 10 e 2 — as duas medidas eram metade, porque a sobra achou os sítios
 * lendo dois arquivos e a varredura lê 197.
 *
 * Os quatro que mentiam, consertados no mesmo commit da grafia:
 *
 * - `ajustes/nova-confeccao.tsx` — *"Esta noiva ainda não tem atendimento
 *   nenhum"*, mandando marcar um que pode já existir;
 * - `noivas/[leadId]/lookbook.tsx` — *"Nenhum vestido ativo encontrado."*;
 * - `atendimentos/novo.tsx` (cabines) — mandava **cadastrar uma cabine** numa
 *   loja que pode ter cinco;
 * - `atendimentos/novo.tsx` (bloqueios) — o mais caro: o ramo do zero não
 *   afirma só, ele **OFERECE criar a reserva** (E65). Um 500 dizia *"Esta
 *   noiva ainda não tem reserva de casamento — crie agora"* sobre noiva que já
 *   tem a peça presa, e o clique seguinte prenderia uma segunda.
 *
 * **A decisão da S-C251 é EMBUTIR, e ela se apoia num número:** a grafia
 * derivada acha 5 e erra 1. O erro é `dashboard.tsx` — `aceitosParados.length
 * === 0` é um `return 0` dentro de um `useMemo`, não um ramo de frase, e o card
 * que consome aquilo silencia (`:421`, `length > 0 ? … : null`). Ele entra como
 * **exceção nomeada com o motivo**, no molde de `conversao.tsx:275`: um em
 * cinco é o preço declarado de fingir data-flow com regex, e ele é menor que o
 * preço de deixar a classe fora da régua — que foi de quatro frases falsas
 * vivas, duas delas com gesto pendurado.
 *
 * ## O que esta varredura NÃO faz
 *
 * ✘ Não segue atribuição ATRAVÉS de arquivo, nem através de função: só o par
 *   `const X = …data ?? []` + `X.length === 0` no MESMO texto. A cadeia de dois
 *   saltos fica fora, e é decisão dita — o terceiro salto seria um parser.
 * ✘ Não distingue ramo-de-frase de guarda interna: é exatamente o falso
 *   positivo do `dashboard.tsx` acima. Por isso a lista de exceções pede
 *   MOTIVO, e não só nome.
 * ✘ A exceção medida da grafia direta continua valendo:
 *   `contratos/[id].tsx:1048/:1126` ("Nenhuma parcela registrada.") foi MEDIDO
 *   antes de virar exceção (S-C162) — a página inteira retorna num
 *   `if (isError)` (`:381`) e o `GET /contratos/:id` entrega `parcelas` sempre
 *   (`with: { parcelas: true }`); a frase não nasce de silêncio ali. Ele não
 *   cai na grafia derivada porque a lista vem de `contrato?.parcelas`, e não de
 *   `consulta.data ?? []`.
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
 * S-C250/S-C251 — a segunda grafia: a lista silenciada é BATIZADA numa linha e
 * o vazio dela testado em outra. `const dela = [...(atendimentos.data ?? [])]`
 * lá em cima, `dela.length === 0` no meio do JSX.
 *
 * Só o par no MESMO texto, e só quando o nome batizado é depois testado a zero
 * — é o que dá para afirmar sem parser. O que isso NÃO alcança está dito no
 * cabeçalho, com o falso positivo medido.
 */
const GRAFIA_DERIVADA =
  /\bconst\s+([A-Za-z_$][\w$]*)\s*=[^;]*?\b([A-Za-z_$][\w$]*)\.data(?:\?\.[\w$]+)?\s*\?\?\s*\[\]/g;

export function vaziosDerivadosNoTexto(texto: string): { consulta: string; linha: number }[] {
  const achados: { consulta: string; linha: number }[] = [];
  for (const m of texto.matchAll(GRAFIA_DERIVADA)) {
    const derivada = m[1]!.replace(/\$/g, "\\$");
    // O batismo só interessa se o nome for testado a zero em algum lugar do
    // mesmo arquivo — senão é lista que se percorre, não vazio que se afirma.
    if (!new RegExp(`\\b${derivada}\\.length\\s*===?\\s*0`).test(texto)) continue;
    achados.push({ consulta: m[2]!, linha: texto.slice(0, m.index).split("\n").length });
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

/**
 * S-C251 — as exceções da grafia DERIVADA, cada uma com o motivo medido.
 *
 * A grafia derivada não distingue ramo-de-frase de guarda interna; quem cai
 * aqui é quem foi CONFERIDO e não afirma nada falso. Nome sem motivo não entra.
 */
const SILENCIOS_DECLARADOS: Record<string, string> = {
  "pages/dashboard.tsx#aceitosQuery":
    "o `aceitosParados.length === 0` é um `return 0` dentro do useMemo do " +
    "`idadeMaisAntigo`, não um ramo de frase — e o card que o consome SILENCIA " +
    "(`:421`, `length > 0 ? … : null`). Um 500 apaga o card; nada é afirmado. " +
    "É a exceção da S-C163 (silêncio não é mentira) do outro lado da atribuição.",
};

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
    for (const v of vaziosDerivadosNoTexto(texto)) {
      if (consultaOEstado(texto, v.consulta)) continue;
      if (SILENCIOS_DECLARADOS[`${arquivo}#${v.consulta}`]) continue;
      denuncias.push(
        `${arquivo}:${v.linha} batiza \`${v.consulta}.data ?? []\` e testa o vazio do nome ` +
          `sem ler \`${v.consulta}.isError\` — um 500 nessa consulta vira a frase categórica de ` +
          `vazio, e o ramo do zero costuma OFERECER criar o que já existe (S-C250). Ponha o ` +
          `\`Erro\` de @/components/estado à frente, ou — se aquele ramo silencia em vez de ` +
          `afirmar — declare a exceção COM O MOTIVO em SILENCIOS_DECLARADOS.`,
      );
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

  it("NÃO conta o teste de vazio sobre const derivada — a grafia DIRETA ignora, e é a derivada que a pega", () => {
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

describe("S-C250/S-C251 — a grafia DERIVADA prova que enxerga o que a direta perdia", () => {
  it("acha o sítio da confecção, na grafia literal da tela", () => {
    // O par que viveu solto: o batismo com spread + sort numa linha, o teste
    // de vazio ~90 linhas abaixo, dentro do JSX.
    const texto = [
      `const dela = [...(atendimentos.data ?? [])].sort((a, b) => 0);`,
      `) : dela.length === 0 ? (`,
    ].join("\n");
    expect(vaziosDerivadosNoTexto(texto)).toEqual([{ consulta: "atendimentos", linha: 1 }]);
  });

  it("acha o batismo dentro de useMemo, com filtro no meio — o sítio do lookbook", () => {
    const texto = [
      `const lista = (vestidos.data ?? []).filter((v) => v.status === "ativo");`,
      `) : lista.length === 0 ? (`,
    ].join("\n");
    expect(vaziosDerivadosNoTexto(texto)).toEqual([{ consulta: "vestidos", linha: 1 }]);
  });

  it("NÃO conta o batismo cujo nome ninguém testa a zero — lista que se percorre não afirma vazio", () => {
    const texto = [
      `const linhas = (trilha.data ?? []).map((t) => t.id);`,
      `{linhas.map((l) => <li key={l} />)}`,
    ].join("\n");
    expect(vaziosDerivadosNoTexto(texto)).toEqual([]);
  });

  it("NÃO conta o `> 0` — o silêncio da S-C163 continua fora, também na derivada", () => {
    const texto = [
      `const parados = aceitosQuery.data ?? [];`,
      `{parados.length > 0 ? (<Card/>) : null}`,
    ].join("\n");
    expect(vaziosDerivadosNoTexto(texto)).toEqual([]);
  });

  it("toda exceção declarada traz o MOTIVO, não só o nome", () => {
    // A lição da S-C130 aplicada à lista de exceções: nome sem motivo é a
    // dívida que ninguém revisa. O piso é generoso de propósito — o que se
    // exige é uma frase, não uma etiqueta.
    for (const [chave, motivo] of Object.entries(SILENCIOS_DECLARADOS)) {
      expect(chave, "a chave é `arquivo#consulta`").toMatch(/^[^#]+#[^#]+$/);
      expect(motivo.length, `${chave} foi declarado sem motivo escrito`).toBeGreaterThan(80);
    }
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
