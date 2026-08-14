import { pgTable, text, timestamp, decimal, customType, index } from "drizzle-orm/pg-core";
import { lojasTable } from "./loja";
import { bloqueioVestidosTable } from "./atendimentos";
import { parcelasTable } from "./financeiro";
import { avariaTipoEnum } from "./common/enums";

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
    /**
     * E214 — de qual cláusula esta taxa saiu: **14ª (limpeza)** ou **15ª
     * (dano)**. Ver `common/enums.ts` para o porquê de serem duas, e
     * `financeiro-core/avaria.ts` para as duas réguas.
     */
    tipo: avariaTipoEnum("tipo").notNull().default("DANO"),
    /**
     * E232/S-C1 — ONDE o dano foi constatado (5ª §3º). Na ENTREGA, a cláusula
     * manda a LOCADORA substituir a peça: cobrar da noiva é 422 na porta. O
     * default preserva o ciclo de sempre — a avaria da devolução.
     */
    constatadaEm: text("constatada_em", { enum: ["ENTREGA", "DEVOLUCAO"] })
      .notNull()
      .default("DEVOLUCAO"),
    /** Custo estimado do reparo, em reais — null quando ainda não avaliado. */
    custoReparo: decimal("custo_reparo", { precision: 10, scale: 2, mode: "number" }),
    /**
     * E214 — **por que este valor saiu da faixa que a cláusula manda.**
     *
     * A régua não impede a dona de decidir: obriga a dizer por quê. Preenchida
     * significa que a taxa está fora do que as cláusulas 14ª/15ª permitem — ou
     * que o teto do dano não pôde ser calculado porque a peça não está em
     * contrato — e que alguém escreveu a razão. A mesma frase vai para a trilha
     * (`AVARIA_FORA_DA_FAIXA`), com os números do veredicto ao lado.
     *
     * Nula é o caso normal: valor dentro da faixa não precisa de explicação.
     */
    justificativaDaTaxa: text("justificativa_da_taxa"),
    /** Foto-evidência (opcional). Mime sai do binário, nunca da palavra do cliente. */
    fotoBytes: bytea("foto_bytes"),
    fotoMime: text("foto_mime"),
    /**
     * E97: a parcela que cobrou este reparo. Preenchida significa "já cobrada",
     * e é o que impede a segunda cobrança (409) e a remoção da avaria — cuja
     * FOTO é a prova que sustenta a parcela.
     *
     * SET NULL e não CASCADE: perder o vínculo é recuperável, perder o registro
     * do dano não é. Removida a parcela pelo caminho legítimo, a avaria e a foto
     * ficam, e o reparo volta a ser cobrável.
     */
    parcelaId: text("parcela_id").references(() => parcelasTable.id, { onDelete: "set null" }),
    registradoPorNome: text("registrado_por_nome"),
    criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bloqueioIdx: index("avarias_bloqueio_id_idx").on(t.bloqueioId),
    /**
     * S-A20 — existia nos bancos e não aqui. O script do E97
     * (`docs/migracoes/2026-07-27-e97-avaria-parcela.sql:42`) o criou junto com
     * a coluna; o schema nunca o declarou, e todo banco nascido de `push` ou
     * `migrate` ficou sem ele. É por `parcela_id` que se pergunta se este
     * reparo já foi cobrado.
     */
    parcelaIdx: index("avarias_parcela_id_idx").on(t.parcelaId),
  }),
);

export type Avaria = typeof avariasTable.$inferSelect;
export type InsertAvaria = typeof avariasTable.$inferInsert;
