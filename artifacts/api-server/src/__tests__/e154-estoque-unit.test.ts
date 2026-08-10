import { describe, expect, it } from "vitest";
import {
  comprometidoNoDia,
  janelaCobre,
  janelaDeUsoDoContrato,
} from "../lib/estoque";
import { REGRA_DEFAULT } from "../lib/disponibilidade";

/**
 * E154 — a régua que diz quantos saiotes saem no dia.
 *
 * O acervo decide POR PEÇA e bloqueia; o estoque decide POR CONTAGEM e avisa.
 * Aqui está a contagem, sem banco: a janela de uso de cada contrato e a soma
 * do que ela cobre.
 *
 * Todas as datas nascem em `T12:00:00-03:00` — meio-dia de São Paulo. A âncora
 * importa: `new Date("2026-09-19")` é meia-noite UTC, que em SP ainda é dia 18,
 * e a janela sairia um dia à esquerda.
 */
const meioDia = (dia: string) => new Date(`${dia}T12:00:00-03:00`);

describe("E154 — janela de uso do contrato", () => {
  it("sem data real, a janela é a do casamento: 3 dias antes, 2 depois (regra padrão)", () => {
    const j = janelaDeUsoDoContrato(
      { dataCasamento: meioDia("2026-09-19"), dataRetirada: null, dataDevolucao: null },
      REGRA_DEFAULT,
    );
    expect(j).toEqual({ inicio: "2026-09-16", fim: "2026-09-21" });
  });

  it("a devolução REAL manda no fim, e a retirada real antecipada manda no início", () => {
    const j = janelaDeUsoDoContrato(
      {
        dataCasamento: meioDia("2026-09-19"),
        dataRetirada: meioDia("2026-09-10"),
        dataDevolucao: meioDia("2026-09-20"),
      },
      REGRA_DEFAULT,
    );
    expect(j).toEqual({ inicio: "2026-09-10", fim: "2026-09-20" });
  });

  it("retirada real DEPOIS do início previsto não encurta a janela — a peça já estava presa", () => {
    const j = janelaDeUsoDoContrato(
      { dataCasamento: meioDia("2026-09-19"), dataRetirada: meioDia("2026-09-18"), dataDevolucao: null },
      REGRA_DEFAULT,
    );
    expect(j?.inicio).toBe("2026-09-16");
    // Este teste pregava `fim: "2026-09-21"` de passagem — era a S-M6: o
    // previsto fechando a janela de uma peça que ainda está na rua.
    expect(j?.fim).toBeNull();
  });

  /**
   * S-M6 — retirada sem devolução deixa a janela ABERTA mesmo COM casamento
   * marcado. O docstring sempre prometeu ("como em `janelasDoBloqueio`") e o
   * código fechava em `casamento + usoDiasDepois`: o saiote devolvido com
   * atraso aparecia livre na contagem enquanto a metade do vestido, do mesmo
   * contrato, seguia presa — as duas discordando sobre o mesmo dia.
   */
  it("S-M6 — saiu e não voltou, COM casamento marcado: a janela também fica aberta", () => {
    const j = janelaDeUsoDoContrato(
      { dataCasamento: meioDia("2026-09-19"), dataRetirada: meioDia("2026-09-16"), dataDevolucao: null },
      REGRA_DEFAULT,
    );
    // VERMELHO ANTES: fim "2026-09-21" — e em 22/09 a peça contava como livre.
    expect(j).toEqual({ inicio: "2026-09-16", fim: null });
    expect(janelaCobre(j!, "2026-09-22")).toBe(true);
  });

  it("saiu e não voltou, sem casamento marcado: janela ABERTA — a peça está com a noiva", () => {
    const j = janelaDeUsoDoContrato(
      { dataCasamento: null, dataRetirada: meioDia("2026-09-10"), dataDevolucao: null },
      REGRA_DEFAULT,
    );
    expect(j).toEqual({ inicio: "2026-09-10", fim: null });
    expect(janelaCobre(j!, "2027-01-01")).toBe(true);
  });

  it("contrato sem nenhuma data não entra em dia nenhum", () => {
    // `contratos.data_casamento` é nullable e a tela deixa o campo vazio: é
    // caso real. Contá-lo em todos os dias seria pior que não contá-lo.
    expect(
      janelaDeUsoDoContrato(
        { dataCasamento: null, dataRetirada: null, dataDevolucao: null },
        REGRA_DEFAULT,
      ),
    ).toBeNull();
  });

  it("S-A16: a lavagem do estoque configurada estica o FIM — e o exemplo é o da sobra", () => {
    // O caso medido que motivou a sobra: casamento em 19/09, e o saiote
    // aparecia livre em 22/09 enquanto o vestido ficava até 28/09. Com 7 dias
    // de lavagem configurados, o fim vai de 21/09 para 28/09 — as peças que
    // saíram juntas voltam juntas.
    const j = janelaDeUsoDoContrato(
      { dataCasamento: meioDia("2026-09-19"), dataRetirada: null, dataDevolucao: null },
      { ...REGRA_DEFAULT, estoqueLavagemDiasDepois: 7 },
    );
    expect(j).toEqual({ inicio: "2026-09-16", fim: "2026-09-28" });
  });

  it("S-A16: a devolução real também espera a lavagem — devolvida em D, volta em D + lavagem", () => {
    const j = janelaDeUsoDoContrato(
      {
        dataCasamento: meioDia("2026-09-19"),
        dataRetirada: null,
        dataDevolucao: meioDia("2026-09-22"),
      },
      { ...REGRA_DEFAULT, estoqueLavagemDiasDepois: 3 },
    );
    expect(j?.fim).toBe("2026-09-25");
  });

  it("S-A16: com lavagem 0 — o default e o comportamento histórico — nada muda", () => {
    const sem = janelaDeUsoDoContrato(
      { dataCasamento: meioDia("2026-09-19"), dataRetirada: null, dataDevolucao: null },
      REGRA_DEFAULT,
    );
    expect(REGRA_DEFAULT.estoqueLavagemDiasDepois).toBe(0);
    expect(sem).toEqual({ inicio: "2026-09-16", fim: "2026-09-21" });
  });

  it("a janela é inclusiva nas duas pontas", () => {
    const j = { inicio: "2026-09-16", fim: "2026-09-21" };
    expect(janelaCobre(j, "2026-09-16")).toBe(true);
    expect(janelaCobre(j, "2026-09-21")).toBe(true);
    expect(janelaCobre(j, "2026-09-15")).toBe(false);
    expect(janelaCobre(j, "2026-09-22")).toBe(false);
  });
});

