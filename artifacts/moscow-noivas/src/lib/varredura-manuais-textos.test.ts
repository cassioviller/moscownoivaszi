import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chipsDe, lerDoRepo, manuaisVersionados } from "./manuais-do-repositorio";

/**
 * A régua (c) dos manuais — **o manual promete citar a tela literalmente, e
 * nada cobrava isso.**
 *
 * Cada manual fecha com a mesma frase: *"Os nomes de botão e os recados de erro
 * são citados literalmente da tela — se algum não bater com o que você vê, o
 * manual envelheceu, e vale avisar."* Essa promessa é a razão de o manual ser
 * usável no meio de um atendimento: a vendedora procura na tela o chip que leu
 * aqui. Se o texto divergir, ela procura o que não existe — e desconfia do
 * resto do manual, que é o custo real.
 *
 * As outras duas réguas cobrem o que envelhece SOZINHO:
 * - `varredura-manuais` — o MENU de cada perfil (sidebar × perfis semeados);
 * - `varredura-manuais-prazos` — os NÚMEROS (9 células contra 5 constantes).
 *
 * Faltava a terceira dimensão, e é a maior das três: **146 chips de botão e 35
 * linhas de recado**, todos prosa que ninguém conferia. Um rótulo trocado numa
 * tela não reprovava nada.
 *
 * ## O que a medição achou ao abrir isto (E210)
 *
 * - **100 nomes de botão distintos: 96 batem literalmente**, e 3 são MOLDE em
 *   5 citações — o rótulo é montado com um valor dentro
 *   (`Mover para ${diaMesAno(...)}`), e o manual o cita com um exemplo
 *   preenchido. O quinto foi a PRÓPRIA régua que achou: eu marcara o
 *   `Criar e copiar link` do manual da noiva e esquecera o gêmeo no da
 *   vendedora.
 * - **35 recados: 33 batem, 2 estavam TRUNCADOS** — o manual cortava o fim, e o
 *   fim é justamente a parte que diz o que fazer:
 *   *"…crie uma reserva de casamento."* onde o sistema diz *"…crie uma reserva
 *   de casamento **para vendê-la**."*, e o recado da data do casamento sem o
 *   *"Ajuste a data ou a reserva."*.
 *
 * ## `data-tela`: o molde diz qual é a parte literal
 *
 * Molde e citação literal eram indistinguíveis na marcação, e uma régua que
 * exigisse os 100 reprovaria nos 4 — errar para mais, que é a doença da S-O83.
 * A saída é o autor DECLARAR: `data-tela="Mover para "` diz *"o que a tela tem
 * é este pedaço"*, e a régua confere esse pedaço. Sem `data-tela`, exige-se o
 * texto inteiro.
 *
 * **Enumera com `git ls-files`** (regra da casa).
 */

const RAIZ = path.resolve(__dirname, "../../../..");

