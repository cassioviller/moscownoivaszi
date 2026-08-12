import ts from "typescript";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@workspace/db";
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
 * ## O que ela erra, e para que lado
 *
 * A conta é por TABELA, não por COLUNA: uma escrita crua em `contas_pagar`
 * marca todas as restrições únicas de `contas_pagar` como alcançáveis, mesmo a
 * `contas_pagar_recorrencia_unica`, que é PARCIAL (`where recorrencia_id is not
 * null`) e cujo único inserte com recorrência declara `onConflictDoNothing`.
 * Saber qual coluna cada `values()` preenche é análise de fluxo, não de
 * sintaxe — e a aproximação **erra para MAIS**: ela pede julgamento sobre
 * índice que talvez ninguém alcance, nunca dispensa julgamento sobre índice
 * alcançável. É a mesma escolha da leitura léxica da ordem das trancas.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");
const PASTA_DAS_ROTAS = "artifacts/api-server/src/routes";
const VERBOS = new Set(["insert", "update"]);

/** O nome de cada tabela no BANCO, indexado pelo identificador do drizzle. */
function nomesNoBanco(): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const [nome, valor] of Object.entries(schema as Record<string, unknown>)) {
    try {
      mapa.set(nome, getTableConfig(valor as never).name);
    } catch {
      // Não é tabela — o pacote exporta enums, tipos e o próprio `db`.
    }
  }
  return mapa;
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
};

/** Os arquivos de rota versionados — a régua do `git ls-files`, sempre. */
export function arquivosDeRota(): string[] {
  return arquivosVersionados(RAIZ, [PASTA_DAS_ROTAS]).filter((rel) => rel.endsWith(".ts") && !rel.includes(".test."));
}

/** Toda escrita de rota numa tabela do schema, com a disciplina de conflito. */
export function escritasDeRota(): EscritaDeRota[] {
  const nomes = nomesNoBanco();
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
          const tabela = nomes.get(apelidos.get(arg.text) ?? arg.text);
          if (tabela) {
            out.push({
              arquivo: rel,
              linha: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
              verbo: n.expression.name.text,
              tabela,
              onConflict: /\.onConflict(DoNothing|DoUpdate)\s*\(/.test(cadeiaCompleta(n).getText(sf)),
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

/** As tabelas em que alguma rota escreve SEM `onConflict` — onde o 23505 nasce. */
export function tabelasEscritasCruas(): Set<string> {
  return new Set(escritasDeRota().filter((e) => !e.onConflict).map((e) => e.tabela));
}
