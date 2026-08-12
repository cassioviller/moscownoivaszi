import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, regraDisponibilidadeTable } from "@workspace/db";
import { getTableConfig } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { EXPEDIENTE_PADRAO } from "@workspace/agenda-core";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * E180 / S-O23 — **o espelho do expediente ligado à validação que o USA.**
 *
 * O `PUT /disponibilidade/regras` é um upsert PARCIAL, e por isso a G12 (E168)
 * confere o par EFETIVO e não o corpo: mandar só `atendimentoFechamentoHora: 5`
 * sobre uma loja que abre às 9 produz o mesmo estado que mandar o par inteiro
 * invertido — a agenda fecha o dia inteiro em silêncio. Na loja que ainda NÃO
 * tem linha em `regra_disponibilidade`, o outro lado do par sai de
 * `expedienteDaRegra(null)`, que é o `EXPEDIENTE_PADRAO` do agenda-core.
 *
 * Havia três descrições do mesmo expediente e uma corrente incompleta:
 *
 * 1. o **default de coluna** do schema drizzle;
 * 2. o `HORARIO_PADRAO` do seed;
 * 3. o `EXPEDIENTE_PADRAO` do agenda-core.
 *
 * O E147 pregou 1×2 e o S-M13 pregou 1×3 — mas **nada dizia que a fronteira
 * deste PUT é aquele número**. Trocar o fallback da rota por um literal, ou
 * mover o default de coluna sem mover o espelho, muda a hora que o servidor
 * recusa e nenhuma das duas réguas anteriores fala.
 *
 * O que este arquivo prega é a corrente inteira, e os números vêm do SCHEMA —
 * nenhum literal de hora aparece aqui de propósito: **a fronteira medida é o
 * default de coluna, não o 9 que ele vale hoje.** É o molde da regra 30 (prova
 * de equivalência por enumeração), na menor enumeração que faz sentido: os dois
 * degraus em volta da fronteira, nos dois eixos.
 */
describe("E180 — a fronteira do PUT é o default do schema", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  const doSchema = getTableConfig(regraDisponibilidadeTable);
  const defaultDe = (coluna: string) => doSchema.columns.find((c) => c.name === coluna)?.default as number;
  const ABERTURA_PADRAO = defaultDe("atendimento_abertura_hora");
  const FECHAMENTO_PADRAO = defaultDe("atendimento_fechamento_hora");

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  /** Cada caso mede a loja SEM linha, que é o único estado em que o espelho vale. */
  afterEach(async () => {
    await db.delete(regraDisponibilidadeTable).where(eq(regraDisponibilidadeTable.lojaId, f.lojaId));
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("a corrente está inteira: schema → EXPEDIENTE_PADRAO → o par efetivo do PUT", () => {
    expect(EXPEDIENTE_PADRAO.aberturaHora).toBe(ABERTURA_PADRAO);
    expect(EXPEDIENTE_PADRAO.fechamentoHora).toBe(FECHAMENTO_PADRAO);
  });

  it("o fechamento parcial é recusado exatamente NA abertura padrão, e aceito um degrau acima", async () => {
    const naFronteira = await agent
      .put(`/api/lojas/${f.lojaId}/disponibilidade/regras`)
      .send({ atendimentoFechamentoHora: ABERTURA_PADRAO });
    expect(naFronteira.status).toBe(422);
    expect(naFronteira.body.error).toBe("HORARIO_INVALIDO");
    // A frase nomeia as DUAS horas, e a que ela não recebeu veio do espelho.
    expect(naFronteira.body.detalhe).toContain(`${ABERTURA_PADRAO}h`);

    const umDegrauAcima = await agent
      .put(`/api/lojas/${f.lojaId}/disponibilidade/regras`)
      .send({ atendimentoFechamentoHora: ABERTURA_PADRAO + 1 });
    expect(umDegrauAcima.status).toBe(200);
    // E o que ficou gravado é o par completo: a abertura veio do default.
    expect(umDegrauAcima.body.atendimentoAberturaHora).toBe(ABERTURA_PADRAO);
  });

  it("e a abertura parcial é recusada exatamente NO fechamento padrão, e aceita um degrau abaixo", async () => {
    const naFronteira = await agent
      .put(`/api/lojas/${f.lojaId}/disponibilidade/regras`)
      .send({ atendimentoAberturaHora: FECHAMENTO_PADRAO });
    expect(naFronteira.status).toBe(422);
    expect(naFronteira.body.error).toBe("HORARIO_INVALIDO");
    expect(naFronteira.body.detalhe).toContain(`${FECHAMENTO_PADRAO}h`);

    const umDegrauAbaixo = await agent
      .put(`/api/lojas/${f.lojaId}/disponibilidade/regras`)
      .send({ atendimentoAberturaHora: FECHAMENTO_PADRAO - 1 });
    expect(umDegrauAbaixo.status).toBe(200);
    expect(umDegrauAbaixo.body.atendimentoFechamentoHora).toBe(FECHAMENTO_PADRAO);
  });

  /**
   * O piso da régua: sem isto, um espelho que virasse `{aberturaHora: 0,
   * fechamentoHora: 24}` deixaria as duas fronteiras acima "corretas" e o PUT
   * aceitaria qualquer par numa loja nova.
   */
  it("e a fronteira não é degenerada — há hora fora dela nos dois lados", () => {
    expect(ABERTURA_PADRAO).toBeGreaterThan(0);
    expect(FECHAMENTO_PADRAO).toBeLessThan(24);
    expect(FECHAMENTO_PADRAO - ABERTURA_PADRAO).toBeGreaterThan(1);
  });
});
