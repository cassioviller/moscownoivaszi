import ts from "typescript";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm";
import * as schema from "@workspace/db";
import * as zodApi from "@workspace/api-zod";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * S-O61 — **quais restrições únicas uma pessoa consegue violar por HTTP.**
 *
 * O E180 pôs 11 índices em `DUPLICADO_POR_INDICE` e a S-O61 nasceu com a conta
 * que faltava: *"a varredura prega que toda chave EXISTE, não que todo índice
 * alcançável por HTTP tenha frase; a conta certa cruza os `insert` das rotas com
 * as restrições das tabelas que eles tocam"*.
 *
 * É esta metade que este arquivo enumera. A outra — a existência de cada chave —
 * é a `e180-indice-por-indice-api.test.ts`, e as duas juntas fecham a pinça: uma
 * impede o mapa de apontar para índice que morreu, a outra impede a lista de
 * índices sem frase de crescer em silêncio.
 *
 * ## O que conta como alcançável
 *
 * Uma restrição única é alcançável quando alguma ROTA escreve na tabela dela
 * **sem `onConflict`**. As duas metades importam:
 *
 * - **Rota**, e não o repositório inteiro: seed, migração e o gerador da loja de
 *   demonstração escrevem nas mesmas tabelas e não têm ninguém do outro lado
 *   para ler a frase. A pergunta é sobre quem usa o sistema.
 * - **Sem `onConflict`**: o `upsert` resolve a colisão dentro do INSERT, e o
 *   23505 nunca chega ao `classificarErro`. Foi o que a medição mostrou e o
 *   diagnóstico não previa — **4 das 27 restrições únicas só têm escrita com
 *   `onConflict`**, e para elas frase nenhuma faria diferença.
 *
 * ## O que ela erra, e para que lado — E238 (S-O83): a conta é por COLUNA
 *
 * Até o E238 a conta era por TABELA: uma escrita crua em `contas_pagar`
 * marcava todas as restrições únicas de `contas_pagar` como alcançáveis, mesmo
 * a `contas_pagar_recorrencia_unica`, que é PARCIAL (`where recorrencia_id is
 * not null`) e cujo único insert com recorrência declara `onConflictDoNothing`.
 * A S-O83 dizia que isso errava para MAIS em dois dos 23, e **a medição por
 * coluna achou dois — não os dois que a sobra nomeava**:
 *
 * - `contas_pagar_recorrencia_unica` — sim: o único insert que preenche
 *   `recorrencia_id` declara `onConflictDoNothing` SOBRE ESSE índice, e o outro
 *   insert da tabela (`POST /contas-pagar`) espalha `parsed.data`, cujo schema
 *   (`CreateContaPagarBody`) não tem `recorrenciaId`. Sai da conta.
 * - `portal_tokens_lead_unq` — a sobra não a citava: a porta que cria faz
 *   upsert sobre `lead_id`, e a única escrita crua é o UPDATE de revogação,
 *   que não toca a coluna. Sai da conta — e o julgamento manual que dizia
 *   exatamente isso deixa de precisar existir.
 * - `convites_loja_email_pendente_unq` — a sobra a citava, e ela FICA: o
 *   insert do convite chega ao índice de verdade (a rota confere o pendente
 *   antes, e a corrida entre dois convites cai nele). O que a sobra lembrava é
 *   onde a FRASE morava (o `catch` local que o E186 tirou), não se o índice era
 *   alcançável.
 *
 * O que a conta por coluna sabe, e como:
 *
 * - **INSERT** alcança o índice quando o `values()` preenche TODAS as colunas
 *   dele (coluna anulável ausente vira NULL, e NULL nunca colide em índice
 *   único). As chaves saem do objeto literal — inclusive dentro de
 *   `array.map((c) => ({ … }))` — e o `...parsed.data` é resolvido pelo schema
 *   Zod do `safeParse` que o precede na mesma função (`X.safeParse(req.body)`
 *   → `X.shape`, do `@workspace/api-zod`). Qualquer outro spread ou valor que
 *   não seja literal (`values(valores)`) é OPACO e conta como se preenchesse
 *   tudo — erra para MAIS, na direção segura.
 * - **UPDATE** alcança quando o `set()` toca ao menos uma coluna do índice.
 * - **`onConflict`** é por ÍNDICE: `onConflictDoNothing({ target })` cobre só
 *   o índice daquelas colunas; sem `target` cobre todos os da tabela. A conta
 *   antiga tratava a escrita inteira como não-crua, o que **errava para
 *   MENOS** numa tabela com dois índices — não há caso vivo hoje, e a régua
 *   fecha a porta antes do primeiro.
 *
 * **S-O123 — e o predicado do índice PARCIAL, quando a escrita o contradiz
 * com um LITERAL.** `contratos_lead_ativo_unico` é `WHERE status = ATIVO`;
 * um INSERT que grave `status: "CANCELADO"` preenche todas as colunas do índice
 * e não entra nele. A conta lê o predicado (`pg_get_expr(indpred)`) nas quatro
 * formas que o schema usa — `col = x`, `col = true|false`, `col IS NULL`,
 * `col IS NOT NULL`, e conjunções delas — e desconta a escrita cujo literal
 * (string, boolean ou `null`) contradiz uma cláusula. Valor que não é literal
 * continua opaco: conta como alcançando, para MAIS.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");
