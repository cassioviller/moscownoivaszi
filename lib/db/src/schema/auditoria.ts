import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { lojasTable } from "./loja";
import { usuariosTable } from "./usuarios";

/**
 * Trilha de auditoria transversal (E10): uma linha por ação sensível — quem,
 * o quê, em qual registro, quando. Generaliza o padrão que o I10 abriu com as
 * colunas de baixa no contrato: lá o rastro é acoplado à entidade; aqui é a
 * linha do tempo que atravessa entidades.
 *
 * `acao` é texto versionado pela aplicação (união de tipos no api-server), não
 * pgEnum: trilha nova não pode exigir migration para existir. Log é
 * append-only — nada de updatedAt, nada de UPDATE.
 */
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    lojaId: text("loja_id")
      .notNull()
      .references(() => lojasTable.id, { onDelete: "cascade" }),
    // Autor pode ser removido da equipe; a linha fica ("perder quem fez é
    // recuperável", padrão das FKs de autoria) — o nome vai desnormalizado.
    usuarioId: text("usuario_id").references(() => usuariosTable.id, { onDelete: "set null" }),
    usuarioNome: text("usuario_nome").notNull(),
    acao: text("acao").notNull(),
    entidade: text("entidade").notNull(),
    entidadeId: text("entidade_id").notNull(),
    /** Contexto legível da ação (valores, motivo, ids relacionados). */
    detalhe: jsonb("detalhe"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    lojaCriadoEmIdx: index("audit_log_loja_criado_em_idx").on(t.lojaId, t.criadoEm),
  }),
);

export type AuditLog = typeof auditLogTable.$inferSelect;
