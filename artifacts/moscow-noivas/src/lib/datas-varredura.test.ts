import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * D15/E99 — a varredura que impede o fuso implícito de voltar.
 *
 * **Este teste existe porque a primeira varredura do D15 tinha um buraco.** Ela
 * contou `new Intl.DateTimeFormat` e deu o item por fechado — e o mesmo defeito
 * se escreve de outra forma: `new Date(x).toLocaleDateString("pt-BR")`, sem
 * `timeZone`, que era o que dez linhas do app faziam. O `contratos/[id].tsx`
 * mostrava "Fechado em" no relógio de quem abre, exatamente como os três
 * formatadores que o sweep tinha acabado de consertar.
 *
 * A lição vale mais que o conserto: **uma varredura que procura uma grafia
 * declara-se completa e não é.** Agora ela olha as duas.
 */

const RAIZ = join(import.meta.dirname, "..");

/** Onde o fuso do navegador é a resposta certa, e por quê. */
const PERDOADOS = [
  // O calendário do react-day-picker recebe a data que ELE mesmo montou a
  // partir da navegação do mês; não há instante de negócio envolvido.
  "components/ui/calendar.tsx",
];

/**
 * A enumeração sai do versionamento, não do disco (S-D30): `readdirSync` lia
 * qualquer arquivo que estivesse em `src/` fora do git — um `tmp/copia.ts`
 * ignorado reprovava a varredura por código que não é do repositório.
 * Caminhos relativos a `src/`.
 */
function arquivosFonte(): string[] {
  return arquivosVersionados(RAIZ, ["."]).filter(
    (relativo) => /\.tsx?$/.test(relativo) && !relativo.includes(".test."),
  );
}

/**
 * As TRÊS grafias do mesmo defeito. A lista cresceu duas vezes, e é a prova do
 * ponto: a primeira versão olhava só `Intl.DateTimeFormat`; a segunda somou
 * `toLocale*String`; e o `format()` do date-fns — que também lê o relógio do
 * navegador — só apareceu ao mexer no cabeçalho do orçamento, oito call-sites
 * depois de o item ser dado por fechado.
 */
function semFusoExplicito(codigoComComentarios: string): string[] {
  const achados: string[] = [];
  // Comentários fora: eles CITAM o código errado para explicar o conserto, e
  // uma varredura que lê documentação acusa a própria nota de rodapé.
  const fonte = codigoComComentarios
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  // date-fns: `format(x, "HH:mm")` não tem parâmetro de fuso — sempre o local.
  // Só acusa padrões com HORA ou DIA; `format(d, "yyyy-MM")` de competência é
  // outra conversa e não passa por aqui.
  const dateFns = /\bformat\(\s*new Date\([^)]*\)\s*,\s*"([^"]*)"/g;
  let f: RegExpExecArray | null;
  while ((f = dateFns.exec(fonte)) !== null) {
    if (/[Hhdm]/.test(f[1]!)) achados.push(f[0].replace(/\s+/g, " ").slice(0, 90));
  }

  const intl = /new Intl\.DateTimeFormat\(/g;
  let m: RegExpExecArray | null;
  while ((m = intl.exec(fonte)) !== null) {
    let i = m.index + m[0].length;
    let profundidade = 1;
    while (i < fonte.length && profundidade > 0) {
      if (fonte[i] === "(") profundidade++;
      else if (fonte[i] === ")") profundidade--;
      i++;
    }
    const args = fonte.slice(m.index, i);
    if (!args.includes("timeZone")) achados.push(args.replace(/\s+/g, " ").slice(0, 90));
  }

  const toLocale = /\.toLocale(?:Date|Time)?String\(([^;]*?)\)/g;
  while ((m = toLocale.exec(fonte)) !== null) {
    if (!m[1]!.includes("timeZone")) achados.push(m[0].replace(/\s+/g, " ").slice(0, 90));
  }

  // E115 — a QUARTA grafia: getters de calendário do NAVEGADOR. Um "hoje" (ou
  // um dia de instante) montado por getFullYear/getMonth/getDate sem UTC é a
  // meia-noite do aparelho — foi assim que a contagem até o casamento errava
  // toda noite entre 21h e 24h, a grade da semana punha a prova de sexta na
  // coluna de sábado e a ficha do vestido cortava a ocupação no dia errado. A
  // revisão de 59 agentes achou seis; esta linha acha todos. Getter UTC
  // (`getUTCDate` etc.) não casa aqui: data de negócio em UTC é a convenção.
  const getterLocal = /\.get(?:FullYear|Month|Date)\(\)/g;
  while ((m = getterLocal.exec(fonte)) !== null) {
    const ini = Math.max(0, m.index - 40);
    achados.push(fonte.slice(ini, m.index + m[0].length).replace(/\s+/g, " ").slice(-70));
  }

  return achados;
}

