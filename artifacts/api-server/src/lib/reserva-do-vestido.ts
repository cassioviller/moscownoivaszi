import { db, bloqueioVestidosTable, vestidosTable } from "@workspace/db";
import { and, eq, isNull, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { reancorarDataDeNegocio } from "@workspace/financeiro-core";
import {
  verificarDisponibilidade,
  ocupacaoFisica,
  VALIDADE_DO_BLOQUEIO_ORFAO_DIAS,
  type BloqueioJanelasInput,
  type ConflitoDetalhe,
  type DbExecutor,
} from "./disponibilidade";

/**
 * E162 — o criador de reserva vira função, porque passou a ter DUAS portas.
 *
 * O ângulo 01 da revisão mediu: o sistema tinha UM criador de bloqueio
 * (`reservas.ts:507`), atrás de sessão + módulo `vestidos` — e nenhum dos
 * caminhos que fecham a venda o chamava. O E162 abre a segunda porta
 * (`POST /orcamentos/:id/reservar`, gate `leads.criar` — decisão R10), e as
 * duas passam a compartilhar ESTA transação: `FOR UPDATE` na linha do vestido
 * (S-M22 — serializa os criadores concorrentes), verificação pelo executor da
 * transação e o envelope físico materializado. Uma régua, duas permissões.
 */
export type CriarReservaParams = {
  lojaId: string;
  vestidoId: string;
  leadId: string | null;
  tipo: "RESERVA_CASAMENTO" | "MANUTENCAO";
  casamentoData: Date | null;
  inicio?: Date | null;
  fim?: Date | null;
  observacao?: string | null;
  reservaId?: string | null;
};

export type DesfechoCriarReserva =
  | { bloqueio: typeof bloqueioVestidosTable.$inferSelect }
  | { conflitos: ConflitoDetalhe[] };

/**
 * E223 — a TERCEIRA porta é a troca de peça do contrato, e ela chega com a
 * transação já aberta (a dela tranca contrato → bloqueio antigo antes desta
 * régua rodar, pela ordem do módulo). Com `executor`, o corpo roda como
 * transação ANINHADA (savepoint) da de quem chamou — atômico com ela; sem,
 * abre a própria, como sempre. A forma `(executor ?? db).transaction(cb)` com
 * o callback LITERAL não é estilo: a varredura de trancas lê o corpo de
 * `.transaction(...)` no texto, e esconder o corpo numa variável faria a
 * porta desta lib contar como ABERTA (medido no E223).
 */
export async function criarReservaDeVestido(
  params: CriarReservaParams,
  executor?: DbExecutor,
): Promise<DesfechoCriarReserva> {
  const id = randomUUID();
  /**
   * S-O117 — a porta obriga. As duas portas recebem a data já coagida a `Date`
   * pelo zod, e o que chega delas vai para a coluna e para a conta das janelas.
   * Ancorar aqui, uma vez, é o que faz as duas gravarem o mesmo instante para o
   * mesmo dia — e o que faz a comparação SQL (`gte(casamentoData, hoje)`) e o
   * `to_char at time zone` da sazonalidade acertarem o dia sem saber disso.
   */
  const casamentoData = params.casamentoData ? reancorarDataDeNegocio(params.casamentoData) : null;
  const candidato: BloqueioJanelasInput = {
    id,
    tipo: params.tipo,
    casamentoData,
    provaDataReal: null,
    retiradaDataReal: null,
    devolucaoDataReal: null,
    lavagemConcluidaEm: null,
    inicio: params.inicio ?? null,
    fim: params.fim ?? null,
  };

  return await (executor ?? db).transaction(async (tx) => {
    await tx.select({ id: vestidosTable.id }).from(vestidosTable)
      .where(eq(vestidosTable.id, params.vestidoId))
      .for("update");
    /**
     * E228/S-C60 — a solta do órfão vencido vira FATO aqui, no momento em que
     * alguém precisa da peça. A régua de disponibilidade já o ignora, mas o
     * EXCLUDE do banco só enxerga `canceladoEm`: sem esta escrita, o INSERT
     * da noiva B morreria em 23P01 contra um bloqueio que ninguém defende
     * mais — medido no vermelho deste épico (`CONFLITO_DE_DISPONIBILIDADE`
     * sobre órfão de 8 dias). Dentro da MESMA transação e depois do
     * `FOR UPDATE`, pela disciplina S-M22. `retiradaDataReal IS NULL` porque
     * física ganha de prazo: o órfão que já saiu não expira (E225).
     */
    await tx.update(bloqueioVestidosTable)
      .set({ canceladoEm: new Date(), updatedAt: new Date() })
      .where(and(
        eq(bloqueioVestidosTable.lojaId, params.lojaId),
        eq(bloqueioVestidosTable.vestidoId, params.vestidoId),
        eq(bloqueioVestidosTable.tipo, "RESERVA_CASAMENTO"),
        isNull(bloqueioVestidosTable.leadId),
        isNull(bloqueioVestidosTable.reservaId),
        isNull(bloqueioVestidosTable.canceladoEm),
        isNull(bloqueioVestidosTable.retiradaDataReal),
        lt(
          bloqueioVestidosTable.createdAt,
          new Date(Date.now() - VALIDADE_DO_BLOQUEIO_ORFAO_DIAS * 86_400_000),
        ),
      ));
    const resultado = await verificarDisponibilidade({
      lojaId: params.lojaId,
      vestidoId: params.vestidoId,
      candidato,
      hoje: new Date(),
      executor: tx,
    });
    if (!resultado.disponivel) return { conflitos: resultado.conflitos };

    const ocupacao = ocupacaoFisica(candidato, resultado.regra);

    const [bloqueio] = await tx.insert(bloqueioVestidosTable).values({
      id,
      lojaId: params.lojaId,
      vestidoId: params.vestidoId,
      leadId: params.leadId ?? null,
      tipo: params.tipo,
      casamentoData,
      inicio: params.inicio ?? null,
      fim: params.fim ?? null,
      observacao: params.observacao ?? null,
      reservaId: params.reservaId ?? null,
      ocupacaoInicio: ocupacao?.inicio ?? null,
      ocupacaoFim: ocupacao?.fim ?? null,
    }).returning();
    return { bloqueio: bloqueio! };
  });
}
