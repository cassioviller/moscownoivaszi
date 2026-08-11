import ts from "typescript";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * O ENUMERADOR das portas de escrita nas quatro tabelas quentes (E171).
 *
 * A varredura que consome este arquivo é `varredura-portas-sob-tranca.test.ts`;
 * aqui mora só a enumeração, que é o que decide a qualidade da régua. As quatro
 * varreduras anteriores de tranca — S-M7, S-M18, S-M22, S-M24 — **acertaram o
 * padrão e erraram o alcance**: a revisão da ótica dos papéis mediu 14 portas
 * abertas DEPOIS delas. Uma régua que não enxerga nasce verde, e verde por não
 * ter olhado é o pior resultado possível: ela AUTORIZA.
 *
 * Por isso a enumeração não é `grep`:
 *
 * - `grep -n "\.update(contratosTable"` acha a linha e **não sabe** se ela está
 *   dentro de `db.transaction`, se o receptor é o `tx` daquela transação ou o
 *   `db` do pool, se há `FOR UPDATE` antes, nem o que o `where` da escrita
 *   carrega. Todas as quatro perguntas são estruturais.
 * - A população sai de `git ls-files` (S38/S-D30). Em 2026-08-06 dois worktrees
 *   órfãos deixaram 1,04 GB no disco e uma varredura ingênua lia **4.791
 *   arquivos onde havia 1.681** — 65% do que o disco devolvia era cópia. Este
 *   agente roda dentro de `.claude/worktrees/`, que é exatamente o lugar.
 *
 * ## O que é uma porta
 *
 * Uma chamada `X.insert(T)`, `X.update(T)` ou `X.delete(T)` onde `T` é uma das
 * quatro tabelas quentes — `bloqueio_vestidos`, `reservas`, `contratos`,
 * `orcamentos`. São as quatro em que uma corrida perdida custa peça prometida
 * duas vezes ou dinheiro preso no caixa.
 *
 * ## As três disciplinas que a varredura aceita
 *
 * **TRANCA** — a escrita roda dentro de `db.transaction`, pelo executor DAQUELA
 * transação, existe `.for("update")` sobre a tabela alvo ou sobre uma linha-pai
 * declarada em `PAIS`, e a guarda é RELIDA depois da tranca (§ `releituraDaGuarda`).
 * É a forma do `aceite-orcamento.ts:68-79`.
 *
 * **CAS** — a escrita repete no próprio `where` a condição de estado que a
 * guarda leu (`eq(contratosTable.status, "ATIVO")`). O UPDATE é atômico por si:
 * zero linhas quer dizer "mudou no meio". É o idioma que o E158 nomeou a partir
 * do DELETE de parcela (`contratos.ts:1058-1071`) e que o `PATCH /contratos`
 * (`:1072`) usa hoje.
 *
 * **ABERTA** — nem uma nem outra. Toda porta ABERTA tem de estar na tabela de
 * dívida reconhecida da varredura, **com a contagem travada**.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

/**
 * As pastas varridas. `artifacts/moscow-noivas/src` entra de propósito mesmo
 * sendo frontend: o dia em que um `contratosTable` aparecer lá, a varredura
 * fala. `scripts` e `lib` entram pelo mesmo motivo — seed e migração escrevem.
 */
const PASTAS = [
  "artifacts/api-server/src",
  "artifacts/moscow-noivas/src",
  "lib",
  "scripts",
] as const;

export const TABELAS_QUENTES = [
  "bloqueioVestidosTable",
  "reservasTable",
  "contratosTable",
  "orcamentosTable",
] as const;
export type TabelaQuente = (typeof TABELAS_QUENTES)[number];

/** Os nomes de tabela, como o Postgres os conhece — para a peneira de SQL cru. */
export const NOMES_NO_BANCO: Record<TabelaQuente, string> = {
  bloqueioVestidosTable: "bloqueio_vestidos",
  reservasTable: "reservas",
  contratosTable: "contratos",
  orcamentosTable: "orcamentos",
};

