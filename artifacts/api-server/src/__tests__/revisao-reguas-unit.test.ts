import { describe, expect, it } from "vitest";
import { parseValor, parseExtratoCSV } from "@workspace/financeiro-core";
import { recusaDeMover, slotsOferecidos } from "@workspace/agenda-core";
import { pdfDoContrato, type ContratoComPapel } from "../lib/contrato-do-papel";
import { vencimentoDaCompetencia } from "../lib/recorrencias";
import { diaLocalSP } from "../lib/folha";

/**
 * As quatro réguas puras que a revisão pegou lendo o mundo errado — cada uma
 * com o VERMELHO ANTES escrito no teste, porque o número é o argumento.
 */

describe("parseValor — o sinal não pode mudar a quantia por mil", () => {
  // ANTES: `/^\d{1,3}(\.\d{3})+$/` reprovava "-1.234" por começar em "-", o
  // texto caía no Number cru e virava -1,234. A conferência de caixa aceita
  // negativo de propósito, então a âncora de saldo era gravada mil vezes menor
  // e a projeção inteira nascia R$ 1.232,77 acima do caixa real.
  it("lê o negativo em pt-BR pela mesma régua do positivo", () => {
    expect(parseValor("1.234")).toBe(1234);
    expect(parseValor("-1.234")).toBe(-1234);
    expect(parseValor("+1.234")).toBe(1234);
    expect(parseValor("-1.234.567")).toBe(-1234567);
  });

  it("negativo com centavos e negativo cru continuam certos", () => {
    expect(parseValor("-1.234,56")).toBe(-1234.56);
    expect(parseValor("-1234.56")).toBe(-1234.56);
    expect(parseValor("-100")).toBe(-100);
  });
});

describe("parseExtratoCSV — documento não é dinheiro", () => {
  // ANTES: o valor era a primeira célula NUMÉRICA, e num extrato
  // Data;Documento;Histórico;Valor;Saldo o número do documento vencia. A linha
  // abaixo saía valendo R$ 123,00 no lugar de R$ 1.500,00; como a conciliação
  // casa por valor exato em centavos, o recebimento verdadeiro caía em
  // `soSistema`, um fantasma de R$ 123,00 caía em `soExtrato`, e o mês inteiro
  // era declarado divergente.
  it("ignora a coluna de documento e casa o valor certo", () => {
    const t = parseExtratoCSV("15/07/2026;000123;PIX RECEBIDO MARIA;1.500,00;12.345,67");
    expect(t).toEqual([
      { data: "2026-07-15", descricao: "PIX RECEBIDO MARIA", valor: 1500 },
    ]);
  });

  it("com cabeçalho o resultado é o mesmo — o cabeçalho nunca protegeu", () => {
    const t = parseExtratoCSV(
      ["Data;Doc;Historico;Valor", "15/07/2026;000123;PIX RECEBIDO;1.500,00"].join("\n"),
    );
    expect(t).toHaveLength(1);
    expect(t[0].valor).toBe(1500);
  });

  it("saída negativa e ponto de milhar sem centavos são lidos em pt-BR", () => {
    const t = parseExtratoCSV("16/07/2026;000987;PAGAMENTO FORNECEDOR;-1.230,50;9.769,50");
    expect(t[0].valor).toBe(-1230.5);
    // Sem NENHUMA célula escrita como dinheiro, a primeira numérica volta a ser
    // a aposta — é tudo o que a linha oferece.
    expect(parseExtratoCSV("16/07/2026;PAGAMENTO;-1500")[0].valor).toBe(-1500);
  });
});