describe("E154 — o que está comprometido no dia", () => {
  const SAIOTE = "saiote-2-aros";
  const CRINOL = "crinol";

  it("soma as quantidades dos contratos cuja janela cobre o dia, e ignora as demais", () => {
    const linhas = [
      // Casamento em 19/09 → [16, 21]. Cobre o dia.
      { itemEstoqueId: SAIOTE, quantidade: 2, dataCasamento: meioDia("2026-09-19"), dataRetirada: null, dataDevolucao: null },
      // Casamento em 20/09 → [17, 22]. Também cobre.
      { itemEstoqueId: SAIOTE, quantidade: 1, dataCasamento: meioDia("2026-09-20"), dataRetirada: null, dataDevolucao: null },
      // Casamento em 30/09 → [27, 02/10]. Não cobre.
      { itemEstoqueId: SAIOTE, quantidade: 5, dataCasamento: meioDia("2026-09-30"), dataRetirada: null, dataDevolucao: null },
      { itemEstoqueId: CRINOL, quantidade: 1, dataCasamento: meioDia("2026-09-19"), dataRetirada: null, dataDevolucao: null },
    ];

    const m = comprometidoNoDia(linhas, "2026-09-19", REGRA_DEFAULT);
    expect(m.get(SAIOTE)).toBe(3);
    expect(m.get(CRINOL)).toBe(1);
  });

  it("item sem compromisso no dia não aparece no mapa — quem lê soma zero", () => {
    const m = comprometidoNoDia(
      [{ itemEstoqueId: SAIOTE, quantidade: 9, dataCasamento: meioDia("2026-12-25"), dataRetirada: null, dataDevolucao: null }],
      "2026-09-19",
      REGRA_DEFAULT,
    );
    expect(m.has(SAIOTE)).toBe(false);
  });

  it("a devolução antecipada solta a peça no mesmo dia em que ela volta", () => {
    const linha = {
      itemEstoqueId: SAIOTE,
      quantidade: 3,
      dataCasamento: meioDia("2026-09-19"),
      dataRetirada: null,
      dataDevolucao: meioDia("2026-09-20"),
    };
    expect(comprometidoNoDia([linha], "2026-09-20", REGRA_DEFAULT).get(SAIOTE)).toBe(3);
    expect(comprometidoNoDia([linha], "2026-09-21", REGRA_DEFAULT).has(SAIOTE)).toBe(false);
  });

  it("a régua da LOJA manda: com uso de 7 dias antes, o dia 12 já conta", () => {
    const regraLarga = { ...REGRA_DEFAULT, usoDiasAntes: 7, usoDiasDepois: 7 };
    const linha = {
      itemEstoqueId: SAIOTE,
      quantidade: 1,
      dataCasamento: meioDia("2026-09-19"),
      dataRetirada: null,
      dataDevolucao: null,
    };
    expect(comprometidoNoDia([linha], "2026-09-12", regraLarga).get(SAIOTE)).toBe(1);
    expect(comprometidoNoDia([linha], "2026-09-12", REGRA_DEFAULT).has(SAIOTE)).toBe(false);
  });
});