const PASTA_DAS_ROTAS = "artifacts/api-server/src/routes";
const VERBOS = new Set(["insert", "update"]);

type TabelaDoSchema = { nome: string; colunas: Map<string, string> };

/** Cada tabela do schema — o nome no BANCO e as colunas (propriedade → coluna). */
function tabelasDoSchema(): Map<string, TabelaDoSchema> {
  const mapa = new Map<string, TabelaDoSchema>();
  for (const [nome, valor] of Object.entries(schema as Record<string, unknown>)) {
    try {
      const colunas = new Map<string, string>();
      for (const [prop, col] of Object.entries(getTableColumns(valor as never))) {
        colunas.set(prop, (col as { name: string }).name);
      }
      mapa.set(nome, { nome: getTableConfig(valor as never).name, colunas });
    } catch {
      // Não é tabela — o pacote exporta enums, tipos e o próprio `db`.
    }
  }
  return mapa;
}

/** As chaves de um schema Zod de objeto do `@workspace/api-zod`, ou `null`. */
function chavesDoSchemaZod(nome: string): string[] | null {
  const s = (zodApi as Record<string, unknown>)[nome] as { shape?: Record<string, unknown> } | undefined;
  return s?.shape ? Object.keys(s.shape) : null;
}

/**
 * As colunas do BANCO que um objeto de `values()`/`set()` preenche — `null`
 * quando alguma parte é OPACA (spread não resolvido, valor que não é literal).
 */