describe("recusaDeMover — a prova tem de CABER no expediente", () => {
  const expediente = { aberturaHora: 9, fechamentoHora: 19, provaDuracao: 3 };
  const prova = { id: "p1", cabineId: "c1", vendedoraId: "v1", tipo: "PROVA" as const, inicio: "" };
  const emSP = (hhmm: string) => new Date(`2026-07-15T${hhmm}:00-03:00`);

  // ANTES: só o INÍCIO era conferido. Prova de 90 min às 18:30 numa loja que
  // fecha às 19h era aceita e terminava às 20:00 — uma hora depois de fechar —,
  // e a grade OFERECIA o slot. A noiva recebia a confirmação por WhatsApp de um
  // horário em que não há ninguém na loja.
  it("recusa a prova de 90 min que começa no último slot do dia", () => {
    expect(recusaDeMover(prova, { cabineId: "c1", inicio: emSP("18:30") }, [], expediente))
      .toBe("FORA_DO_HORARIO");
  });

  it("aceita a mesma prova quando ela termina no fechamento", () => {
    expect(recusaDeMover(prova, { cabineId: "c1", inicio: emSP("17:30") }, [], expediente))
      .toBeNull();
  });

  it("o atendimento de 1 slot continua cabendo às 18:30", () => {
    const atendimento = { ...prova, tipo: "ATENDIMENTO" as const };
    expect(recusaDeMover(atendimento, { cabineId: "c1", inicio: emSP("18:30") }, [], expediente))
      .toBeNull();
  });

  it("a grade deixa de OFERECER os slots em que a prova não cabe", () => {
    const oferecidos = slotsOferecidos(
      "2026-07-15",
      { cabineId: "c1", vendedoraId: "v1", tipo: "PROVA" },
      [],
      expediente,
    );
    const livres = oferecidos.filter((s) => s.recusa === null).map((s) => s.slot);
    expect(livres.at(-1)).toBe("17:30");
    expect(livres).not.toContain("18:00");
    expect(livres).not.toContain("18:30");
  });
});

describe("As réguas que estavam reescritas à mão", () => {
  // `vencimentoDaCompetencia` reimplementava `ultimoDiaDoMes` (o
  // `Date.UTC(ano, mes, 0)`) e `ancoraDeNegocio` (o `T12:00:00-03:00` cravado
  // na string). O comportamento não pode mudar — é o vencimento da folha.
  it("o vencimento da competência grampeia ao mês curto e ancora ao meio-dia SP", () => {
    expect(vencimentoDaCompetencia("2027-02", 31).toISOString()).toBe("2027-02-28T15:00:00.000Z");
    expect(vencimentoDaCompetencia("2028-02", 31).toISOString()).toBe("2028-02-29T15:00:00.000Z");
    expect(vencimentoDaCompetencia("2026-07", 5).toISOString()).toBe("2026-07-05T15:00:00.000Z");
    // Fora da faixa é grampeado dos dois lados.
    expect(vencimentoDaCompetencia("2026-07", 0).toISOString()).toBe("2026-07-01T15:00:00.000Z");
  });

  // `diaLocalSP` mantinha um SEGUNDO Intl com o mesmo fuso; agora deriva de
  // `diaLocal` e só troca a apresentação. O que ele imprime não muda — e a
  // borda da noite é o caso que importa.
  it("o dia da contabilidade continua sendo o de São Paulo", () => {
    expect(diaLocalSP(new Date("2026-07-29T00:30:00Z"))).toBe("28/07/2026");
    expect(diaLocalSP(new Date("2026-07-28T15:00:00Z"))).toBe("28/07/2026");
    expect(diaLocalSP(new Date("2026-01-01T02:00:00Z"))).toBe("31/12/2025");
  });
});

describe("PDF do contrato — a data do fechamento é INSTANTE, não dia civil", () => {
  const contrato = (fechadoEm: Date) =>
    ({
      id: "c1",
      loja: { nome: "Moscow Noivas" },
      lead: { noivaNome: "Ana Lima", whatsapp: null },
      parcelas: [],
      itens: [],
      cpf: null,
      vestidoDescricao: null,
      valorTotal: 8000,
      descontoTipo: null,
      descontoValor: null,
      formaPagamento: null,
      dataCasamento: null,
      dataRetirada: null,
      dataDevolucao: null,
      observacoes: null,
      fechadoEm,
    }) as unknown as ContratoComPapel;

  // ANTES: `fechado_em` é `timestamp defaultNow()` e era formatado com o
  // formatador UTC das datas de negócio. Contrato fechado às 21h30 de 28/07 em
  // São Paulo grava 2026-07-29T00:30Z, e o papel que a noiva assina saía com
  // "29/07/2026" — um dia à frente, em TODO contrato fechado entre 21h e a
  // meia-noite, e permanente porque o PDF é regerado do mesmo campo.
  it("imprime o dia de São Paulo para o contrato fechado às 21h30", () => {
    const txt = Buffer.from(pdfDoContrato(contrato(new Date("2026-07-29T00:30:00Z")))).toString("latin1");
    expect(txt).toContain("28/07/2026");
    expect(txt).not.toContain("29/07/2026");
  });

  it("meio do dia continua igual — o conserto só move a borda da noite", () => {
    const txt = Buffer.from(pdfDoContrato(contrato(new Date("2026-07-28T15:00:00Z")))).toString("latin1");
    expect(txt).toContain("28/07/2026");
  });
});