function porGit(padroes: string[]): string[] {
  return execFileSync("git", ["ls-files", ...padroes], {
    cwd: RAIZ,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

// S-C271 — a leitura e o enumerador dos manuais vêm de um lugar só. O `porGit`
// acima fica: esta varredura também enumera a TELA (`pages/**`, `routes/**`),
// que não é assunto do módulo dos manuais.
const ler = lerDoRepo;

const manuais = manuaisVersionados;

/* ────────────────────────────────────────────────────────────────────────────
 * S-RM4 — a tela lida como a noiva a lê, e não como o prettier a escreveu
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * **A régua comparava a citação com o CÓDIGO-FONTE CRU, e o JSX parte frases no
 * meio.** Três das 11 declarações do E254 tiveram de escolher um fragmento mais
 * curto do que a frase que a vendedora lê, porque a frase inteira não existe
 * contígua em lugar nenhum. Medido em 17/08, nos três sítios que a sobra nomeia:
 *
 * ```tsx
 * As provas e a movimentação do vestido estão na{" "}   // ajustes/[ajusteId].tsx:273
 * <Link to={…} className="underline">ficha da reserva</Link>.
 *
 * Fora do prazo e <span className="font-medium">sem contrato ativo</span>: a    // contratos/index.tsx:252
 * cláusula 16ª cobra sobre o aluguel de cada peça, e não há de onde tirá-lo.
 *
 * {soContatados} procurada{soContatados === 1 ? "" : "s"}, ainda sem resposta.  // fila-contato.tsx:122
 * ```
 *
 * Nenhuma dessas três frases existe no fonte como o leitor a vê. A primeira é
 * partida por uma tag e por uma quebra de linha; a segunda, por um `<span>` de
 * negrito no meio da oração; a terceira, por um ternário **dentro da palavra**.
 * O `includes` sobre o fonte responde "a tela não tem" sobre frase que a tela
 * tem — e empurra para o molde citação que devia ser literal.
 *
 * **A saída é renderizar o texto do JSX antes de comparar**, aplicando as
 * regras de espaço que o próprio JSX aplica:
 *
 * - `{" "}` é um espaço de verdade e sobrevive;
 * - toda outra chave (`{expr}`, `${expr}`, comentário) é um VALOR: nada
 *   atravessa. Uma expressão no meio da frase continua a partir a citação, e é
 *   isso que faz dela um molde de verdade;
 * - a corrida de brancos que contém quebra de linha some quando encosta numa
 *   tag (é o que o JSX faz) e vira um espaço quando separa dois textos;
 * - **tag colada em tag é barreira, não emenda**: `</p><p>` são dois
 *   parágrafos, e emendá-los inventaria frase que ninguém lê. Só a tag entre
 *   dois textos (`estão na <Link>ficha da reserva</Link>.`) é transparente.
 *
 * **A leitura nova é UNIÃO com a crua, nunca substituição** — o corpus só pode
 * crescer. Uma citação que batia antes continua batendo, e a régua não perde
 * alcance por um erro do renderizador.
 *
 * Medido em 17/08 sobre as **161 citações entre aspas em `<em>`** que o E254
 * contou: **82 batiam no fonte cru, 95 batem na união** — 13 frases que a tela
 * escreve e a régua não enxergava, entre elas *"As provas e a movimentação do
 * vestido estão na ficha da reserva"* e *"Fora do prazo e sem contrato ativo: a
 * cláusula 16ª cobra…"*, esta última um dos três moldes que a S-RM4 nomeia e
 * que voltou a ser citação literal.
 *
 * **O que o renderizador NÃO conserta, e é o terceiro sítio da sobra**: a frase
 * montada por CONCATENAÇÃO de literais diferentes. Em
 * `peca-exclusiva.ts:72-73` o sujeito da oração é escolhido por um ternário
 * (`"é peça exclusiva…"` / `"são peças exclusivas…"`) e só depois emendado ao
 * resto; não há renderização que junte o que o autor escreveu separado, porque
 * o que junta os dois é o valor de `pecas.length`. Continua molde, e é molde
 * de verdade.
 */
const VALOR = "\u0001"; // aqui a tela imprime um valor: nada atravessa
const TAG = "\u0002"; // aqui houve uma tag
const QUEBRA = "\u0003"; // corrida de brancos que continha quebra de linha
const ESPACO = "\u0004"; // o `{" "}` — espaço que o autor escreveu de propósito

function renderizarJsx(fonte: string): string {
  let s = fonte.replace(/\{["'] ["']\}/g, ESPACO);
  // Expressão de UMA linha, sem chave dentro — a forma do JSX e da interpolação.
  // Iterado, resolve de dentro para fora; a exigência de caber numa linha é o
  // que impede de engolir corpo de função e levar junto as frases que ele tem.
  for (let i = 0; i < 12; i++) {
    const antes = s;
    s = s.replace(/\$?\{[^{}\n]*\}/g, VALOR);
    if (s === antes) break;
  }
  // A tag pode ocupar várias linhas (atributos), mas o nome vem colado no `<`:
  // `if (a < b)` não é tag, e `;` nunca aparece dentro de uma.
  s = s.replace(/<\/?[A-Za-z][A-Za-z0-9.]*(?:\s[^<>;]*)?>/g, TAG);
  s = s.replace(/[ \t]*\r?\n[ \t\r\n]*/g, QUEBRA);
  let antes = "";
  while (antes !== s) {
    antes = s;
    s = s.replaceAll(QUEBRA + TAG, TAG).replaceAll(TAG + QUEBRA, TAG);
    s = s.replaceAll(QUEBRA + ESPACO, ESPACO).replaceAll(ESPACO + QUEBRA, ESPACO);
  }
  s = s.replace(new RegExp(`${TAG}{2,}`, "g"), VALOR);
  return s.replaceAll(TAG, "").replaceAll(QUEBRA, " ").replaceAll(ESPACO, " ");
}

/** Fora do JSX só a interpolação parte a frase, e a quebra de linha do prettier. */
function renderizarTs(fonte: string): string {
  return fonte.replace(/\$\{[^{}\n]*\}/g, VALOR).replace(/[ \t]*\r?\n[ \t\r\n]*/g, " ");
}

/**
 * A TELA, em uma corda só: o frontend (onde moram os rótulos de botão) e o
 * servidor (onde moram os recados que a tela repete). Os dois porque o manual
 * não distingue quem escreveu a frase — para quem lê, é tudo "a tela".
 *
 * Duas leituras do mesmo corpus, unidas (S-RM4): o fonte **cru**, que é o que
 * a régua sempre leu, e o fonte **renderizado**, que é o que o leitor vê.
 */
function arquivosDaTela(): string[] {
  return porGit([
    "artifacts/moscow-noivas/src/**/*.tsx",
    "artifacts/moscow-noivas/src/**/*.ts",
    "artifacts/api-server/src/routes/*.ts",
    "artifacts/api-server/src/lib/*.ts",
    "lib/**/*.ts",
  ]).filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));
}

let cache: { cru: string; renderizado: string } | undefined;
function textoDaTela(): { cru: string; renderizado: string } {
  if (cache) return cache;
  const arquivos = arquivosDaTela();
  cache = {
    cru: arquivos.map(ler).join("\n"),
    renderizado: arquivos
      .map((f) => (f.endsWith(".tsx") ? renderizarJsx(ler(f)) : renderizarTs(ler(f))))
      .join(VALOR),
  };
  return cache;
}

const semBranco = (s: string) => s.replace(/\s+/g, " ").trim();

function aTelaTem(pedaco: string): boolean {
  const { cru, renderizado } = textoDaTela();
  return cru.includes(pedaco) || renderizado.includes(semBranco(pedaco));
}

/* ────────────────────────────────────────────────────────────────────────────
 * A colheita
 * ──────────────────────────────────────────────────────────────────────────── */

interface Citacao {
  manual: string;
  linha: number;
  /** Onde a aspa de abertura mora no HTML — é por ele que uma colheita não repete a outra. */
  indice: number;
  tipo: "botão" | "recado" | "prosa" | "rótulo";
  exibido: string;
  /**
   * Os pedaços que a tela tem de conter — TODOS eles. Um só, igual ao exibido,
   * quando a citação é literal. Vazio quando é fala ou grifo (não é tela).
   */
  pedacos: string[];
  molde: boolean;
  fala: boolean;
  grifo: boolean;
}

/**
 * **`data-tela` aceita VÁRIOS pedaços, separados por ` | `, e a régua cobra
 * todos.** Foi a fresta que derrubou a peneira automática do E254: em
 * *"· inclui R$ 15,00 de multa e juros"* o valor mora no MEIO, e uma declaração
 * de um pedaço só deixa o autor escolher a metade que ainda bate. Declarado o
 * par — `"· inclui | de multa, juros e correção"` —, envelhecer qualquer uma
 * das duas metades reprova.
 */
const PEDACOS = " | ";
function declaracao(atributos: string): { pedacos?: string[]; fala?: string; grifo?: string } {
  const tela = /data-tela="([^"]+)"/.exec(atributos)?.[1];
  const fala = /data-fala="([^"]*)"/.exec(atributos)?.[1];
  const grifo = /data-grifo="([^"]*)"/.exec(atributos)?.[1];
  if (fala !== undefined) return { fala };
  if (grifo !== undefined) return { grifo };
  if (tela !== undefined) return { pedacos: tela.split(PEDACOS) };
  return {};
}

