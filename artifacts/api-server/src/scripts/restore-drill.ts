import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { createGunzip } from "node:zlib";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { db, pool, backupLogTable, restoreDrillLogTable } from "@workspace/db";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { caminhoDoDump } from "../lib/backup";

const { Client } = pg;

/**
 * O drill do restore (E89) — backup que nunca voltou não é backup.
 *
 *   pnpm --filter @workspace/api-server run restore-drill
 *
 * Pega o dump MAIS RECENTE (o mesmo que a tela oferece para baixar), cria um
 * database EFÊMERO `drill_<timestamp>` na MESMA instância, aplica o dump via
 * psql e confere invariantes contra a origem:
 *
 *   1. contagem por tabela idêntica;
 *   2. nenhuma FK órfã no banco restaurado;
 *   3. amostra de agregado (soma de parcelas) idêntica.
 *
 * Sai um relatório de uma linha por tabela e um código de saída honesto:
 * 0 só se TUDO conferiu. O resultado fica em `restore_drill_log` — é a linha
 * "restaurado e conferido em X" ao lado do status do backup em Configurações.
 *
 * O que este drill NÃO faz: não valida um dump antigo contra a origem de hoje
 * (se a loja trabalhou depois do último backup, a contagem diverge e o drill
 * acusa — rode um backup fresco antes); e não restaura NADA na origem.
 *
 * Cuidados inegociáveis:
 *  - A ORIGEM NUNCA é tocada: toda operação destrutiva (create/drop/restore)
 *    passa por `exigirNomeDeDrill`, que aborta se o alvo não começar com
 *    `drill_`; a conexão de leitura na origem nasce read-only.
 *  - LGPD: o dump carrega dados reais — o efêmero morre no `finally`,
 *    sucesso OU falha, sem sobreviver ao processo.
 */

/** Aspas de identificador Postgres, com escape de aspas internas. */
function qi(nome: string): string {
  return '"' + nome.replace(/"/g, '""') + '"';
}

/**
 * A guarda inegociável do E89: qualquer database que este script cria, enche
 * ou dropa PRECISA se chamar drill_*. Se um bug montar o nome errado (ou
 * deixar vazar o nome da origem), o processo aborta antes do estrago.
 */
function exigirNomeDeDrill(nome: string, origem: string): void {
  if (!/^drill_[a-z0-9_]+$/.test(nome) || nome === origem) {
    throw new Error(
      `ABORTADO: alvo "${nome}" não é um database efêmero de drill (drill_*) — a origem nunca é tocada`,
    );
  }
}

/** Localiza o dump mais recente registrado como ok e ainda presente no disco. */
async function dumpMaisRecente(): Promise<{ arquivo: string; caminho: string }> {
  const registros = await db
    .select()
    .from(backupLogTable)
    .where(and(eq(backupLogTable.status, "ok"), isNotNull(backupLogTable.arquivo)))
    .orderBy(desc(backupLogTable.iniciadoEm));
  for (const registro of registros) {
    const caminho = caminhoDoDump(registro);
    if (caminho && existsSync(caminho)) {
      return { arquivo: path.basename(caminho), caminho };
    }
  }
  throw new Error(
    "nenhum dump disponível no disco — rode `pnpm --filter @workspace/api-server run backup` antes do drill",
  );
}

/** Aplica o dump (.sql.gz) no efêmero via psql, abortando no primeiro erro. */
function aplicarDump(caminhoDump: string, urlDrill: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // -X: ignora .psqlrc; ON_ERROR_STOP: restore pela metade é falha, não aviso.
    const psql = spawn("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", urlDrill], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    psql.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    psql.on("error", (e) => reject(e));
    psql.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`psql saiu com código ${code}: ${stderr.trim().slice(0, 500)}`));
    });
    const leitura = createReadStream(caminhoDump);
    leitura.on("error", (e) => reject(e));
    const gunzip = createGunzip();
    gunzip.on("error", (e) => reject(e));
    leitura.pipe(gunzip).pipe(psql.stdin);
  });
}

interface Divergencia {
  onde: string;
  detalhe: string;
}