/**
 * A cadeia de trancas, escrita uma vez.
 *
 * O E158 fixou a ordem do módulo de contratos em `contratos.ts:586-594`
 * (`lead → contrato → parcelas → bloqueios`) e o E159 a estendeu em
 * `reservas.ts:62-71` (`linha-pai da rota → contrato → parcelas → bloqueios
 * ORDENADOS → vestidos ORDENADOS`). Sem ordem comum, duas portas se matam em
 * deadlock em vez de fazer fila.
 *
 * Para cada tabela quente, quais linhas servem de tranca. Trancar a linha-PAI é
 * legítimo e às vezes é a única opção: o `POST /contratos` tranca o LEAD porque
 * o invariante que ele defende ("um lead, um contrato ativo") fala do lead, e a
 * linha do lead existe mesmo quando não há contrato nenhum para trancar
 * (`contratos.ts:611-613`).
 */
export const PAIS: Record<TabelaQuente, readonly string[]> = {
  contratosTable: ["contratosTable", "leadsTable"],
  reservasTable: ["reservasTable", "leadsTable"],
  orcamentosTable: ["orcamentosTable", "leadsTable"],
  bloqueioVestidosTable: [
    "bloqueioVestidosTable",
    "vestidosTable",
    "reservasTable",
    "contratosTable",
    "leadsTable",
  ],
};

/**
 * As colunas que decidem ESTADO em cada tabela — as que uma corrida muda embaixo
 * de quem já leu. São elas que a releitura tem de trazer e que o CAS tem de
 * repetir no `where`.
 */
export const COLUNAS_DE_ESTADO: Record<TabelaQuente, readonly string[]> = {
  contratosTable: ["status", "canceladoEm"],
  reservasTable: ["status"],
  orcamentosTable: ["status", "aceitoEm", "aprovadoEm", "publicoAbertoEm"],
  bloqueioVestidosTable: ["canceladoEm"],
};

/** Os identificadores por onde uma escrita sai para o banco. */
const EXECUTORES = new Set(["db", "tx", "executor", "exec"]);
const VERBOS = new Set(["insert", "update", "delete"]);

export type Disciplina = "TRANCA" | "CAS" | "ABERTA";

export type Porta = {
  arquivo: string;
  linha: number;
  verbo: string;
  tabela: TabelaQuente;
  /** O identificador que executa a escrita: `tx` (transação) ou `db` (pool). */
  executor: string;
  /** O parâmetro da `db.transaction(...)` que envolve a escrita, se houver. */
  txNome: string | null;
  /** As tabelas que a transação trancou com `FOR UPDATE` ANTES desta escrita. */
  trancadas: string[];
  /** Alguma das trancas cobre a tabela alvo ou uma linha-pai declarada. */
  trancaNoAlvoOuPai: boolean;
  /** Como a guarda foi relida depois da tranca — null quando não foi. */
  releituraDaGuarda: string | null;
  /** As colunas de estado que o `where` da própria escrita repete. */
  casNoWhere: string[];
  disciplina: Disciplina;
};

function raizDoReceptor(no: ts.Node): string {
  let n: ts.Node = no;
  while (ts.isPropertyAccessExpression(n) || ts.isCallExpression(n)) n = n.expression;
  return ts.isIdentifier(n) ? n.text : `<${ts.SyntaxKind[n.kind]}>`;
}

/** Sobe do `.insert(T)` até o fim da cadeia `.set().where().returning()`. */
function cadeiaCompleta(no: ts.Node): ts.Node {
  let n: ts.Node = no;
  for (;;) {
    const p = n.parent;
    if (p && ts.isPropertyAccessExpression(p) && p.expression === n) {
      n = p;
      continue;
    }
    if (p && ts.isCallExpression(p) && p.expression === n) {
      n = p;
      continue;
    }
    if (p && ts.isAwaitExpression(p)) {
      n = p;
      continue;
    }
    return n;
  }
}

