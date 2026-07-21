import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, statSync } from "node:fs";
import { createGzip } from "node:zlib";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, backupLogTable } from "@workspace/db";
import type { BackupLog } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

/**
 * Motor de backup do sistema (E30). Faz o dump do banco INTEIRO com `pg_dump`
 * (o mesmo que a `DATABASE_URL` aponta), comprime e grava em `backups/`. Cada
 * execução deixa uma linha em `backup_log` — é essa linha que a tela de
 * Configurações lê para dizer "último backup: há X horas".
 *
 * A rotina agendada e o botão manual chamam a MESMA função; muda só o gatilho.
 */

const BACKUP_DIR = path.resolve(process.cwd(), "backups");

export interface OpcoesBackup {
  gatilho: "manual" | "agendado";
  /** Nome de quem apertou o botão — só no gatilho manual. */
  autorNome?: string;
}

export async function executarBackup(opcoes: OpcoesBackup): Promise<BackupLog> {
  const id = randomUUID();
  // Grava "em_andamento" ANTES do dump: se o processo morrer no meio, a tela
  // mostra a tentativa travada em vez de fingir que o último backup foi o de
  // ontem — o dado que engana o SRE é o silêncio, não o erro.
  await db.insert(backupLogTable).values({
    id,
    gatilho: opcoes.gatilho,
    status: "em_andamento",
    autorNome: opcoes.autorNome ?? null,
  });

  try {
    const arquivo = await rodarPgDump();
    const tamanhoBytes = statSync(arquivo).size;
    const [ok] = await db
      .update(backupLogTable)
      .set({
        status: "ok",
        concluidoEm: new Date(),
        tamanhoBytes,
        arquivo: path.relative(process.cwd(), arquivo),
      })
      .where(eq(backupLogTable.id, id))
      .returning();
    return ok;
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    const [falho] = await db
      .update(backupLogTable)
      .set({ status: "erro", concluidoEm: new Date(), erro: mensagem.slice(0, 500) })
      .where(eq(backupLogTable.id, id))
      .returning();
    return falho;
  }
}

function rodarPgDump(): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não configurada");
  mkdirSync(BACKUP_DIR, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
  const arquivo = path.join(BACKUP_DIR, `moscow-${carimbo}.sql.gz`);

  return new Promise((resolve, reject) => {
    // --no-owner/--no-privileges: o dump restaura em qualquer papel, não amarra
    // no dono atual — restaurar de madrugada não pode depender de quem criou.
    const dump = spawn("pg_dump", ["--no-owner", "--no-privileges", "-d", databaseUrl], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const saida = createWriteStream(arquivo);
    let stderr = "";
    let codigo: number | null = null;

    dump.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    dump.on("error", (e) => reject(e)); // pg_dump ausente do PATH, etc.
    dump.stdout.pipe(createGzip()).pipe(saida);
    saida.on("error", (e) => reject(e));

    dump.on("close", (code) => {
      codigo = code;
      if (code !== 0) {
        reject(new Error(`pg_dump saiu com código ${code}: ${stderr.trim().slice(0, 300)}`));
      }
    });
    // Só resolve quando o gzip terminou de escrever o arquivo — o "close" do
    // pg_dump vem antes do flush final da compressão.
    saida.on("finish", () => {
      if (codigo === 0) resolve(arquivo);
    });
  });
}

export interface StatusBackup {
  ultimo: BackupLog | null;
  recentes: BackupLog[];
}

/** Último backup + os 10 mais recentes, do mais novo para o mais antigo. */
export async function statusBackup(): Promise<StatusBackup> {
  const recentes = await db
    .select()
    .from(backupLogTable)
    .orderBy(desc(backupLogTable.iniciadoEm))
    .limit(10);
  return { ultimo: recentes[0] ?? null, recentes };
}
