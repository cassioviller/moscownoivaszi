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
  tipo: "botão" | "recado" | "prosa";
  exibido: string;
  /**
   * Os pedaços que a tela tem de conter — TODOS eles. Um só, igual ao exibido,
   * quando a citação é literal. Vazio quando é fala (não é tela).
   */
  pedacos: string[];
  molde: boolean;
  fala: boolean;
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
function declaracao(atributos: string): { pedacos?: string[]; fala?: string } {
  const tela = /data-tela="([^"]+)"/.exec(atributos)?.[1];
  const fala = /data-fala="([^"]*)"/.exec(atributos)?.[1];
  if (fala !== undefined) return { fala };
  if (tela !== undefined) return { pedacos: tela.split(PEDACOS) };
  return {};
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
    const d = declaracao(atributos);
    return {
      manual,
      linha: linhaDe(html, html.indexOf(`<span class="btn"${atributos}>${exibido}`)),
      tipo: "botão" as const,
      exibido,
      pedacos: d.fala !== undefined ? [] : (d.pedacos ?? [exibido]),
      molde: d.pedacos !== undefined,
      fala: d.fala !== undefined,
    };
  });
}

/** As linhas das tabelas "O recado" — o texto entre aspas curvas da 1ª célula. */
function recados(manual: string): Citacao[] {
  const html = ler(manual);
  const achados: Citacao[] = [];
  for (const tabela of html.matchAll(/<th>O recado<\/th>[\s\S]*?<\/tbody>/g)) {
    for (const linha of tabela[0].matchAll(/<tr><td([^>]*)>“([^”]+)”<\/td>/g)) {
      const exibido = limpar(linha[2]!);
      const d = declaracao(linha[1] ?? "");
      achados.push({
        manual,
        linha: linhaDe(html, tabela.index! + linha.index!),
        tipo: "recado",
        exibido,
        pedacos: d.fala !== undefined ? [] : (d.pedacos ?? [exibido]),
        molde: d.pedacos !== undefined,
        fala: d.fala !== undefined,
      });
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
    const d = declaracao(atributos);
    achados.push({
      manual,
      linha: linhaDe(html, indice),
      tipo: "prosa",
      exibido,
      pedacos: d.fala !== undefined ? [] : (d.pedacos ?? [exibido]),
      molde: d.pedacos !== undefined,
      fala: d.fala !== undefined,
    });
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

function todas(): Citacao[] {
  return manuais().flatMap((m) => {
    const b = botoes(m);
    const r = recados(m);
    const jaColhido = new Set(r.map((c) => c.exibido));
    return [...b, ...r, ...prosa(m, jaColhido)];
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
    // 94 são conferidas LITERALMENTE, sem declaração nenhuma; 60 são molde e
    // 6 são fala.
    expect(citacoes.filter((c) => c.tipo === "prosa").length).toBeGreaterThanOrEqual(160);
    const literais = citacoes.filter((c) => c.tipo === "prosa" && !c.molde && !c.fala);
    expect(literais.length).toBeGreaterThanOrEqual(94);
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
     */
    const citacoes = todas();
    const moldes = citacoes.filter((c) => c.molde);
    expect(moldes.length).toBe(72);

    // O molde tem de ser mais curto que o exibido — senão não é molde, é uma
    // citação literal com um atributo pendurado.
    for (const m of moldes) {
      expect(
        m.pedacos.join("").length,
        `${m.manual}:${m.linha}: «${m.pedacos.join(PEDACOS)}» não encurta «${m.exibido}»`,
      ).toBeLessThan(m.exibido.length);
    }

    /**
     * **A fala é a outra exceção, e é a que o E254 não tinha como declarar.**
     * O `<em>` do manual marca a tela e marca a boca de quem trabalha com a
     * mesma tinta; cobrar da tela o que a recepcionista diz ao telefone seria
     * régua que grita sobre o que está certo. `data-fala="<quem falou>"` sai
     * do recorte, e o motivo fica escrito na linha.
     */
    const falas = citacoes.filter((c) => c.fala);
    expect(falas.length).toBe(6);
    for (const f of falas) {
      expect(f.pedacos, `${f.manual}:${f.linha}: fala não confere pedaço nenhum`).toEqual([]);
    }
  });
});
