import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, statSync, existsSync, unlinkSync } from "node:fs";
import { createGzip } from "node:zlib";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, backupLogTable, restoreDrillLogTable, sessoesTable } from "@workspace/db";
import type { BackupLog, RestoreDrillLog } from "@workspace/db";
import { eq, desc, and, isNotNull, lt } from "drizzle-orm";

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
    // Housekeeping na carona do backup (E59): sem cron interno, o momento em
    // que um dump novo nasce é o único gancho garantido para limpar os velhos
    // e as sessões expiradas. Falha de limpeza não pode derrubar um backup que
    // já deu certo — por isso fora do try principal e engolida com registro.
    try {
      await podarDumpsAntigos();
      await podarSessoesExpiradas();
    } catch (e) {
      console.error("[backup] poda falhou (backup segue ok):", e);
    }
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

    /**
     * A Promise resolve quando as DUAS pontas terminaram, em qualquer ordem.
     *
     * Antes, `finish` só resolvia se `codigo` já fosse 0 — e `codigo` só é
     * preenchido no `close` do processo. Nada garante essa ordem: chegando o
     * `finish` do gzip primeiro, ele via `codigo === null`, não resolvia, e o
     * `close` seguinte com código 0 não resolvia nada porque só sabe rejeitar.
     * A Promise ficava pendurada para sempre — e ela é `await`ada pelo
     * Scheduled Deployment do backup, que passaria a nunca terminar, com a
     * linha do `backup_log` presa em execução e nenhuma mensagem de erro.
     * Silêncio é o pior desfecho possível para uma rotina de backup.
     */
    let arquivoFechado = false;
    const talvezResolver = () => {
      if (arquivoFechado && codigo === 0) resolve(arquivo);
    };
    dump.on("close", (code) => {
      codigo = code;
      if (code !== 0) {
        reject(new Error(`pg_dump saiu com código ${code}: ${stderr.trim().slice(0, 300)}`));
        return;
      }
      talvezResolver();
    });
    // O arquivo só está íntegro depois do flush final da compressão, que vem
    // DEPOIS do "close" do pg_dump — daí esperar as duas pontas, e não uma.
    saida.on("finish", () => {
      arquivoFechado = true;
      talvezResolver();
    });
  });
}

/**
 * Retenção: quantos dumps OK ficam no disco. Espelha o limite da lista de
 * "execuções recentes" — tudo que a tela oferece para baixar ainda existe.
 */
const RETENCAO_DUMPS = 10;

/**
 * Remove do disco os dumps além dos RETENCAO_DUMPS mais recentes e marca a
 * linha com `arquivo: null` — o registro histórico fica (quando rodou, quanto
 * pesou), só o botão de download some. Arquivo já ausente do disco não é erro:
 * a instância pode ter sido recriada sem a pasta.
 */
export async function podarDumpsAntigos(): Promise<number> {
  const comArquivo = await db
    .select()
    .from(backupLogTable)
    .where(and(eq(backupLogTable.status, "ok"), isNotNull(backupLogTable.arquivo)))
    .orderBy(desc(backupLogTable.iniciadoEm));

  const excedentes = comArquivo.slice(RETENCAO_DUMPS);
  for (const registro of excedentes) {
    const caminho = caminhoDoDump(registro);
    if (caminho && existsSync(caminho)) unlinkSync(caminho);
    await db
      .update(backupLogTable)
      .set({ arquivo: null })
      .where(eq(backupLogTable.id, registro.id));
  }
  return excedentes.length;
}

/** Sessões vencidas são lixo que só cresce — a mesma carona limpa. */
export async function podarSessoesExpiradas(): Promise<void> {
  await db.delete(sessoesTable).where(lt(sessoesTable.expiraEm, new Date()));
}

/**
 * Caminho absoluto do dump de um registro, ou null se não é baixável.
 * Guarda anti path-traversal: o caminho gravado precisa resolver DENTRO de
 * `backups/` — uma linha adulterada no banco não vira leitura arbitrária.
 */
export function caminhoDoDump(registro: BackupLog): string | null {
  if (registro.status !== "ok" || !registro.arquivo) return null;
  const absoluto = path.resolve(process.cwd(), registro.arquivo);
  if (!absoluto.startsWith(BACKUP_DIR + path.sep)) return null;
  return absoluto;
}

export interface StatusBackup {
  ultimo: BackupLog | null;
  recentes: BackupLog[];
  /** Último drill de restore (E89) — null enquanto nenhum rodou. */
  ultimoDrill: RestoreDrillLog | null;
}

/**
 * Último backup + os 10 mais recentes, do mais novo para o mais antigo — e o
 * último drill de restore (E89): a tela responde "quando foi a última cópia?"
 * e, ao lado, "quando alguém provou que ela VOLTA?".
 */
export async function statusBackup(): Promise<StatusBackup> {
  const recentes = await db
    .select()
    .from(backupLogTable)
    .orderBy(desc(backupLogTable.iniciadoEm))
    .limit(10);
  const [ultimoDrill] = await db
    .select()
    .from(restoreDrillLogTable)
    .orderBy(desc(restoreDrillLogTable.iniciadoEm))
    .limit(1);
  return { ultimo: recentes[0] ?? null, recentes, ultimoDrill: ultimoDrill ?? null };
}