/** O que a declaração faz com uma citação, em um lugar só. */
function comADeclaracao(
  base: Omit<Citacao, "pedacos" | "molde" | "fala" | "grifo">,
  atributos: string,
): Citacao {
  const d = declaracao(atributos);
  const foraDaTela = d.fala !== undefined || d.grifo !== undefined;
  return {
    ...base,
    pedacos: foraDaTela ? [] : (d.pedacos ?? [base.exibido]),
    molde: d.pedacos !== undefined && !foraDaTela,
    fala: d.fala !== undefined,
    grifo: d.grifo !== undefined,
  };
}

function limpar(cru: string): string {
  return cru
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const linhaDe = (html: string, indice: number) => html.slice(0, indice).split("\n").length;

/**
 * Os chips `class="btn"`, com o `data-tela` quando o rótulo é montado.
 *
 * S-C271 — a extração do chip saiu daqui e da `varredura-manuais-contradicao`
 * para `manuais-do-repositorio.ts`. Eram duas cópias do mesmo regex com captura
 * diferente (uma pegava os atributos, a outra não), e a diferença não era
 * decisão: era o segundo autor não ter visto o primeiro.
 */
function botoes(manual: string): Citacao[] {
  const html = ler(manual);
  return chipsDe(html).map(({ atributos, rotulo: exibido }) => {
    const indice = html.indexOf(`<span class="btn"${atributos}>${exibido}`);
    return comADeclaracao(
      { manual, linha: linhaDe(html, indice), indice, tipo: "botão", exibido },
      atributos,
    );
  });
}

/** As linhas das tabelas "O recado" — o texto entre aspas curvas da 1ª célula. */
function recados(manual: string): Citacao[] {
  const html = ler(manual);
  const achados: Citacao[] = [];
  for (const tabela of html.matchAll(/<th>O recado<\/th>[\s\S]*?<\/tbody>/g)) {
    for (const linha of tabela[0].matchAll(/<tr><td([^>]*)>“([^”]+)”<\/td>/g)) {
      const indice = tabela.index! + linha.index! + linha[0].indexOf("“");
      achados.push(
        comADeclaracao(
          {
            manual,
            linha: linhaDe(html, tabela.index! + linha.index!),
            indice,
            tipo: "recado",
            exibido: limpar(linha[2]!),
          },
          linha[1] ?? "",
        ),
      );
    }
  }
  return achados;
}

/**
 * **S-RM2 — a prosa citada entra inteira, e o que não é tela DECLARA que não é.**
 *
 * As duas colheitas acima leem lugares fixos da marcação: o chip
 * `<span class="btn">` e a 1ª célula das tabelas *"O recado"*. O E254 abriu uma
 * terceira, definida pelo CONTEÚDO — a citação que nomeia uma cláusula —, e
 * mediu na mesma hora o tamanho do que ficava de fora: **161 fragmentos entre
 * aspas curvas em `<em>` nos cinco manuais, dos quais 82 batiam com a tela e 79
 * não; a família das cláusulas cobria 13.** O `docs/manuais/vendedora.html:800`
 * era a prova viva: frase de sistema, envelhecida pelo E248, corrigida à mão no
 * E254, e nenhuma régua olhando para ela.
 *
 * A colheita agora é **toda citação entre aspas curvas dentro de um `<em>`**,
 * mais a família das cláusulas em qualquer tag. É recorte de MARCAÇÃO, não de
 * conteúdo: não há como citar uma frase de tela em `<em>` e ficar de fora.
 *
 * **A conta de 161 para 160, para ninguém a refazer**: as 161 citações em
 * `<em>` menos **3** que repetem, palavra por palavra, uma célula das tabelas
 * *"O recado"* (*"Sua sessão expirou. Entre de novo."*, *"Esse horário não está
 * livre"*, *"A proposta não tem nenhum item…"*) — conferi-las duas vezes seria
 * só uma segunda chance de errar —, mais **2** citações que nomeiam cláusula e
 * moram fora de qualquer `<em>` (`proprietario.html:505`, num `<p>`, e
 * `vendedora.html`, o rótulo do campo da 18ª).
 *
 * **E o `<em>` é ambíguo de propósito — o manual usa a mesma marca para a tela
 * e para a boca de quem trabalha.** Medido: a recepcionista dizendo
 * *"vou confirmar com a vendedora e já te retorno"* (`recepcao.html:588`), a
 * costureira dizendo *"esta eu preciso pronta no dia 10"*
 * (`proprietario.html:820`), o conselho velho que o manual desaconselha
 * (*"conferir Todos uma vez por semana para não perder nada"*,
 * `costureira.html:405`). Cobrar essas da tela seria régua que grita sobre o
 * que está certo, e régua que grita se desliga.
 *
 * Por isso a exceção é DECLARADA e o padrão FECHA: sem declaração, exige-se a
 * frase inteira na tela. `data-fala="<quem falou>"` diz *"isto não é tela"*, e
 * a contagem de falas está travada — não se silencia uma citação por
 * distração. Foi o que faltou ao E254 para poder alargar: ele mediu os 79 e
 * escreveu que separá-los pedia *"um mecanismo de declaração novo para a
 * categoria 'isto não é tela'"*. É este.
 */
const CITA_CLAUSULA = /cláusula\s+\d+ª|\(\d+ª\)/i;

function prosa(manual: string, jaColhido: Set<string>): Citacao[] {
  const html = ler(manual);
  const achados: Citacao[] = [];
  const visto = new Set<number>();

  const registrar = (indice: number, atributos: string, cru: string) => {
    if (visto.has(indice)) return;
    visto.add(indice);
    const exibido = limpar(cru);
    if (jaColhido.has(exibido) || jaColhido.has(cru.trim())) return;
    achados.push(
      comADeclaracao({ manual, linha: linhaDe(html, indice), indice, tipo: "prosa", exibido }, atributos),
    );
  };

  // (a) toda aspa curva dentro de um <em>
  for (const em of html.matchAll(/<em([^>]*)>([\s\S]*?)<\/em>/g)) {
    const corpo = em[2]!;
    for (const q of corpo.matchAll(/“([^”]+)”/g)) {
      registrar(em.index! + em[0].indexOf(corpo) + q.index!, em[1] ?? "", q[1]!);
    }
  }

  // (b) a família do E254: a citação que NOMEIA uma cláusula, em qualquer tag.
  // A prosa do manual cita as cláusulas SEM aspas curvas; o que aparece entre
  // aspas *e* nomeia uma cláusula é, por construção, frase que o sistema imprime.
  for (const q of html.matchAll(/“([^”]+)”/g)) {
    if (!CITA_CLAUSULA.test(limpar(q[1]!))) continue;
    const antes = html.slice(0, q.index!);
    const abre = [...antes.matchAll(/<([a-z]+)((?:[^>"]|"[^"]*")*)>/gi)].at(-1);
    registrar(q.index!, abre?.[2] ?? "", q[1]!);
  }

  return achados;
}

/* ────────────────────────────────────────────────────────────────────────────
 * S-RM15 — a citação que tem CASA entra na régua; a que flutua na prosa não tem
 * onde declarar, e o critério é esse
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * **As 466 aspas curvas dos cinco manuais, separadas por um critério de
 * MARCAÇÃO — e o critério é onde a declaração mora.**
 *
 * O E255 fechou a S-RM2 abrindo o `<em>` inteiro e mediu, na saída, o que
 * sobrava: **466 citações entre aspas curvas nos cinco manuais, 213 na régua,
 * 253 fora**. A S-RM15 nasceu daí com uma pergunta que ninguém tinha
 * respondido: *quantas dessas 253 são citação de tela e quantas são o manual
 * grifando o próprio vocabulário?*
 *
 * **Medido em 17/08, com a mesma máquina de comparação da régua** (a união do
 * fonte cru com o renderizado): das 250 que ficam de fora com texto próprio,
 * **203 já existem na tela literalmente** e 47 não. A premissa da sobra — *"boa
 * parte é ênfase de escrita, não citação de tela"* — está errada para MENOS:
 * a maioria é citação de verdade, e o custo de trazê-la é declarar as 47.
 *
 * **O que separa as que entram das que ficam é onde a DECLARAÇÃO pode morar.**
 * Uma citação declarada é um atributo numa tag; a tag é a unidade. Então:
 *
 * - **a citação com CASA** — a aspa curva é o conteúdo INTEIRO de um `<strong>`,
 *   `<b>`, `<td>`, `<h2>`–`<h4>`, `<p>` ou `<li>`: a tag é dela, o atributo é
 *   dela, e a régua cobra. São **136**, e 115 já batiam sem declaração nenhuma;
 * - **a citação SOLTA na prosa** — três, quatro, oito aspas dentro do mesmo
 *   `<p>`: um `data-tela` ali declararia por TODAS, e silenciar sete para
 *   declarar uma é pior régua do que não cobrar nenhuma. São **114**, e ficam
 *   de fora **por não haver onde declarar**, não por serem menos citação.
 *
 * A separação das 114 está contada no relatório do E259 (88 já batem; das 26
 * que não batem, 10 são molde com valor no meio, 8 são fala e 8 são o manual
 * parafraseando um rótulo). Trazê-las exigiria envolver cada uma num `<span>`
 * próprio dentro do parágrafo — mudança de marcação, não de régua, e é o
 * trabalho que esta colheita deixa nomeado em vez de escondido.
 *
 * **A colheita nova achou três frases envelhecidas na primeira execução**, e
 * as três moravam onde régua nenhuma olhava:
 * `vendedora.html:803` citava o diálogo como *"Perdoar multa e juros"* quando
 * `contratos/[id].tsx:1341` diz *"Perdoar multa, juros e correção"* — é a mesma
 * renomeação do E248 que produziu o caso do `vendedora.html:800`, escondida num
 * `<strong>`; `proprietario.html:347` e `recepcao.html:382` fechavam com ponto
 * final o que `alerta-caixa.tsx:96` e `agenda/index.tsx:84` escrevem sem ele.
 */
const CITACAO_COM_CASA = /<(strong|b|td|h1|h2|h3|h4|p|li)((?:[^>"]|"[^"]*")*)>\s*“([^”]+)”\s*<\/\1>/g;

function rotulos(manual: string, tomados: Set<number>): Citacao[] {
  const html = ler(manual);
  const achados: Citacao[] = [];
  for (const m of html.matchAll(CITACAO_COM_CASA)) {
    const indice = m.index! + m[0].indexOf("“");
    if (tomados.has(indice)) continue;
    achados.push(
      comADeclaracao(
        { manual, linha: linhaDe(html, indice), indice, tipo: "rótulo", exibido: limpar(m[3]!) },
        m[2] ?? "",
      ),
    );
  }
  return achados;
}

function todas(): Citacao[] {
  return manuais().flatMap((m) => {
    const b = botoes(m);
    const r = recados(m);
    const jaColhido = new Set(r.map((c) => c.exibido));
    const p = prosa(m, jaColhido);
    const tomados = new Set([...r, ...p].map((c) => c.indice));
    return [...b, ...r, ...p, ...rotulos(m, tomados)];
  });
}

describe("varredura — o manual cita a tela LITERALMENTE (E210)", () => {
  it("a varredura tem o que varrer — piso de população", () => {
    // Regra 34: sem piso, renomear a classe do chip deixaria tudo verde por
    // vacuidade, e a régua passaria a atestar o que não olha.
    const citacoes = todas();
    expect(manuais().length).toBe(5);
    expect(citacoes.filter((c) => c.tipo === "botão").length).toBeGreaterThanOrEqual(140);
    expect(citacoes.filter((c) => c.tipo === "recado").length).toBeGreaterThanOrEqual(35);
    // S-RM2: a prosa citada em `<em>` mais a família das cláusulas — **160
    // citações medidas em 17/08, contra as 13 que o E254 alcançava**. Delas,
    // 95 são conferidas LITERALMENTE, sem declaração nenhuma; 59 são molde e
    // 6 são fala. (O E259 devolveu uma ao literal: o `vendedora.html:949`
    // maiusculava o `c` de *"confirme com ela antes do horário"*, que é palavra
    // do MEIO da oração em `prova-orfa.ts:77` — corrigida a letra, a declaração
    // saiu.)
    expect(citacoes.filter((c) => c.tipo === "prosa").length).toBeGreaterThanOrEqual(160);
    const literais = citacoes.filter((c) => c.tipo === "prosa" && !c.molde && !c.fala);
    expect(literais.length).toBeGreaterThanOrEqual(95);

    // S-RM15: a citação com CASA — a aspa curva que é o conteúdo inteiro de um
    // `<strong>`, `<b>`, `<td>`, `<h*>`, `<p>` ou `<li>`. **136 medidas em
    // 17/08**, das quais **115 batiam com a tela sem declaração nenhuma antes
    // deste épico e 118 batem depois** — as três a mais são as três frases que
    // a colheita achou ENVELHECIDAS e cuja letra foi corrigida no manual. Das
    // 18 que restam, 8 são molde, 4 são fala e 6 são grifo. As 114 que sobram
    // flutuam dentro de parágrafos com outras aspas e não têm onde declarar —
    // estão contadas e separadas no relatório do E259, não esquecidas.
    expect(citacoes.filter((c) => c.tipo === "rótulo").length).toBeGreaterThanOrEqual(136);
    const rotulosLiterais = citacoes.filter(
      (c) => c.tipo === "rótulo" && !c.molde && !c.fala && !c.grifo,
    );
    expect(rotulosLiterais.length).toBeGreaterThanOrEqual(118);
  });

  it("todo botão, todo recado e toda citação de prosa existem na tela", () => {
    const divergem = todas().flatMap((c) =>
      c.pedacos
        .filter((p) => !aTelaTem(p))
        .map(
          (p) =>
            `${c.manual}:${c.linha} · ${c.tipo}${c.molde ? " (molde)" : ""}: «${p}»` +
            (c.molde ? `\n      dentro de «${c.exibido}»` : ""),
        ),
    );

    expect(
      [...new Set(divergem)],
      `o manual cita o que a tela não tem:\n${[...new Set(divergem)].join("\n")}`,
    ).toEqual([]);
  });

  it("molde é a exceção declarada, e continua sendo exceção", () => {
    /**
     * Se os moldes crescerem, a promessa "citamos literalmente" vira letra
     * morta sem ninguém decidir isso. Seis era o que a medição do E210 achou:
     * 5 chips de botão (3 rótulos distintos) e 1 recado. **E224 subiu para 9**
     * (os recados das cláusulas 4ª e 8ª §único são montados com a CONFIGURAÇÃO
     * da loja dentro), **S-C213 para 11** (o carnê depois do prazo e a peça
     * fora do rol), **E248 para 12** (a qualificação termina na LISTA dos
     * campos que faltam), **S-R15 para 23** (a família das cláusulas estreou
     * com 11 declarações de uma vez).
     *
     * **S-RM2/S-RM4 sobe para 72, e o salto é o preço de abrir a prosa
     * inteira.** A colheita de prosa passou de 13 citações para 160; delas,
     * **94 batem com a tela LITERALMENTE** — sem declaração nenhuma, medido em
     * 17/08 já com a leitura renderizada da S-RM4 —, 60 são molde e 6 são
     * fala. Molde aqui não é frouxidão nova: é a mesma frase que já estava no
     * manual e que régua nenhuma conferia; o que muda é que agora ela tem um
     * pedaço declarado, e esse pedaço é cobrado. Daqui para a frente a
     * contagem só se mexe com decisão escrita.
     *
     * **Um molde velho VIROU literal** com a leitura renderizada, e é um dos
     * três sítios que a S-RM4 nomeia: `vendedora.html:701` citava
     * *"Fora do prazo e sem contrato ativo: a cláusula 16ª cobra…"* e só podia
     * declarar do `cláusula 16ª` em diante, porque um `<span>` de negrito
     * partia a oração no meio (`contratos/index.tsx:252`). A frase inteira
     * passou a ser conferida, e a declaração saiu.
     *
     * **Duas citações não têm o que conferir, e estão nomeadas em vez de
     * escondidas**: `recepcao.html:432` (*"Ana Paula → Cabine 2, 14:30"*, o
     * aviso do reagendar — `agenda/grade.tsx:202` monta a linha inteira com
     * dados, e o único texto fixo é a seta) e `costureira.html:355`
     * (*"2/5 peças"*, `ajustes/index.tsx:284`). Declarar o pouco que existe é
     * pior régua do que declarar o muito, e é melhor régua do que calar.
     *
     * **S-RM15 leva a conta de 72 para 79, e o saldo tem dois sinais.** A
     * colheita das citações COM CASA trouxe 136 citações novas e **8** delas
     * são molde: a data do aceite no portal (`noiva.html:330`), a faixa da
     * avaria (`proprietario.html:497`), o quadro do fechamento (`:596`), o
     * passo 3 da folha (`:615`), o expurgo (`:720`), a proposta vencida
     * (`vendedora.html:528`), a peça sem reserva (`:555`) e a janela da 4ª
     * (`:567`). **E uma saiu**: o `vendedora.html:949` deixou de ser molde
     * porque a letra do manual foi corrigida (S-RM16), não porque a régua
     * afrouxou. 72 − 1 + 8 = 79.
     *
     * **Este número foi publicado errado uma vez, e a trava o pegou**: escrevi
     * 81 somando de cabeça (contei duas vezes o `:596` e somei o
     * `proprietario.html:711`, que é `<em>` e já estava nos 72). `expected 79
     * to be 81` — é a regra 36 numa varredura, e é para isso que a contagem
     * fica travada em vez de derivada.
     *
     * **Duas declaram MUITO pouco, e estão nomeadas como as duas do E255**:
     * `proprietario.html:596` cita *"Fechar agosto de 2026"* e o único texto
     * fixo de `financeiro/folha.tsx:491` é `Fechar `; e o passo 3 do mesmo
     * manual (`:615`) tem de partir a frase em três porque o plural do
     * `folha.tsx:524` é montado duas vezes dentro dela.
     */
    const citacoes = todas();
    const moldes = citacoes.filter((c) => c.molde);
    expect(moldes.length).toBe(79);

    // O molde tem de ser mais curto que o exibido — senão não é molde, é uma
    // citação literal com um atributo pendurado.
    for (const m of moldes) {
      expect(
        m.pedacos.join("").length,
        `${m.manual}:${m.linha}: «${m.pedacos.join(PEDACOS)}» não encurta «${m.exibido}»`,
      ).toBeLessThan(m.exibido.length);
    }

    /**
     * **S-RM14 — a fresta do molde de UM pedaço, medida três vezes e fechada
     * com a contagem, porque a máquina não separa.**
     *
     * Um `data-tela` de um pedaço só deixa o autor escolher a metade da frase
     * que ainda bate e calar a que envelheceu. Os três cenários do E255 foram
     * remedidos em 17/08 sobre esta régua, com o `vendedora.html:800`
     * recolocado na forma anterior ao E254 (*"· inclui R$ 15,00 de multa e
     * juros"*, quando `contratos/[id].tsx` já dizia *"multa, juros e
     * correção"*): **sem declaração reprova** (`prosa: «· inclui R$ 15,00 de
     * multa e juros»`), **com os dois pedaços reprova pela metade envelhecida**
     * (`prosa (molde): «de multa e juros»`) e **com um pedaço só passa**
     * (`Tests 4 passed`). A fresta é real e continua aberta.
     *
     * **E o critério automático foi TENTADO e medido, não descartado por
     * opinião.** A regra candidata — *"os pedaços declarados cobrem todo o
     * texto do exibido que não pareça valor"* (número, dinheiro, data, hora,
     * percentual, reticência) — reprovaria **41 dos 79 moldes de hoje**, mais
     * da metade. O que sobra nesses 41 não é descuido: é nome de exemplo
     * (*Ana Paula*, *Maria*, *Marfim*), dia da semana e mês por extenso
     * (*terça a sexta*, *agosto*), e texto fixo que mora do outro lado de uma
     * interpolação que o renderizador barra por construção. **Régua que grita
     * sobre 41 acertos para pegar 1 erro se desliga** — é a regra 34 pelo
     * avesso, e é a mesma conclusão a que o E255 chegou, agora com o número.
     *
     * **O guarda que existe é a contagem, e ela fica travada em dois níveis**:
     * o total de moldes (acima) e o subconjunto perigoso aqui. Molde novo de um
     * pedaço só não entra por distração — entra por decisão escrita, e quem
     * escrever a decisão tem de olhar a frase inteira para justificá-la. É o
     * precedente da S-CF3, fechada por decisão em 16/08.
     */
    const umPedaco = moldes.filter((m) => m.pedacos.length === 1);
    expect(umPedaco.length).toBe(49);

    /**
     * **A fala é a outra exceção, e é a que o E254 não tinha como declarar.**
     * O `<em>` do manual marca a tela e marca a boca de quem trabalha com a
     * mesma tinta; cobrar da tela o que a recepcionista diz ao telefone seria
     * régua que grita sobre o que está certo. `data-fala="<quem falou>"` sai
     * do recorte, e o motivo fica escrito na linha.
     *
     * **S-RM15 leva de 6 para 10.** As quatro novas são títulos de seção que
     * são a PERGUNTA da noiva, não um texto de tela: *"Por que o valor
     * subiu?"*, *"Que dia eu devolvo o vestido?"* e o *"Traga hoje."* que a
     * recepcionista responde (`recepcao.html:622, 627, 637`), mais *"Que dia eu
     * busco o vestido?"* (`vendedora.html:402`).
     */
    const falas = citacoes.filter((c) => c.fala);
    expect(falas.length).toBe(10);
    for (const f of falas) {
      expect(f.pedacos, `${f.manual}:${f.linha}: fala não confere pedaço nenhum`).toEqual([]);
    }

    /**
     * **O grifo é a terceira exceção, e é a que a S-RM15 obrigou a nomear.**
     * Fora do `<em>`, a aspa curva do manual serve a mais de um dono: ela cita
     * a tela, ela cita a boca de quem trabalha — e ela grifa o vocabulário do
     * PRÓPRIO manual. As seis são de três famílias, e nenhuma é frase que a
     * tela escreva: o gesto da noiva nomeado pelo manual (*"aceitar duas
     * vezes"*, *"avisar duas vezes"* — `noiva.html:587`), o dado semeado na
     * instalação de exemplo (*"Rua das Noivas, 123"* — `proprietario.html:706`)
     * e as três coisas que **este manual dizia antes** e deixaram de ser
     * verdade (`recepcao.html:689-691`).
     *
     * **A razão é obrigatória e é cobrada**: `data-grifo=""` não silencia nada.
     * É a diferença entre declarar e calar — quem reabrir a contagem lê por que
     * cada uma saiu, na própria linha do manual.
     */
    const grifos = citacoes.filter((c) => c.grifo);
    expect(grifos.length).toBe(6);
    for (const g of grifos) {
      expect(g.pedacos, `${g.manual}:${g.linha}: grifo não confere pedaço nenhum`).toEqual([]);
    }
  });

  it("toda declaração de grifo diz POR QUE aquilo não é tela", () => {
    // Regra 34 pelo avesso: um `data-grifo` vazio seria a S-C46 aplicada à
    // declaração — parece cobertura e não é. A razão fica no atributo, e a
    // régua a cobra.
    const html = manuais().map((m) => [m, ler(m)] as const);
    const vazias = html.flatMap(([manual, texto]) =>
      [...texto.matchAll(/data-grifo="([^"]*)"/g)]
        .filter((m) => m[1]!.trim().length < 20)
        .map((m) => `${manual}:${linhaDe(texto, m.index!)} · data-grifo="${m[1]}"`),
    );
    expect(vazias, `grifo sem razão escrita:\n${vazias.join("\n")}`).toEqual([]);
  });
});