/** Uma linha de relatório por tabela: contagem origem × drill. */
async function conferirContagens(
  origem: pg.Client,
  drill: pg.Client,
  divergencias: Divergencia[],
): Promise<number> {
  const { rows: tabelas } = await origem.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  const { rows: tabelasDrill } = await drill.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  const noDrill = new Set(tabelasDrill.map((t) => t.tablename));

  const larg = Math.max(...tabelas.map((t) => t.tablename.length));
  let conferidas = 0;
  for (const { tablename } of tabelas) {
    // O próprio drill grava seu "em_andamento" em restore_drill_log DEPOIS de
    // o dump ter nascido — comparar essa tabela é comparar o drill com o
    // próprio efeito colateral. Fica de fora da contagem, às claras.
    if (tablename === "restore_drill_log") {
      console.log(`  – ${tablename.padEnd(larg)}  ignorada (o registro do próprio drill muda durante a execução)`);
      continue;
    }
    if (!noDrill.has(tablename)) {
      divergencias.push({ onde: tablename, detalhe: "tabela ausente no restaurado" });
      console.log(`  ✗ ${tablename.padEnd(larg)}  AUSENTE no restaurado`);
      continue;
    }
    const [na, nb] = await Promise.all([
      origem.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${qi(tablename)}`),
      drill.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${qi(tablename)}`),
    ]);
    const a = na.rows[0].n;
    const b = nb.rows[0].n;
    conferidas += 1;
    if (a === b) {
      console.log(`  ✓ ${tablename.padEnd(larg)}  ${a} = ${a}`);
    } else {
      divergencias.push({ onde: tablename, detalhe: `origem=${a} drill=${b}` });
      console.log(`  ✗ ${tablename.padEnd(larg)}  origem=${a} ≠ drill=${b}`);
    }
  }
  return conferidas;
}

