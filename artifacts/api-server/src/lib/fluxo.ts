/**
 * A linha do tempo do fluxo de caixa — a montagem que a rota GET
 * …/financeiro/fluxo sempre fez, extraída para ser reutilizada pelo export
 * CSV (S21/F34) em vez de copiada.
 *
 * O F34 pedia "UM pacote para a contabilidade" e ele nunca pôde nascer da
 * junção dos quatro exports: parcelas recortam por VENCIMENTO, folha por data
 * de PAGAMENTO — regime misto, que não fecha com o DRE nem com o fluxo. Aqui a
 * régua é uma só, a do CAIXA: entrada pela data real do recebimento
 * (`recebidoEm`), saída pela data real do pagamento (`data`), ambas lidas como
 * dia local de São Paulo (`instanteNoIntervalo`, nos motores do core). O CSV e
 * a tela do fluxo fecham por construção porque saem DESTA função.
 *
 * Módulo puro de propósito — nada de `db`: o teste de unidade
 * (`fluxo-csv-unit.test.ts`) prova a montagem sem subir Express nem banco.
 */

import {
  entradasDoIntervalo,
  saidasDoIntervalo,
  type Intervalo,
  type ParcelaPaga,
  type ResumoCaixa,
  type SaidaCaixa,
} from "@workspace/financeiro-core";
import { diaLocalSP } from "./folha";

export type ParcelaDoFluxo = ParcelaPaga & {
  id: string;
  numero: number;
  descricao?: string | null;
  contratoId: string | null;
  contrato?: { lead?: { noivaNome: string | null } | null } | null;
};

export type PagamentoDoFluxo = SaidaCaixa & {
  id: string;
  colaborador?: { nome: string } | null;
  itens?: readonly {
    contaPagar?: {
      descricao: string;
      fornecedor?: string | null;
      categoria?: string | null;
    } | null;
  }[];
};

export type MovimentoDoFluxo = {
  id: string;
  tipo: "ENTRADA" | "SAIDA";
  data: Date | string;
  valor: number;
  descricao: string;
  rotulo: string | null;
  contratoId: string | null;
};

/** "Entrada/sinal" para a parcela 0, "Parcela N" para as demais. */
function descricaoParcela(p: ParcelaDoFluxo): string {
  return p.descricao || (p.numero === 0 ? "Entrada/sinal" : `Parcela ${p.numero}`);
}

/**
 * Entradas e saídas do intervalo, mais recente primeiro — exatamente o
 * `movimentos` da resposta do fluxo.
 */
export function movimentosDoFluxo(
  parcelasRecebidas: readonly ParcelaDoFluxo[],
  pagamentos: readonly PagamentoDoFluxo[],
  intervalo: Intervalo,
): MovimentoDoFluxo[] {
  return [
    ...entradasDoIntervalo(parcelasRecebidas, intervalo).map(
      (p): MovimentoDoFluxo => ({
        id: `parcela-${p.id}`,
        tipo: "ENTRADA",
        data: p.recebidoEm!,
        valor: p.valorRecebido ?? 0,
        descricao: descricaoParcela(p),
        rotulo: p.contrato?.lead?.noivaNome ?? null,
        contratoId: p.contratoId,
      }),
    ),
    ...saidasDoIntervalo(pagamentos, intervalo).map((pg): MovimentoDoFluxo => {
      const contas = (pg.itens ?? [])
        .map((i) => i.contaPagar)
        .filter((c): c is NonNullable<typeof c> => !!c);
      return {
        id: `pagamento-${pg.id}`,
        tipo: "SAIDA",
        data: pg.data,
        valor: pg.valorPago,
        descricao: contas.length > 0 ? contas.map((c) => c.descricao).join(" · ") : "Pagamento",
        rotulo:
          pg.colaborador?.nome ??
          contas.find((c) => c.fornecedor)?.fornecedor ??
          contas.find((c) => c.categoria)?.categoria ??
          null,
        contratoId: null,
      };
    }),
  ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
}

const CABECALHO_FLUXO = ["Data", "Tipo", "Descrição", "Quem", "Valor"];

/**
 * As linhas do pacote: um movimento por linha (saída com sinal negativo,
 * importável sem retrabalho), dia no formato da contadora (DD/MM/AAAA, como os
 * outros quatro exports), e o resumo do período no rodapé — os MESMOS totais
 * que a tela mostra, somados em centavos no core.
 */
export function linhasCsvFluxo(
  movimentos: readonly MovimentoDoFluxo[],
  resumo: ResumoCaixa,
): string[][] {
  const linhas = [CABECALHO_FLUXO];
  for (const m of movimentos) {
    linhas.push([
      diaLocalSP(new Date(m.data)),
      m.tipo === "ENTRADA" ? "Entrada" : "Saída",
      m.descricao,
      m.rotulo ?? "",
      (m.tipo === "ENTRADA" ? m.valor : -m.valor).toFixed(2),
    ]);
  }
  linhas.push(["", "", "Entradas", "", resumo.entradas.toFixed(2)]);
  linhas.push(["", "", "Saídas", "", (-resumo.saidas).toFixed(2)]);
  linhas.push(["", "", "Saldo do período", "", resumo.saldo.toFixed(2)]);
  return linhas;
}
