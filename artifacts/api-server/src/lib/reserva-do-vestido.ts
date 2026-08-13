import { db, bloqueioVestidosTable, vestidosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { reancorarDataDeNegocio } from "@workspace/financeiro-core";
import {
  verificarDisponibilidade,
  ocupacaoFisica,
  type BloqueioJanelasInput,
  type ConflitoDetalhe,
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

export async function criarReservaDeVestido(params: CriarReservaParams): Promise<DesfechoCriarReserva> {
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

  return await db.transaction(async (tx) => {
    await tx.select({ id: vestidosTable.id }).from(vestidosTable)
      .where(eq(vestidosTable.id, params.vestidoId))
      .for("update");
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
