import { describe, expect, it } from "vitest";
import {
  parseExtrato,
  parseExtratoOFX,
  parseExtratoCSV,
  conciliarExtrato,
  type MovimentoSistema,
} from "@workspace/financeiro-core";

/**
 * E70 — conciliação sem tocar a rede.
 *
 * O usuário sobe o arquivo que o banco exporta; parser e casamento são puros.
 * O que se prova: OFX SGML de banco real (tags sem fechar), CSV brasileiro
 * (dd/mm/aaaa e vírgula decimal), e o pareamento por valor exato em centavos
 * com tolerância de data — determinista no empate.
 */

const OFX = `
OFXHEADER:100
<OFX>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260715120000[-3:BRT]
<TRNAMT>1500.00
<MEMO>PIX RECEBIDO MARIA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260716
<TRNAMT>-230.50
<NAME>PAGAMENTO FORNECEDOR
</STMTTRN>
</BANKTRANLIST>
</OFX>`;

const CSV = [
  "Data;Descrição;Valor;Saldo",
  '15/07/2026;"PIX RECEBIDO MARIA";1.500,00;10.000,00',
  "16/07/2026;PAGAMENTO FORNECEDOR;-230,50;9.769,50",
  ";Total do período;;9.769,50",
].join("\n");

describe("parseExtrato (E70)", () => {
  it("OFX SGML com tags sem fechar: lê data, valor com sinal e memo", () => {
    const t = parseExtratoOFX(OFX);
    expect(t).toEqual([
      { data: "2026-07-15", descricao: "PIX RECEBIDO MARIA", valor: 1500 },
      { data: "2026-07-16", descricao: "PAGAMENTO FORNECEDOR", valor: -230.5 },
    ]);
  });

  it("CSV brasileiro: dd/mm/aaaa, vírgula decimal, ponto de milhar — e o valor é a PRIMEIRA célula numérica, não o saldo", () => {
    const t = parseExtratoCSV(CSV);
    expect(t).toHaveLength(2);
    expect(t[0]).toEqual({ data: "2026-07-15", descricao: "PIX RECEBIDO MARIA", valor: 1500 });
    expect(t[1].valor).toBe(-230.5);
  });

  it("cabeçalho e rodapé de total caem fora sozinhos", () => {
    const t = parseExtratoCSV(CSV);
    expect(t.some((x) => x.descricao.includes("Total"))).toBe(false);
  });

  it("detecta o formato e recusa lixo com mensagem", () => {
    expect(parseExtrato(OFX)).toMatchObject({ ok: true, formato: "ofx" });
    expect(parseExtrato(CSV)).toMatchObject({ ok: true, formato: "csv" });
    expect(parseExtrato("nada a ver")).toMatchObject({ ok: false });
  });
});

describe("conciliarExtrato (E70)", () => {
  const movimentos: MovimentoSistema[] = [
    { id: "r1", data: "2026-07-15", descricao: "Entrada Maria", valor: 1500, tipo: "recebimento" },
    { id: "p1", data: "2026-07-17", descricao: "Fornecedor", valor: 230.5, tipo: "pagamento" },
    { id: "r2", data: "2026-07-20", descricao: "Parcela Ana", valor: 800, tipo: "recebimento" },
  ];

  it("casa por valor exato e sentido, com tolerância de data", () => {
    const r = conciliarExtrato(parseExtratoOFX(OFX), movimentos);
    expect(r.casadas.map((c) => c.movimento.id).sort()).toEqual(["p1", "r1"]);
    expect(r.soExtrato).toEqual([]);
    expect(r.soSistema.map((m) => m.id)).toEqual(["r2"]);
  });

  it("fora da tolerância não casa — vira pendência dos dois lados", () => {
    const r = conciliarExtrato(
      [{ data: "2026-07-10", descricao: "PIX", valor: 800 }],
      movimentos,
      { toleranciaDias: 2 },
    );
    expect(r.casadas).toEqual([]);
    expect(r.soExtrato).toHaveLength(1);
    expect(r.soSistema.map((m) => m.id)).toContain("r2");
  });

  it("empate de valor resolve pelo mais próximo em data, um-para-um", () => {
    const dois: MovimentoSistema[] = [
      { id: "a", data: "2026-07-14", descricao: "", valor: 100, tipo: "recebimento" },
      { id: "b", data: "2026-07-15", descricao: "", valor: 100, tipo: "recebimento" },
    ];
    const r = conciliarExtrato(
      [{ data: "2026-07-15", descricao: "PIX", valor: 100 }],
      dois,
    );
    expect(r.casadas).toHaveLength(1);
    expect(r.casadas[0].movimento.id).toBe("b");
    expect(r.soSistema.map((m) => m.id)).toEqual(["a"]);
  });

  it("centavo diferente NÃO casa — conciliação não arredonda", () => {
    const r = conciliarExtrato(
      [{ data: "2026-07-15", descricao: "PIX", valor: 1500.01 }],
      movimentos,
    );
    expect(r.casadas).toEqual([]);
  });
});
