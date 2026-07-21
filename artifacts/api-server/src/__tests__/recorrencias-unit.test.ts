import { describe, expect, it } from "vitest";
import {
  montarContasDaCompetencia,
  vencimentoDaCompetencia,
  type ContaGeradaExistente,
  type RecorrenciaParaGerar,
} from "../lib/recorrencias";

/**
 * E48 — o motor de recorrência generalizado. O que precisa de prova rápida é a
 * idempotência (gerar duas vezes não pode dobrar a conta de ninguém) e o fato
 * de que ela tem DUAS réguas: salário deduplica largo (por colaborador
 * também), despesa deduplica só pela própria recorrência.
 *
 * Herdou os casos de `lote16-folha-unit`, que provava o mesmo motor quando ele
 * só sabia pagar gente.
 */

const salario = (over: Partial<RecorrenciaParaGerar> = {}): RecorrenciaParaGerar => ({
  id: "sal-1",
  tipo: "SALARIO",
  usuarioId: "u-1",
  descricao: null,
  categoria: null,
  fornecedor: null,
  valor: 3000,
  diaVencimento: 5,
  ativo: true,
  ...over,
});

const despesa = (over: Partial<RecorrenciaParaGerar> = {}): RecorrenciaParaGerar => ({
  id: "des-1",
  tipo: "DESPESA",
  usuarioId: null,
  descricao: "Aluguel",
  categoria: "Ocupação",
  fornecedor: null,
  valor: 4500,
  diaVencimento: 10,
  ativo: true,
  ...over,
});

describe("montarContasDaCompetencia", () => {
  it("gera uma conta SALARIO por recorrência ativa, com rastro e vencimento", () => {
    const contas = montarContasDaCompetencia("2026-07", [salario()], []);
    expect(contas).toHaveLength(1);
    expect(contas[0]).toMatchObject({
      tipo: "SALARIO",
      colaboradorId: "u-1",
      competencia: "2026-07",
      descricao: "Salário 2026-07",
      valorPrevisto: 3000,
      recorrenciaId: "sal-1",
    });
    // Data de NEGÓCIO: meio-dia SP → o dia UTC já é o dia combinado.
    expect(contas[0].vencimento.toISOString()).toBe("2026-07-05T15:00:00.000Z");
  });

  it("gera a despesa recorrente pelo mesmo caminho, sem colaborador", () => {
    const contas = montarContasDaCompetencia("2026-07", [despesa()], []);
    expect(contas).toHaveLength(1);
    expect(contas[0]).toMatchObject({
      tipo: "DESPESA",
      colaboradorId: null,
      descricao: "Aluguel 2026-07",
      categoria: "Ocupação",
      valorPrevisto: 4500,
      recorrenciaId: "des-1",
    });
    expect(contas[0].vencimento.toISOString()).toBe("2026-07-10T15:00:00.000Z");
  });

  it("é idempotente: com a conta da competência já feita, gera zero", () => {
    const jaFeitas: ContaGeradaExistente[] = [{ colaboradorId: "u-1", recorrenciaId: "sal-1" }];
    expect(montarContasDaCompetencia("2026-07", [salario()], jaFeitas)).toHaveLength(0);

    const dasDespesas: ContaGeradaExistente[] = [{ colaboradorId: null, recorrenciaId: "des-1" }];
    expect(montarContasDaCompetencia("2026-07", [despesa()], dasDespesas)).toHaveLength(0);
  });

  it("rodar duas vezes seguidas não dobra nada", () => {
    const recorrencias = [salario(), despesa()];
    const primeira = montarContasDaCompetencia("2026-07", recorrencias, []);
    expect(primeira).toHaveLength(2);
    const segunda = montarContasDaCompetencia("2026-07", recorrencias, primeira);
    expect(segunda).toHaveLength(0);
  });

  it("salário lançado à mão (sem rastro) bloqueia a geração daquela pessoa", () => {
    // O critério largo erra para o lado seguro: no pior caso falta uma conta
    // e alguém a lança à mão; o estreito pagaria a pessoa duas vezes.
    const jaFeitas: ContaGeradaExistente[] = [{ colaboradorId: "u-1", recorrenciaId: null }];
    expect(montarContasDaCompetencia("2026-07", [salario()], jaFeitas)).toHaveLength(0);
  });

  it("salário de recorrência trocada não gera de novo para a mesma pessoa", () => {
    const jaFeitas: ContaGeradaExistente[] = [{ colaboradorId: "u-1", recorrenciaId: "sal-antigo" }];
    expect(montarContasDaCompetencia("2026-07", [salario({ id: "sal-novo" })], jaFeitas)).toHaveLength(0);
  });

  it("a despesa NÃO deduplica por descrição — duas salas, dois aluguéis", () => {
    // O dedup largo do salário não vale aqui: o motor não tem como saber que
    // um segundo "Aluguel" é o mesmo, e bloquear seria decidir pela loja.
    const contas = montarContasDaCompetencia(
      "2026-07",
      [despesa(), despesa({ id: "des-2" })],
      [{ colaboradorId: null, recorrenciaId: "des-1" }],
    );
    expect(contas.map((c) => c.recorrenciaId)).toEqual(["des-2"]);
  });

  it("a conta de outra competência não bloqueia a desta", () => {
    expect(montarContasDaCompetencia("2026-08", [salario()], [])).toHaveLength(1);
  });

  it("recorrência inativa não entra", () => {
    expect(montarContasDaCompetencia("2026-07", [salario({ ativo: false })], [])).toHaveLength(0);
    expect(montarContasDaCompetencia("2026-07", [despesa({ ativo: false })], [])).toHaveLength(0);
  });

  it("gera só quem falta quando a competência foi parcialmente feita", () => {
    const recorrencias = [salario(), salario({ id: "sal-2", usuarioId: "u-2" })];
    const contas = montarContasDaCompetencia("2026-07", recorrencias, [
      { colaboradorId: "u-1", recorrenciaId: "sal-1" },
    ]);
    expect(contas.map((c) => c.colaboradorId)).toEqual(["u-2"]);
  });

  it("recorrência que não sabe se descrever não vira conta", () => {
    // Melhor faltar uma linha do que "undefined 2026-07" na lista de contas a
    // pagar. A rota já recusa criar assim; isto é a rede para o dado que
    // entrou por outra porta.
    expect(montarContasDaCompetencia("2026-07", [despesa({ descricao: null })], [])).toHaveLength(0);
    expect(montarContasDaCompetencia("2026-07", [salario({ usuarioId: null })], [])).toHaveLength(0);
    expect(montarContasDaCompetencia("2026-07", [despesa({ tipo: "COMISSAO" })], [])).toHaveLength(0);
  });
});

describe("vencimentoDaCompetencia", () => {
  it("grampeia o dia ao último do mês (dia 31 em fevereiro)", () => {
    // Sem o grampo, "2026-02-31" viraria 03/03 e a conta de fevereiro
    // venceria em março, calada.
    expect(vencimentoDaCompetencia("2026-02", 31).toISOString()).toBe("2026-02-28T15:00:00.000Z");
  });

  it("respeita fevereiro bissexto", () => {
    expect(vencimentoDaCompetencia("2024-02", 30).toISOString()).toBe("2024-02-29T15:00:00.000Z");
  });

  it("dia dentro do mês passa intacto", () => {
    expect(vencimentoDaCompetencia("2026-11", 10).toISOString()).toBe("2026-11-10T15:00:00.000Z");
  });
});