describe("D15 — nenhuma data sai no relógio de quem abre", () => {
  it("a régua pega as QUATRO grafias do mesmo defeito", () => {
    expect(semFusoExplicito(`new Intl.DateTimeFormat("pt-BR", { hour: "2-digit" })`)).toHaveLength(1);
    expect(semFusoExplicito(`new Date(x).toLocaleDateString("pt-BR")`)).toHaveLength(1);
    // E115: o getter local — a grafia com que seis lugares liam o calendário
    // do navegador e que as três regras acima não viam.
    expect(semFusoExplicito(`const dia = hoje.` + `getDate();`)).toHaveLength(1);
    expect(semFusoExplicito(`Date.UTC(alvo.` + `getFullYear(), alvo.` + `getMonth())`)).toHaveLength(2);
    // Com o fuso dito (ou o getter UTC), passa em todas.
    expect(
      semFusoExplicito(`new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", hour: "2-digit" })`),
    ).toHaveLength(0);
    expect(
      semFusoExplicito(`new Date(x).toLocaleDateString("pt-BR", { timeZone: "UTC" })`),
    ).toHaveLength(0);
    expect(semFusoExplicito(`casamento.getUTCDate()`)).toHaveLength(0);
  });

  it("nenhum arquivo do app formata data sem dizer o fuso", () => {
    const ofensores: string[] = [];
    for (const relativo of arquivosFonte()) {
      if (PERDOADOS.includes(relativo)) continue;
      for (const trecho of semFusoExplicito(readFileSync(join(RAIZ, relativo), "utf8"))) {
        ofensores.push(`${relativo}: ${trecho}`);
      }
    }
    expect(ofensores).toEqual([]);
  });

  /**
   * Conjunto vazio aprova tudo em silêncio (S-D31). O piso é o medido em
   * 2026-08-07 — 166 arquivos `.ts`/`.tsx` versionados em `src/`, fora os
   * testes — com folga para baixo.
   */
  it("a varredura olha os arquivos de verdade, não um conjunto vazio", () => {
    expect(arquivosFonte().length).toBeGreaterThan(140);
  });
});

