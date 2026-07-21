/**
 * O fechamento com a contabilidade — o núcleo PURO do CSV do extrato.
 *
 * A GERAÇÃO das contas morava aqui e saiu para `recorrencias.ts` (E48), quando
 * deixou de ser só folha de salário: o mesmo motor passou a gerar aluguel e
 * fornecedor fixo, e "folha" ficou nome pequeno demais para ele. Aqui continua
 * o que é folha e contabilidade de fato.
 *
 * Puro de propósito (sem banco, sem Express, mesmo espírito de contrato-pdf.ts):
 * uma vírgula na descrição não pode deslocar a coluna da planilha que a
 * contabilidade importa — é isso que o teste unitário rápido protege.
 */

import { competenciaValida } from "./comissao";
import { montarCsv } from "./csv";

export { competenciaValida };
// Extraído para lib/csv.ts quando pagar/receber ganharam exportação (E5);
// re-exportado daqui para os consumidores e testes existentes.
export { escaparCsv } from "./csv";

// ───────────────────────── CSV da contabilidade ─────────────────────────

/**
 * Uma linha do extrato contábil: um ITEM de pagamento (o rateio por conta),
 * não o pagamento inteiro — é o item que carrega a conta, a competência e o
 * valor que aquela dívida consumiu da saída.
 */
export type ItemContabil = {
  /** INSTANTE do pagamento; o dia dele só existe num fuso (ver diaLocalSP). */
  dataPagamento: Date;
  colaborador: string | null;
  descricao: string;
  competencia: string | null;
  /** Reais (a fatia rateada — PagamentoItem.valor). */
  valor: number;
  forma: string | null;
};

const CABECALHO = ["Data", "Colaborador", "Descrição", "Competência", "Valor", "Forma"];


const formatadorDiaSP = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Dia (DD/MM/AAAA) em que um INSTANTE caiu no fuso da loja. */
export function diaLocalSP(instante: Date): string {
  return formatadorDiaSP.format(instante);
}

/**
 * O CSV da contabilidade. Decisão consciente: CSV e não XLSX. A origem gerava
 * XLSX via exceljs; aqui não existe nenhuma lib de planilha e o precedente do
 * repo é não trazer uma (contrato-pdf.ts desenha o PDF à mão). CSV é o formato
 * que a contabilidade importa e que o Excel abre.
 *
 * Separador vírgula e decimal com PONTO: é o CSV canônico (RFC 4180), sem
 * ambiguidade para quem importa por programa. Terminador CRLF pelo mesmo
 * motivo. O BOM fica a cargo de quem serve o arquivo (a rota) — é detalhe de
 * transporte, não do conteúdo.
 */
export function montarCsvContabilidade(itens: readonly ItemContabil[]): string {
  const linhas = [CABECALHO];
  for (const i of itens) {
    linhas.push([
      diaLocalSP(i.dataPagamento),
      i.colaborador ?? "",
      i.descricao,
      i.competencia ?? "",
      i.valor.toFixed(2),
      i.forma ?? "",
    ]);
  }
  return montarCsv(linhas);
}
