import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import { diaLocalYMD } from "@workspace/agenda-core";

/**
 * E151 — a ausência da vendedora existe, e a agenda a respeita.
 *
 * `grep -rniE "ferias|ausencia|indisponibilidade|folga"` não devolvia nenhuma
 * ocorrência de domínio: a agenda sabia de cabine e de vendedora, e nada tornava
 * uma pessoa indisponível num intervalo. No papel é a PRIMEIRA coisa que a
 * página do caderno declara — 7 das 14 páginas anunciam quem está fora.
 *
 * O que este arquivo prega: a recusa acontece na mesma camada que já recusa dia
 * fora do expediente, a frase diz QUEM e QUANDO, e a ausência **só impede o
 * novo** — o que já estava agendado não é tocado.
 */
describe("E151 — a agenda respeita a ausência da equipe", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let cabineId: string;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const cabine = await agent
      .post(`/api/lojas/${f.lojaId}/cabines`)
      .send({ nome: `Cabine E151 ${Date.now()}` })
      .expect(201);
    cabineId = cabine.body.id;
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  // Cada atendimento numa hora distinta: UNIQUE (loja, vendedora, inicio).
  let sequencia = 0;
  const horaLivre = () => 10 + (sequencia++ % 8);

  /** Um dia útil daqui a `dias` dias, como "AAAA-MM-DD" no fuso da loja. */
  const diaDaqui = (dias: number) => diaLocalYMD(new Date(Date.now() + dias * 86_400_000));

  async function agendar(dia: string, hora: number) {
    const lead = await criarLead(f);
    return agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
      leadId: lead.id,
      cabineId,
      vendedoraId: f.vendedoraId,
      tipo: "ATENDIMENTO",
      inicio: `${dia}T${String(hora).padStart(2, "0")}:00:00-03:00`,
    });
  }

  // Sem `async`: devolve a cadeia do supertest, para o `.expect(201)` ficar
  // legível na linha de quem lê o teste.
  const ausentar = (inicio: string, fim: string, motivo?: string) =>
    agent
      .post(`/api/lojas/${f.lojaId}/ausencias`)
      .send({ usuarioId: f.vendedoraId, inicio, fim, motivo });

  it("cadastra a ausência com o nome de quem falta", async () => {
    const r = await ausentar(diaDaqui(400), diaDaqui(414), "Férias").expect(201);
    expect(r.body.usuarioNome).toBeTruthy();
    expect(r.body.motivo).toBe("Férias");

    const lista = await agent.get(`/api/lojas/${f.lojaId}/ausencias`).expect(200);
    expect(lista.body.some((a: { id: string }) => a.id === r.body.id)).toBe(true);
  });

  it("agendar no meio da ausência é recusado, e a frase diz quem e quando", async () => {
    const inicio = diaDaqui(30);
    const fim = diaDaqui(40);
    await ausentar(inicio, fim, "Férias").expect(201);

    const r = await agendar(diaDaqui(35), horaLivre());
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("VENDEDORA_AUSENTE");
    // A frase serve a quem está com a noiva na frente: nome, período e motivo.
    expect(r.body.detalhe).toMatch(/Vendedora Teste/);
    expect(r.body.detalhe).toMatch(/Férias/);
    expect(r.body.detalhe).toMatch(/\d{2}\/\d{2} a \d{2}\/\d{2}/);
  });

  it("as duas pontas contam, e no dia seguinte a agenda volta", async () => {
    const inicio = diaDaqui(60);
    const fim = diaDaqui(62);
    await ausentar(inicio, fim).expect(201);

    expect((await agendar(inicio, horaLivre())).status).toBe(422);
    expect((await agendar(fim, horaLivre())).status).toBe(422);
    expect((await agendar(diaDaqui(63), horaLivre())).status).toBe(201);
    expect((await agendar(diaDaqui(59), horaLivre())).status).toBe(201);
  });

  it("a ausência NÃO cancela o que já estava agendado — ela só impede o novo", async () => {
    const dia = diaDaqui(90);
    const marcado = await agendar(dia, horaLivre());
    expect(marcado.status).toBe(201);

    await ausentar(dia, dia, "Consulta médica").expect(201);

    // O atendimento continua lá, inteiro. Remarcação em lote é decisão de
    // produto e ninguém pediu — cancelar sozinho deixaria a noiva sem horário.
    const lista = await agent.get(`/api/lojas/${f.lojaId}/atendimentos`).expect(200);
    const ainda = lista.body.find((a: { id: string }) => a.id === marcado.body.id);
    expect(ainda?.situacao).toBe("AGENDADO");
  });

  it("apagar a ausência devolve o dia à agenda", async () => {
    const dia = diaDaqui(120);
    const criada = await ausentar(dia, dia).expect(201);
    expect((await agendar(dia, horaLivre())).status).toBe(422);

    await agent.delete(`/api/lojas/${f.lojaId}/ausencias/${criada.body.id}`).expect(204);
    expect((await agendar(dia, horaLivre())).status).toBe(201);
  });

  it("período invertido é erro de digitação, e é dito", async () => {
    const r = await ausentar(diaDaqui(200), diaDaqui(190)).expect(422);
    expect(r.body.error).toBe("PERIODO_INVERTIDO");
  });

  it("dia mal formado não vira ausência", async () => {
    await ausentar("10/07/2026", "20/07/2026").expect(400);
  });

  it("pessoa de outra loja não entra na equipe desta — a FK só prova que existe", async () => {
    const outra = await criarFixture();
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/ausencias`)
      .send({ usuarioId: outra.vendedoraId, inicio: diaDaqui(300), fim: diaDaqui(310) })
      .expect(404);
    expect(r.body.error).toBe("REFERENCIA_INVALIDA");
    await limparFixture(outra);
  });

  it("`?desde=` corta o passado — férias de anos atrás não interessam a quem marca amanhã", async () => {
    await ausentar("2020-01-10", "2020-01-20", "Férias antigas").expect(201);

    const todas = await agent.get(`/api/lojas/${f.lojaId}/ausencias`).expect(200);
    expect(todas.body.some((a: { motivo: string }) => a.motivo === "Férias antigas")).toBe(true);

    const daqui = await agent
      .get(`/api/lojas/${f.lojaId}/ausencias`)
      .query({ desde: diaLocalYMD(new Date()) })
      .expect(200);
    expect(daqui.body.some((a: { motivo: string }) => a.motivo === "Férias antigas")).toBe(false);
  });
});