/**
 * **S-RM11 — a QUINTA grafia, e ela não é sobre o fuso: é sobre o RELÓGIO
 * PARAR.**
 *
 * As quatro acima pegam a data lida no fuso errado. Esta pega a data lida no
 * fuso certo **uma vez só**: `hojeLocal()` responde certo sempre que é chamado,
 * e um `useMemo` cujas dependências não incluem o dia só o chama quando alguma
 * outra coisa muda. O ateliê abre a tela de manhã e a deixa aberta; a aba
 * atravessa a meia-noite sem render nenhum, e o valor congelado segue sendo o de
 * ontem — a fila de cobrança do painel, os três baldes da agenda e, nas duas
 * telas de carnê, **a data de vencimento da entrada**.
 *
 * O conserto tem ferramenta desde o E256: `useDiaLocal()`
 * (`hooks/use-dia-local.ts`) devolve o dia como STRING e re-renderiza uma vez
 * por virada. String igual é `Object.is` igual, então pôr o dia nas
 * dependências não recalcula nada entre uma virada e outra — é o preço que o
 * E253 temeu e que `sino-virada-do-dia.test.tsx` mediu em 1 execução por 4
 * renders.
 *
 * **A fronteira, escrita para não nascer calada:** esta régua cobra o dia
 * dentro de `useMemo`/`useCallback`, que é a classe da S-RM11. As leituras no
 * CORPO do componente (`useState(hojeLocal())`, `const hoje = hojeLocal()` de
 * render, o `hojeLocal()` de um `onClick`) não passam por aqui: a de estado
 * inicial é o dia em que a pessoa abriu o campo e está certa assim, e a de
 * render se corrige em qualquer render. **A metade dessa fronteira que NÃO se
 * corrige em render nenhum — o dia que vira CHAVE de consulta — virou a régua
 * da S-RM18, o `describe` logo abaixo.**
 */
function telasEComponentes(): string[] {
  return arquivosVersionados(RAIZ, ["pages", "components"]).filter(
    (relativo) => /\.tsx?$/.test(relativo) && !relativo.includes(".test."),
  );
}

/**
 * Comentários viram ESPAÇO em vez de sumir: a acusação nomeia a linha, e um
 * bloco `/** … *\/` de doze linhas apagado deslocaria todo número abaixo dele.
 * Sem isto a régua acusaria a nota de rodapé que explica o conserto — o
 * `sino-notificacoes.tsx:83` cita `hojeLocal()` dentro do próprio docblock que
 * conta por que ele saiu de lá.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, (linha, antes: string) => antes + " ".repeat(linha.length - antes.length));
}

/**
 * Os `hojeLocal()` que moram dentro de um `useMemo`/`useCallback`. O casamento
 * de parênteses é de verdade: uma regex que parasse no primeiro `)` fecharia o
 * memo no `hojeLocal()` mais próximo e a régua leria o bloco errado — em
 * silêncio, que é o pior jeito de uma sonda errar (regra do
 * `campo-id-em-field-array-varredura`).
 */
function diaCongeladoEmMemo(codigoComComentarios: string): number[] {
  const fonte = semComentarios(codigoComComentarios);
  const linhas: number[] = [];
  const abertura = /\buse(?:Memo|Callback)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = abertura.exec(fonte)) !== null) {
    let i = m.index + m[0].length;
    let profundidade = 1;
    while (i < fonte.length && profundidade > 0) {
      if (fonte[i] === "(") profundidade++;
      else if (fonte[i] === ")") profundidade--;
      i++;
    }
    const corpo = fonte.slice(m.index, i);
    const dentro = /hojeLocal\(/g;
    let d: RegExpExecArray | null;
    while ((d = dentro.exec(corpo)) !== null) {
      linhas.push(fonte.slice(0, m.index + d.index).split("\n").length);
    }
  }
  return linhas;
}

