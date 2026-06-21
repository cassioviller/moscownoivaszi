import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { montarPlanilhaContabilidade } from "@/lib/financeiro/planilha-contabilidade";
import type { ItemContabil } from "@/lib/financeiro/contabilidade";

const item = (over: Partial<ItemContabil> = {}): ItemContabil => ({
  dataPagamento: new Date("2026-06-10T00:00:00.000Z"),
  quem: "Vendedora A",
  tipo: "COMISSAO",
  descricao: "Comissão 2026-05",
  competencia: "2026-05",
  valor: "1234.56",
  forma: "Pix",
  ...over,
});

describe("montarPlanilhaContabilidade", () => {
  it("gera uma aba 'Pagamentos' com cabeçalho + 1 linha por item", async () => {
    const buf = await montarPlanilhaContabilidade([item(), item({ tipo: "DESPESA", quem: null })]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf.buffer as ArrayBuffer);
    const ws = wb.getWorksheet("Pagamentos")!;
    expect(ws.rowCount).toBe(3); // cabeçalho + 2
    expect(ws.getRow(1).getCell(1).value).toBe("Data");
    expect(ws.getRow(1).getCell(6).value).toBe("Valor (R$)");
    expect(ws.getRow(2).getCell(6).value).toBe(1234.56); // valor como número
    expect(ws.getRow(3).getCell(3).value).toBe("Despesa"); // rótulo do tipo
  });
});
