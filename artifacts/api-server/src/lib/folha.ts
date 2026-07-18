/**
 * Folha de pagamento — o núcleo PURO: montar as contas SALARIO de uma
 * competência e montar o CSV da contabilidade.
 *
 * Puro de propósito (sem banco, sem Express, mesmo espírito de contrato-pdf.ts):
 * a idempotência da folha e o escape do CSV são exatamente as duas coisas que
 * precisam de teste unitário rápido — gerar a folha duas vezes não pode dobrar
 * o salário de ninguém, e uma vírgula na descrição não pode deslocar a coluna
 * da planilha da contabilidade.
 */

import { competenciaValida } from "./comissao";
import { montarCsv } from "./csv";

export { competenciaValida };
// Extraído para lib/csv.ts quando pagar/receber ganharam exportação (E5);
// re-exportado daqui para os consumidores e testes existentes.
export { escaparCsv } from "./csv";

// ───────────────────────── Geração da folha ─────────────────────────

/** O que a geração precisa saber de um salário recorrente. */
export type SalarioParaFolha = {
  id: string;
  usuarioId: string;
  valor: number;
  diaVencimento: number;
  ativo: boolean;
};

/** O que a geração precisa saber de uma conta SALARIO já existente na competência. */
export type ContaSalarioExistente = {
  colaboradorId: string | null;
  salarioRecorrenteId: string | null;
};

/** Uma conta a pagar pronta para inserir (sem id/lojaId — quem grava resolve). */
export type ContaDaFolha = {
  tipo: "SALARIO";
  colaboradorId: string;
  competencia: string;
  descricao: string;
  valorPrevisto: number;
  vencimento: Date;
  salarioRecorrenteId: string;
};

/**
 * Vencimento da conta de salário: o `diaVencimento` combinado, dentro da
 * competência, ancorado ao MEIO-DIA de São Paulo — `vencimento` é data de
 * NEGÓCIO, e nascer à meia-noite a faria escorregar um dia ao ser lida em UTC
 * (mesma âncora de vencimentoComissao e de diaParaISO no frontend).
 *
 * O dia é grampeado ao último dia do mês: um salário combinado para o dia 31
 * não existe em fevereiro, e "31/02" viraria 03/03 na aritmética do Date —
 * a folha de fevereiro venceria em março, calada.
 */
export function vencimentoDaFolha(competencia: string, diaVencimento: number): Date {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7)); // 1..12
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dia = Math.min(Math.max(diaVencimento, 1), ultimoDia);
  const pad = (v: number) => String(v).padStart(2, "0");
  return new Date(`${competencia}-${pad(dia)}T12:00:00-03:00`);
}

/**
 * As contas que FALTAM para a folha da competência estar completa.
 *
 * A idempotência mora aqui: um salário só vira conta se ainda não houver conta
 * SALARIO naquela competência para ele. "Para ele" é uma UNIÃO deliberada de
 * dois critérios — mesmo `salarioRecorrenteId` (o rastro da geração anterior)
 * OU mesmo `colaboradorId` (uma conta de salário lançada à mão, ou vinda de
 * uma recorrência antiga que foi trocada). O critério largo erra para o lado
 * seguro: no pior caso a folha deixa de gerar uma conta e alguém a lança à
 * mão; o critério estreito pagaria a mesma pessoa duas vezes no mesmo mês, e
 * isso só se descobre no extrato.
 *
 * Salários inativos não entram: `ativo: false` é a forma de tirar alguém da
 * folha sem apagar o histórico das contas que ele já originou.
 */
export function montarContasDaFolha(
  competencia: string,
  salarios: readonly SalarioParaFolha[],
  jaFeitas: readonly ContaSalarioExistente[],
): ContaDaFolha[] {
  const porRecorrencia = new Set(
    jaFeitas.map((c) => c.salarioRecorrenteId).filter((id): id is string => !!id),
  );
  const porColaborador = new Set(
    jaFeitas.map((c) => c.colaboradorId).filter((id): id is string => !!id),
  );

  return salarios
    .filter((s) => s.ativo)
    .filter((s) => !porRecorrencia.has(s.id) && !porColaborador.has(s.usuarioId))
    .map((s) => ({
      tipo: "SALARIO" as const,
      colaboradorId: s.usuarioId,
      competencia,
      descricao: `Salário ${competencia}`,
      valorPrevisto: s.valor,
      vencimento: vencimentoDaFolha(competencia, s.diaVencimento),
      salarioRecorrenteId: s.id,
    }));
}

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