function chamadasDe(raiz: ts.Node, nome: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const v = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === nome) {
      out.push(n);
    }
    n.forEachChild(v);
  };
  v(raiz);
  return out;
}

/** O `.from(X)` da cadeia de um select — qual linha a tranca segura. */
function tabelaDoFrom(cadeia: ts.Node): string | null {
  const froms = chamadasDe(cadeia, "from");
  for (const f of froms) {
    const a = f.arguments[0];
    if (a && ts.isIdentifier(a)) return a.text;
  }
  return null;
}

/**
 * Os apelidos locais das tabelas quentes.
 *
 * `import { contratosTable as ct }` faria a busca por identificador perder a
 * porta inteira — é o buraco clássico de qualquer varredura por nome. Resolver
 * o apelido no `import` fecha o buraco de vez. O acesso por namespace
 * (`schema.contratosTable`) NÃO é resolvido aqui: ele cai na peneira de
 * `escritasComTabelaDinamica`, que a varredura exige em zero.
 */
function apelidosDasQuentes(sf: ts.SourceFile): Map<string, TabelaQuente> {
  const mapa = new Map<string, TabelaQuente>();
  for (const q of TABELAS_QUENTES) mapa.set(q, q);
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      const original = el.propertyName?.text;
      if (original && (TABELAS_QUENTES as readonly string[]).includes(original)) {
        mapa.set(el.name.text, original as TabelaQuente);
      }
    }
  }
  return mapa;
}

/**
 * Enumera as portas de UM texto-fonte. Exportada porque é ela que o autoteste
 * da varredura chama com fonte sintética: uma régua que nunca se viu vermelha é
 * decoração, e este é o vermelho que fica gravado.
 */
export function portasNoTexto(caminho: string, texto: string): Porta[] {
  return portasNaFonte(ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true));
}

function portasNaFonte(sf: ts.SourceFile): Porta[] {
  const apelidos = apelidosDasQuentes(sf);
  const portas: Porta[] = [];

  const visitar = (no: ts.Node): void => {
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && VERBOS.has(no.expression.name.text)) {
      const arg = no.arguments[0];
      const tabela = arg && ts.isIdentifier(arg) ? apelidos.get(arg.text) : undefined;
      if (tabela) {
        portas.push(analisar(sf, no, no.expression.name.text, tabela));
      }
    }
    no.forEachChild(visitar);
  };
  visitar(sf);
  return portas;
}

