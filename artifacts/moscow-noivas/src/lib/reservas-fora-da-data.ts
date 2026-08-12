import { diaDeNegocio } from "@/lib/financeiro/datas";

/**
 * S-O74/E189 — **a data do casamento mudou na ficha e a reserva ficou para
 * trás.**
 *
 * O V5 do CODE-REVIEW em uma frase: *"a noiva muda o casamento de 12/09 para
 * 03/10, a ficha passa a dizer 03/10, o bloqueio fica em 12/09 para sempre"*.
 * O conserto do servidor existe desde o **E173** — `PATCH /reservas/:id`
 * propaga a data nova a todos os bloqueios vinculados **e ao contrato ATIVO**,
 * gravando `CONTRATO_DATA_SEGUIU_RESERVA` na trilha —, e até o E189 **nenhuma
 * tela o chamava**: `listReservas`, `createReserva`, `updateReserva` e
 * `deleteReserva` tinham zero chamadores em `artifacts/` e `e2e/`.
 *
 * Esta é a régua que faz a divergência aparecer. Ela é pura de propósito (o
 * molde da S-O49/E181): a tela desenha, a régua decide.
 *
 * **O que ela compara, e por quê.** `casamentoData` é DATA DE NEGÓCIO —
 * ancorada ao meio-dia de São Paulo (`diaParaISO`, `formatos.ts:151`) —, então
 * a pergunta é sobre o DIA, não sobre o instante. Comparar as strings ISO cruas
 * acusaria divergência entre `2028-09-12T15:00:00.000Z` e
 * `2028-09-12T15:00:00Z`, que são o mesmo casamento.
 *
 * **Quais reservas entram:**
 *
 * - `CANCELADA` fica fora — a peça já voltou ao acervo e mover a data dela não
 *   quer dizer nada.
 * - `CONCLUIDA` fica fora, e este é o caso que importa declarar: o casamento
 *   já aconteceu. Reescrever a data de uma reserva concluída falsificaria o que
 *   foi vestido — é a mesma razão pela qual o E173 só propaga para contrato
 *   **ATIVO**.
 * - Sobram `EM_MONTAGEM` e `CONFIRMADA`, que são as duas em que a peça está
 *   presa para uma data futura.
 *
 * Devolve `null` quando não há o que dizer — sem data na ficha, sem reserva, ou
 * todas as reservas já no dia certo. Um aviso que aparece sempre vira moldura e
 * ninguém lê (é a régua do `proximoPasso`, F5/E98).
 */

/**
 * O recorte do payload que a régua lê — estrutural, como a `donaDaFicha`
 * (S-O54/E181): a tela passa o `Reserva` do cliente gerado e o teste passa o
 * mínimo, sem montar objeto de cem campos para provar uma comparação de dia.
 */
export type ReservaDaNoiva = {
  id: string;
  casamentoData: string;
  status: string;
  bloqueios?: {
    canceladoEm?: string | null;
    vestido?: { codigo: string; nome: string } | null;
  }[];
};

/** Uma reserva que ficou num dia diferente do que a ficha da noiva diz. */
export type ReservaForaDaData = {
  reservaId: string;
  /** O dia em que a reserva ficou (YYYY-MM-DD). */
  dia: string;
  /** As peças vivas presas a ela — "codigo · nome", como o livro de reservas. */
  pecas: string[];
};

export type AvisoDeDataDaNoiva = {
  /** O dia que a ficha da noiva diz hoje (YYYY-MM-DD) — o destino do gesto. */
  dia: string;
  /**
   * O mesmo destino como o servidor o quer, cru do payload da noiva.
   *
   * Ele viaja aqui em vez de a tela reler `lead.casamentoData` no clique
   * porque este objeto só existe quando a data existe — e a tela, relendo,
   * precisaria afirmar o que a régua já sabe (`lead!.casamentoData!`, que é
   * a S-O65/S-O66 na letra).
   */
  instante: string;
  /** As reservas que ficaram para trás, da mais antiga para a mais recente. */
  foraDaData: ReservaForaDaData[];
};

const STATUS_QUE_AINDA_SEGURAM_A_PECA = new Set(["EM_MONTAGEM", "CONFIRMADA"]);

export function reservasForaDaData(
  casamentoDaNoiva: string | null | undefined,
  reservas: ReservaDaNoiva[] | undefined,
): AvisoDeDataDaNoiva | null {
  if (!casamentoDaNoiva) return null;
  const dia = diaDeNegocio(casamentoDaNoiva);

  const foraDaData = (reservas ?? [])
    .filter((r) => STATUS_QUE_AINDA_SEGURAM_A_PECA.has(r.status))
    .filter((r) => diaDeNegocio(r.casamentoData) !== dia)
    .map((r) => ({
      reservaId: r.id,
      dia: diaDeNegocio(r.casamentoData),
      pecas: (r.bloqueios ?? [])
        .filter((b) => !b.canceladoEm && b.vestido)
        .map((b) => `${b.vestido!.codigo} · ${b.vestido!.nome}`),
    }))
    .sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));

  return foraDaData.length > 0 ? { dia, instante: casamentoDaNoiva, foraDaData } : null;
}
