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