/** Toda FK do restaurado sem linha órfã — o dump voltou íntegro, não só cheio. */
async function conferirForeignKeys(drill: pg.Client, divergencias: Divergencia[]): Promise<number> {
  const { rows: fks } = await drill.query<{
    conname: string;
    child: string;
    parent: string;
    child_cols: string[];
    parent_cols: string[];
  }>(`
    SELECT c.conname,
           c.conrelid::regclass::text  AS child,
           c.confrelid::regclass::text AS parent,
           (SELECT array_agg(a.attname::text ORDER BY x.ord)
              FROM unnest(c.conkey) WITH ORDINALITY AS x(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = x.attnum) AS child_cols,
           (SELECT array_agg(a.attname::text ORDER BY x.ord)
              FROM unnest(c.confkey) WITH ORDINALITY AS x(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = x.attnum) AS parent_cols
    FROM pg_constraint c
    WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
    ORDER BY child, c.conname
  `);

  let orfasTotal = 0;
  for (const fk of fks) {
    const naoNulos = fk.child_cols.map((c) => `c.${qi(c)} IS NOT NULL`).join(" AND ");
    const juncao = fk.child_cols
      .map((c, i) => `p.${qi(fk.parent_cols[i])} = c.${qi(c)}`)
      .join(" AND ");
    const { rows } = await drill.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${fk.child} c
        WHERE ${naoNulos}
          AND NOT EXISTS (SELECT 1 FROM ${fk.parent} p WHERE ${juncao})`,
    );
    const orfas = Number(rows[0].n);
    if (orfas > 0) {
      orfasTotal += orfas;
      divergencias.push({
        onde: `${fk.child}.${fk.conname}`,
        detalhe: `${orfas} linha(s) órfã(s) apontando para ${fk.parent}`,
      });
      console.log(`  ✗ FK ${fk.conname} (${fk.child} → ${fk.parent}): ${orfas} órfã(s)`);
    }
  }
  if (orfasTotal === 0) console.log(`  ✓ FKs: ${fks.length} constraints, nenhuma linha órfã`);
  return fks.length;
}

/** Amostra de agregado: a soma das parcelas (dinheiro!) precisa bater exata. */
async function conferirAgregado(
  origem: pg.Client,
  drill: pg.Client,
  divergencias: Divergencia[],
): Promise<void> {
  const soma = `SELECT coalesce(sum(valor_previsto), 0)::numeric(14,2)::text AS previsto,
                       coalesce(sum(valor_recebido), 0)::numeric(14,2)::text AS recebido
                  FROM parcelas`;
  const [a, b] = await Promise.all([origem.query(soma), drill.query(soma)]);
  const { previsto: pa, recebido: ra } = a.rows[0];
  const { previsto: pb, recebido: rb } = b.rows[0];
  if (pa === pb && ra === rb) {
    console.log(`  ✓ soma de parcelas: previsto ${pa}, recebido ${ra} — idêntica`);
  } else {
    divergencias.push({
      onde: "parcelas (agregado)",
      detalhe: `previsto origem=${pa} drill=${pb}; recebido origem=${ra} drill=${rb}`,
    });
    console.log(`  ✗ soma de parcelas diverge: previsto ${pa}≠${pb} ou recebido ${ra}≠${rb}`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não configurada");

  const urlOrigem = new URL(databaseUrl);
  const nomeOrigem = urlOrigem.pathname.replace(/^\//, "");
  const carimbo = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/T/, "_")
    .slice(0, 15)
    .toLowerCase();
  const nomeDrill = `drill_${carimbo}_${randomUUID().slice(0, 4)}`;
  exigirNomeDeDrill(nomeDrill, nomeOrigem);

  const urlDrill = new URL(databaseUrl);
  urlDrill.pathname = `/${nomeDrill}`;

  // O registro nasce ANTES do trabalho (mesmo desenho do backup): se o
  // processo morrer no meio, a tela mostra a tentativa travada, não o silêncio.
  const registroId = randomUUID();
  await db.insert(restoreDrillLogTable).values({ id: registroId, status: "em_andamento" });

  // Conexão administrativa (create/drop de database não roda em transação) e
  // conexão de LEITURA na origem — read-only por sessão: nem um bug escreve.
  const admin = new Client({ connectionString: databaseUrl });
  const origem = new Client({
    connectionString: databaseUrl,
    options: "-c default_transaction_read_only=on",
  });

  let dumpArquivo: string | null = null;
  let tabelasConferidas: number | null = null;
  const divergencias: Divergencia[] = [];
  let criado = false;
  let drill: pg.Client | null = null;

  try {
    const dump = await dumpMaisRecente();
    dumpArquivo = dump.arquivo;
    console.log(`[drill] dump mais recente: ${dump.arquivo}`);

    await admin.connect();
    await origem.connect();

    exigirNomeDeDrill(nomeDrill, nomeOrigem);
    console.log(`[drill] criando database efêmero ${nomeDrill}...`);
    await admin.query(`CREATE DATABASE ${qi(nomeDrill)}`);
    criado = true;

    console.log(`[drill] restaurando o dump no efêmero...`);
    await aplicarDump(dump.caminho, urlDrill.toString());

    drill = new Client({ connectionString: urlDrill.toString() });
    await drill.connect();

    console.log(`[drill] conferindo contagem por tabela (origem × restaurado):`);
    tabelasConferidas = await conferirContagens(origem, drill, divergencias);
    console.log(`[drill] conferindo integridade referencial no restaurado:`);
    await conferirForeignKeys(drill, divergencias);
    console.log(`[drill] conferindo amostra de agregado:`);
    await conferirAgregado(origem, drill, divergencias);

    if (divergencias.length > 0) {
      const resumo = divergencias.map((d) => `${d.onde}: ${d.detalhe}`).join("; ");
      throw new Error(`restore divergiu da origem — ${resumo}`);
    }

    await db
      .update(restoreDrillLogTable)
      .set({ status: "ok", concluidoEm: new Date(), dumpArquivo, tabelasConferidas })
      .where(eq(restoreDrillLogTable.id, registroId));
    console.log(
      `[drill] OK: ${dumpArquivo} restaurado e conferido (${tabelasConferidas} tabelas, FKs e agregado íntegros)`,
    );
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    await db
      .update(restoreDrillLogTable)
      .set({
        status: "erro",
        concluidoEm: new Date(),
        dumpArquivo,
        tabelasConferidas,
        // S-C171 — corte decidido (14/08/2026): log de diagnóstico, mesma
        // razão do irmão em `lib/backup.ts`.
        erro: mensagem.slice(0, 500),
      })
      .where(eq(restoreDrillLogTable.id, registroId));
    console.error(`[drill] FALHOU: ${mensagem}`);
    process.exitCode = 1;
  } finally {
    // LGPD: o efêmero carrega dados reais e NÃO sobrevive ao processo —
    // sucesso ou falha, o drop roda aqui. FORCE derruba conexões penduradas.
    await drill?.end().catch(() => {});
    if (criado) {
      exigirNomeDeDrill(nomeDrill, nomeOrigem);
      await admin.query(`DROP DATABASE IF EXISTS ${qi(nomeDrill)} WITH (FORCE)`);
      console.log(`[drill] database efêmero ${nomeDrill} removido`);
    }
    await origem.end().catch(() => {});
    await admin.end().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error("[drill] erro inesperado:", err);
  process.exit(1);
});