describe("S-RM11 — nenhuma tela congela o dia dentro de um `useMemo`", () => {
  it("a régua pega a grafia, e não confunde o memo que termina antes", () => {
    // O caso da S-RM11: o dia lido lá dentro, e ele fora das dependências.
    expect(diaCongeladoEmMemo(`const x = useMemo(() => f(hojeLocal()), [a]);`)).toEqual([1]);
    // O casamento de parênteses de verdade: o memo fecha na linha 1 e a
    // chamada solta da linha 2 é do corpo do componente, não dele.
    expect(
      diaCongeladoEmMemo(`const x = useMemo(() => f(a), [a]);\nconst hoje = hojeLocal();`),
    ).toEqual([]);
    // O dia que chega de FORA (do `useDiaLocal()`) é dependência como as
    // outras — é o conserto, e ele não pode ser acusado.
    expect(diaCongeladoEmMemo(`const x = useMemo(() => f(hoje), [a, hoje]);`)).toEqual([]);
    // E a citação no comentário não é código: o docblock que explica o
    // conserto fala o nome da função que saiu dali.
    expect(
      diaCongeladoEmMemo(`const x = useMemo(() => {\n  // era hojeLocal() aqui\n  return f(hoje);\n}, [hoje]);`),
    ).toEqual([]);
  });

  it("nenhuma tela lê `hojeLocal()` dentro de um `useMemo`", () => {
    const ofensores: string[] = [];
    for (const relativo of telasEComponentes()) {
      for (const linha of diaCongeladoEmMemo(readFileSync(join(RAIZ, relativo), "utf8"))) {
        ofensores.push(`${relativo}:${linha}`);
      }
    }
    /**
     * VERMELHO ANTES (medido no `b8394db2`, com os dez sítios como estavam):
     *
     * ```
     * AssertionError: `hojeLocal()` dentro de um `useMemo` congela o dia … : expected [ …(10) ] to deeply equal []
     * - Expected
     * + Received
     *   Array [
     * +   "pages/atendimentos/index.tsx:224",
     * +   "pages/contratos/[id].tsx:360",
     * +   "pages/dashboard.tsx:244",
     * +   "pages/dashboard.tsx:247",
     * +   "pages/dashboard.tsx:321",
     * +   "pages/mensagens/index.tsx:254",
     * +   "pages/mensagens/index.tsx:260",
     * +   "pages/orcamentos/[id].tsx:540",
     * +   "pages/vestidos/[id].tsx:182",
     * +   "pages/vestidos/[id].tsx:209",
     *   ]
     * ```
     */
    expect(
      ofensores,
      "`hojeLocal()` dentro de um `useMemo` congela o dia no último render: numa aba que " +
        "atravessa a meia-noite a lista fica em ontem, e nas telas de carnê a entrada aparece " +
        "vencendo ONTEM. O dia vem do `useDiaLocal()` e entra nas dependências (S-RM11)",
    ).toEqual([]);
  });

  it("a régua olhou telas de verdade — a população é dita antes da afirmação", () => {
    // S-C46: conjunto vazio aprova tudo. **Medido em 2026-08-17: 128** telas e
    // componentes versionados, fora os testes — e o piso está aqui com folga
    // para baixo. Eu tinha escrito 140 de cabeça e a régua me desmentiu na
    // primeira execução: `expected 128 to be greater than 140`. É o piso do
    // recorte `pages`+`components`, não o dos 166 arquivos de `src/` inteiro
    // que a varredura de fuso acima enumera.
    expect(telasEComponentes().length).toBeGreaterThan(100);
  });
});

/**
 * **S-RM18 — a SEXTA grafia: o dia que vira CHAVE de consulta no corpo da tela.**
 *
 * A quinta pega o dia congelado dentro de um `useMemo`. Esta pega a metade que
 * sobra dela, e a diferença é o que a torna necessária: uma leitura no corpo do
 * componente **se corrige em qualquer render** — só que quando o valor é a
 * `queryKey`, render nenhum acontece. O react-query re-renderiza quando o
 * `.data` muda, e o `.data` não muda porque a chave é a de ontem: a tela fica
 * presa num laço em que a única coisa capaz de soltá-la é o dia, que ela
 * parou de perguntar.
 *
 * **O caso vivo era a `barra-atendimento.tsx:43`** — `{ de: hojeLocal(), ate:
 * hojeLocal() }`, o irmão do sino: ela está em TODA tela, vive na aba que o
 * ateliê deixa aberta o dia inteiro e depois da virada consultava a agenda de
 * ONTEM. O atendimento em curso de hoje não aparecia na barra que existe para
 * mostrá-lo (`barra-atendimento-virada-do-dia.test.tsx` encena a virada).
 *
 * **A fronteira, medida e escrita (a lição do E258, que a declarou e por isso
 * esta régua nasceu):** ela segue **um salto** — o `const` que carrega o
 * `hojeLocal()` e chega, com esse nome, dentro de um `…QueryKey(…)`. A
 * variável que chega à chave por um segundo `const` não passa por aqui, e o
 * caso vivo disso está em `pages/financeiro/projecao.tsx:82`: `const hoje =
 * hojeLocal()` alimenta `janela = { de: ancoraDia, ate: hoje }` (`:91`), que é
 * a chave do `getListPagamentosQueryKey` (`:94`) — a curva do caixa numa aba
 * aberta segue terminando ontem. Está na tabela de Sobras, não aqui: o épico
 * que escreveu esta régua não podia tocar `financeiro/**`, e régua que perdoa
 * defeito vivo é vermelho que vira paisagem (regra 18).
 *
 * A população é a mesma `telasEComponentes()` da S-RM11 acima, e o piso dela
 * vale para as duas.
 */
