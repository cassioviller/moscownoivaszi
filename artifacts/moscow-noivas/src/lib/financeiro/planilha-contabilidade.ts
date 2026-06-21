// src/lib/financeiro/planilha-contabilidade.ts
// Monta a planilha .xlsx da contabilidade (isola o exceljs). Datas em UTC; valor como número.
import ExcelJS from "exceljs";
import type { ItemContabil } from "./contabilidade";

const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const ROTULO_TIPO: Record<ItemContabil["tipo"], string> = {
  DESPESA: "Despesa",
  FORNECEDOR: "Fornecedor",
  SALARIO: "Salário",
  COMISSAO: "Comissão",
};
const CABECALHO = ["Data", "Quem", "Tipo", "Descrição", "Competência", "Valor (R$)", "Forma"];

export async function montarPlanilhaContabilidade(itens: ItemContabil[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pagamentos");
  ws.addRow(CABECALHO);
  for (const i of itens) {
    ws.addRow([
      fmtData.format(i.dataPagamento),
      i.quem ?? "",
      ROTULO_TIPO[i.tipo],
      i.descricao,
      i.competencia ?? "",
      Number(i.valor),
      i.forma ?? "",
    ]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