function analisar(sf: ts.SourceFile, escrita: ts.CallExpression, verbo: string, tabela: TabelaQuente): Porta {
  const inicio = escrita.getStart(sf);
  const linha = sf.getLineAndCharacterOfPosition(inicio).line + 1;
  const executor = raizDoReceptor((escrita.expression as ts.PropertyAccessExpression).expression);

  // 1. Transação presente: existe um `.transaction(cb)` acima, e o executor da
  //    escrita é o parâmetro DAQUELE callback (não o `db` do pool por dentro).
  let txNome: string | null = null;
  let corpoTx: ts.Node | null = null;
  for (let p: ts.Node | undefined = escrita.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && p.expression.name.text === "transaction") {
      const cb = p.arguments[0];
      if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
        txNome = cb.parameters[0]?.name.getText(sf) ?? null;
        corpoTx = cb.body;
      }
      break;
    }
  }

  const trancadas: string[] = [];
  let releituraDaGuarda: string | null = null;
  let posPrimeiraTranca = Number.POSITIVE_INFINITY;

  if (corpoTx && txNome) {
    // 2. `FOR UPDATE` na linha certa: um `.for(...)` do MESMO executor, ANTES
    //    da escrita. A tabela vem do `.from(X)` da mesma cadeia.
    for (const chamada of chamadasDe(corpoTx, "for")) {
      if (chamada.getStart(sf) >= inicio) continue;
      if (raizDoReceptor((chamada.expression as ts.PropertyAccessExpression).expression) !== txNome) continue;
      const cadeia = cadeiaCompleta(chamada);
      const alvo = tabelaDoFrom(cadeia) ?? "?";
      trancadas.push(alvo);
      posPrimeiraTranca = Math.min(posPrimeiraTranca, chamada.getStart(sf));

      // 3a. A releitura mais comum é o PRÓPRIO select da tranca, quando ele
      //     projeta a coluna de estado (`{ status: ... }`) ou tudo (`select()`).
      //     É a forma de `reservas.ts:200-206` e `contratos.ts:1159-1163`.
      const sel = chamadasDe(cadeia, "select")[0];
      if (sel && alvo === tabela) {
        const proj = sel.arguments[0];
        if (!proj) {
          releituraDaGuarda ??= `tranca com select() inteiro em ${alvo}`;
        } else if (ts.isObjectLiteralExpression(proj)) {
          const txt = proj.getText(sf);
          for (const col of COLUNAS_DE_ESTADO[tabela]) {
            if (txt.includes(`${tabela}.${col}`)) releituraDaGuarda ??= `tranca lê ${tabela}.${col}`;
          }
        }
      }
    }

    // 3b. Ou um select SEM `for` depois da tranca; 3c. ou um helper que recebe o
    //     executor da transação e faz a pergunta lá dentro
    //     (`verificarDisponibilidade({ executor: tx })`).
    const depoisDaTranca = (n: ts.Node): boolean => n.getStart(sf) > posPrimeiraTranca && n.getStart(sf) < inicio;
    const v = (n: ts.Node): void => {
      if (depoisDaTranca(n) && ts.isCallExpression(n)) {
        if (
          ts.isPropertyAccessExpression(n.expression) &&
          n.expression.name.text === "select" &&
          raizDoReceptor(n.expression.expression) === txNome &&
          chamadasDe(cadeiaCompleta(n), "for").length === 0
        ) {
          releituraDaGuarda ??= `releitura em ${tabelaDoFrom(cadeiaCompleta(n)) ?? "?"}`;
        }
        for (const a of n.arguments) {
          if (ts.isIdentifier(a) && a.text === txNome) {
            releituraDaGuarda ??= `guarda delegada a ${n.expression.getText(sf)}`;
          }
          if (ts.isObjectLiteralExpression(a)) {
            for (const pr of a.properties) {
              if (ts.isPropertyAssignment(pr) && ts.isIdentifier(pr.initializer) && pr.initializer.text === txNome) {
                releituraDaGuarda ??= `guarda delegada a ${n.expression.getText(sf)}`;
              }
            }
          }
        }
      }
      n.forEachChild(v);
    };
    v(corpoTx);
  }

  // 4. CAS: o `where` da própria escrita repete uma coluna de estado do alvo.
  const casNoWhere: string[] = [];
  for (const w of chamadasDe(cadeiaCompleta(escrita), "where")) {
    const txt = w.arguments.map((a) => a.getText(sf)).join(" ");
    for (const col of COLUNAS_DE_ESTADO[tabela]) {
      if (txt.includes(`${tabela}.${col}`) && !casNoWhere.includes(col)) casNoWhere.push(col);
    }
  }

  const trancaNoAlvoOuPai = trancadas.some((t) => PAIS[tabela].includes(t));
  const naTransacao = txNome !== null && executor === txNome;
  const disciplina: Disciplina =
    naTransacao && trancaNoAlvoOuPai && (releituraDaGuarda !== null || casNoWhere.length > 0)
      ? "TRANCA"
      : casNoWhere.length > 0
        ? "CAS"
        : "ABERTA";

  return {
    arquivo: sf.fileName,
    linha,
    verbo,
    tabela,
    executor,
    txNome,
    trancadas,
    trancaNoAlvoOuPai,
    releituraDaGuarda,
    casNoWhere,
    disciplina,
  };
}

/** Os arquivos-fonte versionados que a varredura lê. */
export function arquivosVarridos(): string[] {
  return arquivosVersionados(RAIZ, PASTAS).filter(
    (rel) =>
      /\.tsx?$/.test(rel) &&
      !rel.includes(".test.") &&
      !rel.split("/").includes("__tests__") &&
      !rel.split("/").includes("generated"),
  );
}

