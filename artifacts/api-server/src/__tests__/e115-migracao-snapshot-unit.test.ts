import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@workspace/db";

/**
 * E115 — o snapshot das migrações não pode apodrecer em silêncio.
 *
 * O 0000 do drizzle parou de ser regenerado e ficou SEIS migrações atrás do
 * schema: um banco provisionado por `pnpm --filter @workspace/db migrate`
 * respondia "migrations applied successfully!" e nascia sem `conciliado_em`,
 * `remarcacao_pedida_em`, `avarias.parcela_id`, `estorno_absorvido` — a noiva
 * abria o portal e levava 500 em toda abertura (42703, coluna não existe),
 * junto com a conciliação, o fechamento do mês e a cobrança de avaria. O
 * invariante do `replit.md` ("um banco novo nasce certo") valia para o `push`
 * e tinha sido derrubado, sem nenhum aviso, para o caminho `migrate` que o
 * mesmo package.json oferece.
 *
 * Esta sonda compara o SCHEMA VIVO (drizzle) com o ÚLTIMO snapshot: toda
 * tabela e toda coluna do schema têm de existir lá. Coluna nova sem
 * regenerar a baseline (`drizzle-kit generate`) reprova aqui — em vez de
 * reprovar no celular da noiva, meses depois.
 *
 * VERMELHO ANTES (medido em banco efêmero): `migrate` verde e
 * `select remarcacao_pedida_em from atendimentos` → 42703.
 */
describe("E115 — o snapshot do migrate acompanha o schema", () => {
  const metaDir = join(import.meta.dirname, "..", "..", "..", "..", "lib", "db", "migrations", "meta");

  it("toda tabela e coluna do schema drizzle existe no último snapshot", () => {
    const arquivos = readdirSync(metaDir)
      .filter((f) => f.endsWith("_snapshot.json"))
      .sort();
    expect(arquivos.length).toBeGreaterThan(0);
    const snapshot = JSON.parse(readFileSync(join(metaDir, arquivos.at(-1)!), "utf8")) as {
      tables: Record<string, { columns: Record<string, unknown> }>;
    };

    const faltando: string[] = [];
    for (const exportado of Object.values(schema)) {
      if (!is(exportado, PgTable)) continue;
      const cfg = getTableConfig(exportado);
      const tabela = snapshot.tables[`public.${cfg.name}`];
      if (!tabela) {
        faltando.push(`tabela ${cfg.name}`);
        continue;
      }
      for (const col of cfg.columns) {
        if (!(col.name in tabela.columns)) faltando.push(`${cfg.name}.${col.name}`);
      }
    }

    // Se isto reprovar: rode `drizzle-kit generate` em lib/db (a baseline é
    // regenerável enquanto nenhum banco de verdade consumir o `migrate` — o
    // banco de dev usa `push` e não tem __drizzle_migrations).
    expect(faltando).toEqual([]);
  });
});

/**
 * S-A20 — o que os scripts à mão CRIAM tem de existir no schema, com o mesmo
 * NOME.
 *
 * A sonda de cima olha o caminho `migrate`. Este olha o outro: `docs/migracoes/`
 * é o que um banco que JÁ EXISTE roda, e o drizzle não o lê nunca. Quando os
 * dois divergem, um banco novo e um banco antigo deixam de ser o mesmo banco —
 * e a divergência é silenciosa até alguém tropeçar nela.
 *
 * Foram quatro, e só UMA gritou:
 *
 * · `itens_estoque_loja_nome_tamanho_unq` (E154) — nome diferente do que o
 *   drizzle gera. Ele não achava o dele, tentava CRIAR a duplicata e perguntava
 *   se podia truncar `itens_estoque`: prompt, sem TTY, **`push` morto por um
 *   dia inteiro** e o caminho do `replit.md` cancelado para todo banco real.
 * · `itens_estoque_loja_idx` (E154), `avarias_parcela_id_idx` (E97) e
 *   `atendimentos_loja_contato_idx` (E97) — índices que existiam nos bancos
 *   antigos e **em nenhum banco novo**, porque o schema nunca soube deles.
 *   Ninguém tropeça num índice que falta: só fica mais lento, e num banco que
 *   ainda é pequeno.
 *
 * VERMELHO ANTES: os quatro nomes acima, com o schema do `3cdaa83`.
 */
describe("S-A20 — os scripts à mão e o schema falam os mesmos nomes", () => {
  const metaDir = join(import.meta.dirname, "..", "..", "..", "..", "lib", "db", "migrations", "meta");
  const migracoesDir = join(import.meta.dirname, "..", "..", "..", "..", "docs", "migracoes");

  /**
   * O último snapshot por ORDEM NUMÉRICA. A sonda de cima ordena como string, e
   * isso passa a mentir no `0010` (`"0010" < "0006"`) — está anotado como
   * S-A22; aqui já nasce certo.
   */
  function ultimoSnapshot(): Record<string, Record<string, unknown>> {
    const arquivos = readdirSync(metaDir)
      .filter((f) => f.endsWith("_snapshot.json"))
      .sort((a, b) => Number(a.split("_")[0]) - Number(b.split("_")[0]));
    expect(arquivos.length).toBeGreaterThan(0);
    return (
      JSON.parse(readFileSync(join(metaDir, arquivos.at(-1)!), "utf8")) as {
        tables: Record<string, Record<string, unknown>>;
      }
    ).tables;
  }

  it("todo nome de constraint ou índice criado em docs/migracoes existe no snapshot", () => {
    const tabelas = ultimoSnapshot();
    const conhecidos = new Set<string>();
    for (const t of Object.values(tabelas)) {
      for (const grupo of [
        "indexes",
        "foreignKeys",
        "uniqueConstraints",
        "checkConstraints",
        "compositePrimaryKeys",
      ]) {
        for (const nome of Object.keys((t[grupo] as Record<string, unknown>) ?? {})) {
          conhecidos.add(nome);
        }
      }
      // A PK do drizzle não aparece nomeada no snapshot; o Postgres a chama
      // sempre assim, e os scripts a citam por esse nome.
      conhecidos.add(`${t.name as string}_pkey`);
    }

    // Só o que CRIA nome. `DROP CONSTRAINT` fica de fora de propósito: script
    // que remove algo citou um nome que pode legitimamente não existir mais no
    // schema — é o passado, não o contrato.
    const criaNome =
      /(?:ADD\s+CONSTRAINT|^\s*CONSTRAINT|RENAME\s+CONSTRAINT\s+\w+\s+TO|CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+CONCURRENTLY)?(?:\s+IF\s+NOT\s+EXISTS)?)\s+([a-z_0-9]+)/gim;

    const desconhecidos: string[] = [];
    for (const arquivo of readdirSync(migracoesDir).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(migracoesDir, arquivo), "utf8");
      for (const [, nome] of sql.matchAll(criaNome)) {
        if (!conhecidos.has(nome)) desconhecidos.push(`${arquivo} → ${nome}`);
      }
    }

    // Se isto reprovar, a pergunta NÃO é "como calo o teste": é qual das duas
    // pontas está certa. Se o script criou algo que a loja precisa, declare-o no
    // schema (foi o caso dos três índices); se o nome é que divergiu, use o do
    // script no schema — nenhum banco consumiu o `migrate`, então mudar o nome
    // do lado do drizzle custa zero DDL em banco de verdade.
    expect(desconhecidos).toEqual([]);
  });
});