function diaVirandoChaveDeConsulta(codigoComComentarios: string): number[] {
  const fonte = semComentarios(codigoComComentarios);
  const linhas: number[] = [];
  const linhaDe = (indice: number) => fonte.slice(0, indice).split("\n").length;

  /** Argumentos de cada `…QueryKey(…)`, com casamento de parênteses de verdade. */
  const argumentosDeChave: { texto: string; inicio: number }[] = [];
  const chave = /\b\w*QueryKey\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = chave.exec(fonte)) !== null) {
    let i = m.index + m[0].length;
    let profundidade = 1;
    while (i < fonte.length && profundidade > 0) {
      if (fonte[i] === "(") profundidade++;
      else if (fonte[i] === ")") profundidade--;
      i++;
    }
    argumentosDeChave.push({ texto: fonte.slice(m.index + m[0].length, i), inicio: m.index + m[0].length });
  }

  // O caso sem nome: o dia escrito DENTRO da chave. População zero hoje, e é
  // para que a sexta grafia não nasça pela porta que a régua deixou aberta.
  for (const { texto, inicio } of argumentosDeChave) {
    const direto = /hojeLocal\(/g;
    let d: RegExpExecArray | null;
    while ((d = direto.exec(texto)) !== null) linhas.push(linhaDe(inicio + d.index));
  }

  const nomesNaChave = new Set<string>();
  for (const { texto } of argumentosDeChave) {
    for (const nome of texto.match(/\b[A-Za-z_$][\w$]*\b/g) ?? []) nomesNaChave.add(nome);
  }
  if (nomesNaChave.size === 0) return linhas;

  // `const NOME = …hojeLocal()…;` — a declaração vai até o `;` de profundidade
  // zero, e não até o primeiro que aparecer: um objeto ou um ternário de três
  // linhas no meio faria a régua ler a declaração seguinte.
  const declaracao = /\bconst\s+([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = declaracao.exec(fonte)) !== null) {
    const nome = m[1]!;
    if (!nomesNaChave.has(nome)) continue;
    let i = m.index + m[0].length;
    let profundidade = 0;
    while (i < fonte.length) {
      const c = fonte[i]!;
      if (c === "(" || c === "[" || c === "{") profundidade++;
      else if (c === ")" || c === "]" || c === "}") profundidade--;
      else if (c === ";" && profundidade <= 0) break;
      i++;
    }
    const corpo = fonte.slice(m.index, i);
    const dentro = /hojeLocal\(/g;
    let d: RegExpExecArray | null;
    while ((d = dentro.exec(corpo)) !== null) linhas.push(linhaDe(m.index + d.index));
  }

  return [...new Set(linhas)].sort((a, b) => a - b);
}

describe("S-RM18 — nenhuma tela monta a chave da consulta com o dia parado", () => {
  it("a régua pega a grafia, e não confunde a variável que não chega à chave", () => {
    // O caso da barra: o dia no corpo, e o nome dentro do `…QueryKey(…)`.
    expect(
      diaVirandoChaveDeConsulta(
        `const janela = { de: hojeLocal(), ate: hojeLocal() };\n` +
          `useListAtendimentos(l, janela, { query: { queryKey: getListAtendimentosQueryKey(l, janela) } });`,
      ),
    ).toEqual([1]);
    // O `const hoje = hojeLocal()` que NÃO entra em chave nenhuma é leitura de
    // render, e ela se corrige em qualquer render: não é desta classe.
    expect(
      diaVirandoChaveDeConsulta(`const hoje = hojeLocal();\nreturn <p>{hoje}</p>;`),
    ).toEqual([]);
    // O dia lido num handler, no clique — a exclusão que o E258 escreveu para
    // o `atendimentos/config.tsx:430`, e que a régua tem de respeitar.
    expect(
      diaVirandoChaveDeConsulta(
        `async function desativar() { await listAtendimentos(l, { de: hojeLocal() }); }\n` +
          `useListCabines(l, { query: { queryKey: getListCabinesQueryKey(l) } });`,
      ),
    ).toEqual([]);
    // O conserto não pode ser acusado: o dia chega do `useDiaLocal()`.
    expect(
      diaVirandoChaveDeConsulta(
        `const hoje = useDiaLocal();\nconst janela = { de: hoje };\n` +
          `useListX(l, janela, { query: { queryKey: getListXQueryKey(l, janela) } });`,
      ),
    ).toEqual([]);
    // O dia escrito DENTRO da chave, sem nome nenhum no meio.
    expect(
      diaVirandoChaveDeConsulta(`queryKey: getListXQueryKey(l, { de: hojeLocal() })`),
    ).toEqual([1]);
    // O `;` de profundidade zero: o ternário de três linhas não pode fazer a
    // régua ler a declaração seguinte como se fosse a mesma.
    expect(
      diaVirandoChaveDeConsulta(
        `const params = passadas\n  ? { ate: addDias(hojeLocal(), -1) }\n  : { de: hojeLocal() };\n` +
          `const outro = 1;\nqueryKey: getListXQueryKey(l, params)`,
      ),
    ).toEqual([2, 3]);
    // E o comentário que cita a função não é código.
    expect(
      diaVirandoChaveDeConsulta(
        `// era hojeLocal() aqui\nconst janela = { de: hoje };\nqueryKey: getListXQueryKey(l, janela)`,
      ),
    ).toEqual([]);
  });

  it("nenhuma tela monta a chave da consulta com `hojeLocal()`", () => {
    const ofensores: string[] = [];
    for (const relativo of telasEComponentes()) {
      for (const linha of diaVirandoChaveDeConsulta(readFileSync(join(RAIZ, relativo), "utf8"))) {
        ofensores.push(`${relativo}:${linha}`);
      }
    }
    /**
     * VERMELHO ANTES (medido no `7ff25889`, com os quatro arquivos como
     * estavam). São **7 chamadas de `hojeLocal()` em 6 linhas**: a barra monta
     * `{ de: hojeLocal(), ate: hojeLocal() }` na mesma linha, e a acusação é
     * por linha.
     *
     * ```
     * AssertionError: o dia que vira CHAVE de consulta no corpo da tela não se
     * corrige em render nenhum … : expected [ …(6) ] to deeply equal []
     * - Expected
     * + Received
     *   Array [
     * +   "components/barra-atendimento.tsx:43",
     * +   "pages/atendimentos/novo.tsx:219",
     * +   "pages/atendimentos/novo.tsx:226",
     * +   "pages/noivas/[leadId]/index.tsx:199",
     * +   "pages/provas/index.tsx:43",
     * +   "pages/provas/index.tsx:44",
     *   ]
     * ```
     */
    expect(
      ofensores,
      "o dia que vira CHAVE de consulta no corpo da tela não se corrige em render nenhum: " +
        "o react-query só re-renderiza quando o `.data` muda, e o `.data` não muda porque a " +
        "chave é a de ontem. O dia vem do `useDiaLocal()` (S-RM18)",
    ).toEqual([]);
  });
});