function colunasPreenchidas(sf: ts.SourceFile, no: ts.Node, tabela: TabelaDoSchema): string[] | null {
  const chaves: string[] = [];
  let opaco = false;
  const literal = (obj: ts.ObjectLiteralExpression): void => {
    for (const pr of obj.properties) {
      if (ts.isPropertyAssignment(pr) || ts.isShorthandPropertyAssignment(pr)) {
        chaves.push(pr.name.getText(sf).replace(/["']/g, ""));
      } else if (ts.isSpreadAssignment(pr)) {
        // `...parsed.data` → o schema do `safeParse` que declarou `parsed`.
        const resolvidas = chavesDoSpread(sf, pr.expression);
        if (resolvidas) chaves.push(...resolvidas);
        else opaco = true;
      } else {
        opaco = true;
      }
    }
  };
  const visitar = (n: ts.Node): void => {
    if (ts.isObjectLiteralExpression(n)) literal(n);
    else if (ts.isArrayLiteralExpression(n)) n.elements.forEach(visitar);
    else if (ts.isParenthesizedExpression(n)) visitar(n.expression);
    else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "map") {
      const cb = n.arguments[0];
      if (cb && ts.isArrowFunction(cb)) visitar(cb.body);
      else opaco = true;
    } else opaco = true;
  };
  visitar(no);
  if (opaco) return null;
  return [...new Set(chaves.map((k) => tabela.colunas.get(k) ?? `?${k}`))];
}

/** S-O123 — os literais que um `values()`/`set()` grava por coluna do banco. */
function literaisPreenchidos(sf: ts.SourceFile, no: ts.Node, tabela: TabelaDoSchema): Map<string, string | boolean | null> {
  const out = new Map<string, string | boolean | null>();
  const literal = (obj: ts.ObjectLiteralExpression): void => {
    for (const pr of obj.properties) {
      if (!ts.isPropertyAssignment(pr)) continue;
      const col = tabela.colunas.get(pr.name.getText(sf).replace(/["']/g, ""));
      if (!col) continue;
      const v = pr.initializer;
      if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) out.set(col, v.text);
      else if (v.kind === ts.SyntaxKind.TrueKeyword) out.set(col, true);
      else if (v.kind === ts.SyntaxKind.FalseKeyword) out.set(col, false);
      else if (v.kind === ts.SyntaxKind.NullKeyword) out.set(col, null);
    }
  };
  const visitar = (n: ts.Node): void => {
    if (ts.isObjectLiteralExpression(n)) literal(n);
    else if (ts.isArrayLiteralExpression(n)) n.elements.forEach(visitar);
    else if (ts.isParenthesizedExpression(n)) visitar(n.expression);
    else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "map") {
      const cb = n.arguments[0];
      if (cb && ts.isArrowFunction(cb)) visitar(cb.body);
    }
  };
  visitar(no);
  return out;
}

/**
 * S-O123 — a escrita CONTRADIZ o predicado do índice parcial? Só responde
 * `true` quando um literal da escrita nega uma cláusula que a conta entende;
 * predicado que ela não lê, ou valor não literal, é `false` (erra para mais).
 */
export function contradizPredicado(predicado: string | null | undefined, literais: ReadonlyMap<string, string | boolean | null>): boolean {
  if (!predicado) return false;
  const clausulas = predicado.split(/\s+AND\s+/i).map((c) => c.replace(/^\(+|\)+$/g, "").trim());
  for (const cl of clausulas) {
    let m = /^(\w+) = '([^']*)'(?:::\w+)?$/.exec(cl);
    if (m && literais.has(m[1]!)) { if (literais.get(m[1]!) !== m[2]) return true; continue; }
    m = /^(\w+) = (true|false)$/.exec(cl);
    if (m && literais.has(m[1]!)) { if (literais.get(m[1]!) !== (m[2] === "true")) return true; continue; }
    m = /^(\w+) IS NOT NULL$/.exec(cl);
    if (m && literais.has(m[1]!)) { if (literais.get(m[1]!) === null) return true; continue; }
    m = /^(\w+) IS NULL$/.exec(cl);
    if (m && literais.has(m[1]!)) { if (literais.get(m[1]!) !== null) return true; continue; }
  }
  return false;
}

/** `...parsed.data` — as chaves do schema Zod cujo `safeParse` declarou `parsed`. */
function chavesDoSpread(sf: ts.SourceFile, expr: ts.Expression): string[] | null {
  if (!ts.isPropertyAccessExpression(expr) || expr.name.text !== "data" || !ts.isIdentifier(expr.expression)) return null;
  const variavel = expr.expression.text;
  for (let p: ts.Node | undefined = expr.parent; p; p = p.parent) {
    if (!ts.isFunctionLike(p) && !ts.isSourceFile(p)) continue;
    let achado: string[] | null = null;
    const v = (n: ts.Node): void => {
      if (achado) return;
      if (
        ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === variavel && n.initializer &&
        ts.isCallExpression(n.initializer) && ts.isPropertyAccessExpression(n.initializer.expression) &&
        n.initializer.expression.name.text === "safeParse" && ts.isIdentifier(n.initializer.expression.expression)
      ) {
        achado = chavesDoSchemaZod(n.initializer.expression.expression.text);
      }
      n.forEachChild(v);
    };
    v(p);
    if (achado) return achado;
  }
  return null;
}

/** Sobe do `.insert(T)` até o fim da cadeia, para ler o `.onConflict…` dela. */
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

export type EscritaDeRota = {
  arquivo: string;
  linha: number;
  verbo: string;
  /** O nome da tabela no banco — `contas_pagar`, não `contasPagarTable`. */
  tabela: string;
  /** A cadeia declara `onConflictDoNothing`/`onConflictDoUpdate`. */
  onConflict: boolean;
  /**
   * E238 — as colunas do BANCO que o `onConflict` cobre: `null` sem
   * `onConflict`; `[]` quando não há `target` (cobre todo índice da tabela).
   */
  onConflictColunas: string[] | null;
  /** E238 — as colunas do BANCO que `values()`/`set()` preenche; `null` = opaco. */
  colunas: string[] | null;
  /**
   * S-O123 — os LITERAIS por coluna do banco (`status: "CANCELADO"` →
   * `status → "CANCELADO"`; `ativo: false`; `x: null`). Só o que é literal no
   * texto entra; o resto não aparece aqui e continua opaco.
   */
  literais: Map<string, string | boolean | null>;
};

/** Os arquivos de rota versionados — a régua do `git ls-files`, sempre. */
export function arquivosDeRota(): string[] {
  return arquivosVersionados(RAIZ, [PASTA_DAS_ROTAS]).filter((rel) => rel.endsWith(".ts") && !rel.includes(".test."));
}

/** Toda escrita de rota numa tabela do schema, com a disciplina de conflito. */
export function escritasDeRota(): EscritaDeRota[] {
  const tabelas = tabelasDoSchema();
  const out: EscritaDeRota[] = [];
  for (const rel of arquivosDeRota()) {
    const sf = ts.createSourceFile(rel, readFileSync(join(RAIZ, rel), "utf8"), ts.ScriptTarget.Latest, true);
    // `import { contratosTable as ct }` — o buraco clássico da busca por nome.
    const apelidos = new Map<string, string>();
    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      const b = stmt.importClause?.namedBindings;
      if (!b || !ts.isNamedImports(b)) continue;
      for (const el of b.elements) apelidos.set(el.name.text, el.propertyName?.text ?? el.name.text);
    }
    const v = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && VERBOS.has(n.expression.name.text)) {
        const arg = n.arguments[0];
        if (arg && ts.isIdentifier(arg)) {
          const tabela = tabelas.get(apelidos.get(arg.text) ?? arg.text);
          if (tabela) {
            const cadeia = cadeiaCompleta(n);
            const verbo = n.expression.name.text;
            const carga = chamadasNaCadeia(cadeia, verbo === "insert" ? "values" : "set")[0]?.arguments[0];
            const conflito = chamadasNaCadeia(cadeia, "onConflictDoNothing")[0] ?? chamadasNaCadeia(cadeia, "onConflictDoUpdate")[0];
            out.push({
              arquivo: rel,
              linha: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
              verbo,
              tabela: tabela.nome,
              onConflict: conflito !== undefined,
              onConflictColunas: conflito ? colunasDoTarget(sf, conflito, tabela) : null,
              colunas: carga ? colunasPreenchidas(sf, carga, tabela) : null,
              literais: carga ? literaisPreenchidos(sf, carga, tabela) : new Map(),
            });
          }
        }
      }
      n.forEachChild(v);
    };
    v(sf);
  }
  return out;
}

