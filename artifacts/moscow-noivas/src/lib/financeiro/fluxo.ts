import type { Parcela, Pagamento } from "@workspace/api-client-react";
import { entradasDoIntervalo, saidasDoIntervalo, type Intervalo } from "@workspace/financeiro-core";

/**
 * E25: as agregações de caixa (resumo, tendência, horizonte) moram no motor
 * único (@workspace/financeiro-core) — o mesmo que o api-server usa. Aqui fica
 * só o que é de TELA: `movimentos`, que monta a linha do tempo com rótulo de
 * noiva e href de navegação. fluxo.test.ts ao lado prova o core.
 */
export {
  entradasDoIntervalo,
  saidasDoIntervalo,
  resumoCaixa,
  tendenciaCaixa,
  horizonteAberto,
  type ResumoCaixa,
  type PontoTendencia,
  type HorizonteAberto,
} from "@workspace/financeiro-core";

export type Movimento = {
  id: string;
  tipo: "ENTRADA" | "SAIDA";
  data: string;
  valor: number;
  /** Quem/o quê, quando dá para nomear (noiva, colaborador, fornecedor). */
  rotulo: string | null;
  descricao: string;
  /** Destino do clique, quando existe uma tela que explica o movimento. */
  href: string | null;
};

/** Rótulo de uma parcela na linha do tempo. */
function descricaoParcela(p: Parcela): string {
  return p.descricao || (p.numero === 0 ? "Entrada/sinal" : `Parcela ${p.numero}`);
}

/**
 * Linha do tempo unificada do intervalo, mais recente primeiro.
 * `nomePorContrato` resolve a noiva: a lista de parcelas do financeiro já vem
 * com o contrato e o lead aninhados, mas quem chama decide como nomear.
 */
export function movimentos(
  parcelas: readonly Parcela[],
  pagamentos: readonly Pagamento[],
  intervalo: Intervalo,
  ctx: { lojaId: string; nomeDaNoiva?: (p: Parcela) => string | null },
): Movimento[] {
  const entradas: Movimento[] = entradasDoIntervalo(parcelas, intervalo).map((p) => ({
    id: `parcela-${p.id}`,
    tipo: "ENTRADA" as const,
    data: p.recebidoEm!, // garantido pelo filtro
    valor: p.valorRecebido ?? 0,
    descricao: descricaoParcela(p),
    rotulo: ctx.nomeDaNoiva?.(p) ?? null,
    href: `/loja/${ctx.lojaId}/contratos/${p.contratoId}`,
  }));

  const saidas: Movimento[] = saidasDoIntervalo(pagamentos, intervalo).map((pg) => {
    const contas = (pg.itens ?? []).map((i) => i.contaPagar).filter((c): c is NonNullable<typeof c> => !!c);
    return {
      id: `pagamento-${pg.id}`,
      tipo: "SAIDA" as const,
      data: pg.data,
      valor: pg.valorPago,
      descricao: contas.length > 0 ? contas.map((c) => c.descricao).join(" · ") : "Pagamento",
      rotulo:
        pg.colaborador?.nome ??
        contas.find((c) => c.fornecedor)?.fornecedor ??
        contas.find((c) => c.categoria)?.categoria ??
        null,
      href: `/loja/${ctx.lojaId}/financeiro/pagar`,
    };
  });

  return [...entradas, ...saidas].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
  );
}