/**
 * As fontes já parseadas, uma vez só.
 *
 * As três peneiras do arquivo percorrem a MESMA população; sem o cache, o
 * `git ls-files` roda três vezes e os 266 arquivos são lidos e parseados três
 * vezes. A varredura inteira leva ~1 s com o cache.
 */
let cacheDasFontes: ts.SourceFile[] | null = null;
function fontesVarridas(): ts.SourceFile[] {
  cacheDasFontes ??= arquivosVarridos().map((rel) =>
    ts.createSourceFile(rel, readFileSync(join(RAIZ, rel), "utf8"), ts.ScriptTarget.Latest, true),
  );
  return cacheDasFontes;
}

export function enumerarPortas(): Porta[] {
  const portas: Porta[] = [];
  for (const sf of fontesVarridas()) portas.push(...portasNaFonte(sf));
  return portas;
}

/**
 * As escritas cuja tabela NÃO é um identificador simples —
 * `db.update(schema.contratosTable)`, `tx.insert(tabelas[i])`.
 *
 * A enumeração acima não as classifica, e uma delas escondendo uma tabela
 * quente seria a porta que a régua não vê. Hoje são **zero**, e a varredura
 * cobra que continue zero: no dia em que a primeira nascer, ela vira decisão —
 * ou a escrita volta ao identificador simples, ou o enumerador aprende a
 * resolvê-la. O que não pode é passar em silêncio.
 */
export function escritasComTabelaDinamica(): string[] {
  const achados: string[] = [];
  for (const sf of fontesVarridas()) {
    const rel = sf.fileName;
    const v = (no: ts.Node): void => {
      if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && VERBOS.has(no.expression.name.text)) {
        const arg = no.arguments[0];
        const receptor = raizDoReceptor(no.expression.expression);
        if (arg && !ts.isIdentifier(arg) && EXECUTORES.has(receptor)) {
          const linha = sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1;
          achados.push(`${rel}:${linha} ${receptor}.${no.expression.name.text}(${arg.getText(sf).slice(0, 50)})`);
        }
      }
      no.forEachChild(v);
    };
    v(sf);
  }
  return achados;
}

/**
 * SQL cru que escreve numa tabela quente.
 *
 * **Aqui a peneira é regex, e o motivo é que não existe AST para olhar:** o
 * conteúdo de uma template string `sql\`UPDATE contratos …\`` é texto para o
 * TypeScript — o parser entrega um `NoSubstitutionTemplateLiteral`, não uma
 * árvore de SQL. O que a AST dá, e é usado, é o recorte: só o texto de
 * templates com a tag `sql` entra na peneira, então um comentário ou uma string
 * de mensagem que cite "UPDATE contratos" não dispara.
 *
 * O que ela NÃO vê: SQL montado por concatenação (`sql.raw(alvo + " SET …")`) e
 * o nome da tabela vindo de variável. Hoje o repositório tem **zero** template
 * `sql` com verbo de escrita em qualquer tabela, quente ou fria.
 */
export function sqlCruEscrevendoEmTabelaQuente(): string[] {
  const achados: string[] = [];
  const verbo = /\b(insert\s+into|update|delete\s+from)\b/i;
  for (const sf of fontesVarridas()) {
    const rel = sf.fileName;
    const v = (no: ts.Node): void => {
      if (ts.isTaggedTemplateExpression(no) && raizDoReceptor(no.tag) === "sql") {
        const txt = no.template.getText(sf);
        if (verbo.test(txt)) {
          for (const q of TABELAS_QUENTES) {
            if (new RegExp(`\\b${NOMES_NO_BANCO[q]}\\b`, "i").test(txt)) {
              const linha = sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1;
              achados.push(`${rel}:${linha} ${txt.replace(/\s+/g, " ").slice(0, 80)}`);
            }
          }
        }
      }
      no.forEachChild(v);
    };
    v(sf);
  }
  return achados;
}