/** As chamadas `.nome(...)` dentro de uma cadeia. */
function chamadasNaCadeia(cadeia: ts.Node, nome: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const v = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === nome) out.push(n);
    n.forEachChild(v);
  };
  v(cadeia);
  return out;
}

/** As colunas do `target` de um `onConflict…({ target: [t.a, t.b] })` — `[]` sem target. */
function colunasDoTarget(sf: ts.SourceFile, conflito: ts.CallExpression, tabela: TabelaDoSchema): string[] {
  const opcoes = conflito.arguments[0];
  if (!opcoes || !ts.isObjectLiteralExpression(opcoes)) return [];
  const target = opcoes.properties.find(
    (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(sf) === "target",
  );
  if (!target) return [];
  const txt = target.initializer.getText(sf);
  const cols: string[] = [];
  for (const [prop, col] of tabela.colunas) if (new RegExp(`\\.${prop}\\b`).test(txt)) cols.push(col);
  return cols;
}

/** As tabelas em que alguma rota escreve SEM `onConflict` — onde o 23505 nasce. */
export function tabelasEscritasCruas(): Set<string> {
  return new Set(escritasDeRota().filter((e) => !e.onConflict).map((e) => e.tabela));
}

/** Uma restrição única do banco, como `pg_index` a descreve. */
export type IndiceUnico = { tabela: string; indice: string; colunas: string[]; predicado?: string | null };

/**
 * E238 (S-O83) — **as escritas de rota que ALCANÇAM um índice**, pela conta por
 * coluna descrita no topo do arquivo. Vazio = nenhuma rota chega a violá-lo.
 */
export function escritasQueAlcancam(indice: IndiceUnico, escritas: readonly EscritaDeRota[] = escritasDeRota()): EscritaDeRota[] {
  return escritas.filter((e) => {
    if (e.tabela !== indice.tabela) return false;
    // `onConflict` sem target cobre todo índice; com target, só o das colunas.
    if (e.onConflictColunas !== null && (e.onConflictColunas.length === 0 || indice.colunas.every((c) => e.onConflictColunas!.includes(c)))) {
      return false;
    }
    if (e.colunas === null) return true; // opaco: erra para MAIS
    // S-O123: a linha que a escrita grava não entra no índice parcial.
    if (contradizPredicado(indice.predicado, e.literais)) return false;
    return e.verbo === "insert"
      ? indice.colunas.every((c) => e.colunas!.includes(c))
      : indice.colunas.some((c) => e.colunas!.includes(c));
  });
}
