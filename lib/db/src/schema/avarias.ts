import { pgTable, text, timestamp, decimal, customType, index } from "drizzle-orm/pg-core";
import { lojasTable } from "./loja";
import { bloqueioVestidosTable } from "./atendimentos";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Avarias na devolução (E71). O atraso já era detectado (ATRASO_DEVOLUCAO,
 * derivado das datas reais do bloqueio), mas a CONSEQUÊNCIA não existia: o
 * vestido voltava manchado ou rasgado e o registro morria numa conversa. A
 * avaria vira linha com foto (evidência, não vitrine — mesma validação por
 * magic bytes do E3) e, quando há contrato, o custo pode virar parcela avulsa
 * cobrável pela mesma régua de cobrança de sempre.
 *
 * Autor desnormalizado (nome), como no audit_log: a linha sobrevive à saída
 * de quem registrou — perder quem viu é recuperável, perder a avaria não.
 */
export const avariasTable = pgTable(
  "avarias",
  {
    id: text("id").primaryKey(),
    lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
    bloqueioId: text("bloqueio_id")
      .notNull()
      .references(() => bloqueioVestidosTable.id, { onDelete: "cascade" }),
    descricao: text("descricao").notNull(),
    /** Custo estimado do reparo, em reais — null quando ainda não avaliado. */
    custoReparo: decimal("custo_reparo", { precision: 10, scale: 2, mode: "number" }),
    /** Foto-evidência (opcional). Mime sai do binário, nunca da palavra do cliente. */
    fotoBytes: bytea("foto_bytes"),
    fotoMime: text("foto_mime"),
    registradoPorNome: text("registrado_por_nome"),
    criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bloqueioIdx: index("avarias_bloqueio_id_idx").on(t.bloqueioId),
  }),
);

export type Avaria = typeof avariasTable.$inferSelect;
export type InsertAvaria = typeof avariasTable.$inferInsert;
