import { pgTable, text, timestamp, bigint, index } from "drizzle-orm/pg-core";

/**
 * Registro de backups do sistema (E30). Diferente do audit_log (E10), que é por
 * loja: um backup é o dump do banco INTEIRO — um evento de infraestrutura, sem
 * dono de loja. É a linha que a tela de Configurações lê para responder a
 * pergunta do SRE: "quando foi o último backup?".
 *
 * O autor vai desnormalizado (nome) como no audit_log: um backup agendado não
 * tem autor; um manual guarda quem apertou o botão, e a linha sobrevive à
 * remoção do membro. Append-only — cada execução é uma linha nova.
 */
export const backupLogTable = pgTable(
  "backup_log",
  {
    id: text("id").primaryKey(),
    /** Como o backup foi disparado: rotina agendada ou botão manual. */
    gatilho: text("gatilho").notNull(),
    /** "em_andamento" enquanto o pg_dump roda; "ok" ou "erro" ao terminar. */
    status: text("status").notNull(),
    iniciadoEm: timestamp("iniciado_em", { withTimezone: true }).notNull().defaultNow(),
    concluidoEm: timestamp("concluido_em", { withTimezone: true }),
    /** Tamanho do arquivo gerado (bytes) — só quando status = "ok". */
    tamanhoBytes: bigint("tamanho_bytes", { mode: "number" }),
    /** Caminho/nome do arquivo do dump no servidor. */
    arquivo: text("arquivo"),
    /** Nome de quem disparou o backup manual (null nos agendados). */
    autorNome: text("autor_nome"),
    /** Mensagem do erro quando status = "erro". */
    erro: text("erro"),
  },
  (t) => ({
    iniciadoEmIdx: index("backup_log_iniciado_em_idx").on(t.iniciadoEm),
  }),
);

export type BackupLog = typeof backupLogTable.$inferSelect;
