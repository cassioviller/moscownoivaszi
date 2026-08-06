import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db, lojasTable, bloqueioVestidosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarFixture,
  limparFixture,
  fecharPool,
  loginComLoja,
  criarVestido,
  criarLead,
  criarRegraDisponibilidade,
  criarReserva,
  criarBloqueio,
  dataFutura,
  type Fixture,
} from "./helpers";
import { addDias, diaLocal } from "../lib/disponibilidade";

/**
 * Lote 3 — testes de INTEGRAÇÃO (supertest) dos 8 cenários da spec §8.
 * Datas de negócio sempre literais/derivadas da âncora, com offset explícito
 * -03:00 nos payloads. Todo 409/400 verifica que nada foi gravado.
 */

const DIA_BASE = "2027-09-15"; // dia local da DATA_BASE_CASAMENTO

/** Dia local da âncora + offset ("YYYY-MM-DD"). */
const diaFuturo = (offsetDias: number) => addDias(DIA_BASE, offsetDias);

/** Payload de data com offset explícito de São Paulo. */
const dataISO = (offsetDias: number) => `${diaFuturo(offsetDias)}T12:00:00-03:00`;

let f: Fixture;
let agent: Awaited<ReturnType<typeof loginComLoja>>;
let lojaBId: string;

beforeAll(async () => {
  f = await criarFixture();
  // Regra explícita (igual aos defaults) para janelas determinísticas:
  // PROVA D-14..D-4 | USO D-3..D+2 | LAVAGEM D+3..D+9.
  await criarRegraDisponibilidade(f, {
    provaDiasAntes: 14,
    usoDiasAntes: 3,
    usoDiasDepois: 2,
    lavagemDiasDepois: 7,
  });
  agent = await loginComLoja(f.vendedoraEmail, f.lojaId);

  // Segunda loja para o cenário 8 (vestido de outra loja).
  lojaBId = randomUUID();
  await db.insert(lojasTable).values({ id: lojaBId, nome: `Loja B Teste ${lojaBId.slice(0, 8)}` });
});

afterAll(async () => {
  await db.delete(lojasTable).where(eq(lojasTable.id, lojaBId));
  await limparFixture(f);
  await fecharPool();
});

async function bloqueiosDoVestido(vestidoId: string) {
  const res = await agent.get(`/api/lojas/${f.lojaId}/bloqueios`);
  expect(res.status).toBe(200);
  return (res.body as Array<{ vestidoId: string }>).filter((b) => b.vestidoId === vestidoId);
}

describe("cenário 1 — bloqueio duplicado no mesmo vestido/data", () => {
  it("segundo bloqueio na mesma data responde 409 e nada é gravado", async () => {
    const vestido = await criarVestido(f);
    const lead = await criarLead(f);
    const payload = {
      vestidoId: vestido.id,
      leadId: lead.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataISO(0),
    };

    const r1 = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send(payload);
    expect(r1.status).toBe(201);
    expect(r1.body).toHaveProperty("id");

    const r2 = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send(payload);
    expect(r2.status).toBe(409);
    expect(r2.body.error).toBe("VESTIDO_INDISPONIVEL");
    expect(Array.isArray(r2.body.conflitos)).toBe(true);
    expect(r2.body.conflitos.length).toBeGreaterThan(0);
    expect(r2.body.conflitos[0]).toMatchObject({
      bloqueioId: r1.body.id,
      tipo: "RESERVA_CASAMENTO",
      leadId: lead.id,
      noivaNome: lead.noivaNome,
    });
    expect(["PROVA", "USO", "LAVAGEM"]).toContain(r2.body.conflitos[0].motivo);

    expect(await bloqueiosDoVestido(vestido.id)).toHaveLength(1);
  });
});

describe("cenário 2 — casamentos próximos vs distantes", () => {
  it("a 2 dias conflita (janela de uso); a 40 dias não super-bloqueia", async () => {
    const vestido = await criarVestido(f);
    const lead = await criarLead(f);
    await criarBloqueio(f, {
      vestidoId: vestido.id,
      leadId: lead.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(0),
    });

    const perto = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataISO(2),
    });
    expect(perto.status).toBe(409);
    expect(perto.body.error).toBe("VESTIDO_INDISPONIVEL");
    expect(perto.body.conflitos.some((c: { motivo: string }) => c.motivo === "USO")).toBe(true);
    expect(await bloqueiosDoVestido(vestido.id)).toHaveLength(1);

    // 40 dias: fora de USO+LAVAGEM e a PROVA (14 dias antes) não encosta.
    const longe = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataISO(40),
    });
    expect(longe.status).toBe(201);
    expect(await bloqueiosDoVestido(vestido.id)).toHaveLength(2);
  });
});

describe("cenário 3 — GET batch de disponibilidade", () => {
  it("marca ocupado com motivo/conflito, livre como disponível e inativo como INATIVO", async () => {
    const ocupado = await criarVestido(f);
    const livre = await criarVestido(f);
    const inativo = await criarVestido(f, { status: "inativo" });
    const lead = await criarLead(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: ocupado.id,
      leadId: lead.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(0),
    });

    const res = await agent.get(
      `/api/lojas/${f.lojaId}/vestidos/disponibilidade?data=${DIA_BASE}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toBe(DIA_BASE);

    type Item = {
      vestidoId: string;
      disponivel: boolean;
      status: string;
      motivo: string | null;
      conflito: Record<string, unknown> | null;
    };
    const itens = res.body.itens as Item[];
    const item = (id: string) => itens.find((i) => i.vestidoId === id);

    const itemOcupado = item(ocupado.id);
    expect(itemOcupado).toBeDefined();
    expect(itemOcupado).toMatchObject({ disponivel: false, status: "RESERVADO" });
    expect(itemOcupado!.motivo).toMatch(/Reservado/);
    expect(itemOcupado!.motivo).toMatch(/noiva/);
    expect(itemOcupado!.conflito).toMatchObject({
      bloqueioId: bloqueio.id,
      tipo: "RESERVA_CASAMENTO",
      motivo: "USO",
      inicio: diaFuturo(-3),
      fim: diaFuturo(2),
      noivaNome: lead.noivaNome,
    });

    expect(item(livre.id)).toMatchObject({
      disponivel: true,
      status: "DISPONIVEL",
      motivo: null,
      conflito: null,
    });

    expect(item(inativo.id)).toMatchObject({ disponivel: false, status: "INATIVO" });
  });
});

describe("cenário 4 — cancelar reserva libera o vestido", () => {
  it("PATCH status=CANCELADA permite novo bloqueio na mesma data e mantém a reserva no GET", async () => {
    const vestido = await criarVestido(f);
    const lead = await criarLead(f);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: dataFutura(100) });

    const r1 = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataISO(100),
    });
    expect(r1.status).toBe(201);

    const cancel = await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ status: "CANCELADA" });
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe("CANCELADA");

    // Vestido liberado: mesmo vestido, mesma data → 201.
    const outraLead = await criarLead(f);
    const r2 = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: vestido.id,
      leadId: outraLead.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataISO(100),
    });
    expect(r2.status).toBe(201);

    // A reserva não some — continua listada, com status CANCELADA.
    const lista = await agent.get(`/api/lojas/${f.lojaId}/reservas`);
    expect(lista.status).toBe(200);
    const encontrada = (lista.body as Array<{ id: string; status: string }>).find(
      (r) => r.id === reserva.id,
    );
    expect(encontrada).toBeDefined();
    expect(encontrada!.status).toBe("CANCELADA");
  });
});

describe("cenário 5 — PATCH reserva mudando casamentoData", () => {
  it("para data ocupada → 409 e nada muda; para data livre → 200 e bloqueio acompanha", async () => {
    const vestido = await criarVestido(f);
    const lead = await criarLead(f);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: dataFutura(200) });

    const criado = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataISO(200),
    });
    expect(criado.status).toBe(201);
    const bloqueioId = criado.body.id as string;

    // Outro bloqueio ocupa a data-alvo (+300) no mesmo vestido.
    const ocupante = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(300),
    });

    // → data ocupada: 409 + rollback (reserva e bloqueio intactos).
    const conflitoRes = await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ casamentoData: dataISO(300) });
    expect(conflitoRes.status).toBe(409);
    expect(conflitoRes.body.error).toBe("VESTIDO_INDISPONIVEL");
    expect(
      conflitoRes.body.conflitos.some(
        (c: { bloqueioId: string }) => c.bloqueioId === ocupante.id,
      ),
    ).toBe(true);

    const listaReservas = await agent.get(`/api/lojas/${f.lojaId}/reservas`);
    const reservaAtual = (listaReservas.body as Array<{ id: string; casamentoData: string }>).find(
      (r) => r.id === reserva.id,
    );
    expect(diaLocal(new Date(reservaAtual!.casamentoData))).toBe(diaFuturo(200));

    const [bloqueioIntacto] = await db
      .select()
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueioId));
    expect(diaLocal(bloqueioIntacto.casamentoData!)).toBe(diaFuturo(200));
    expect(bloqueioIntacto.ocupacaoInicio).toBe(diaFuturo(197)); // D-3
    expect(bloqueioIntacto.ocupacaoFim).toBe(diaFuturo(209)); // D+2+7

    // → data livre (+250): 200 e o bloqueio vinculado reflete a nova data.
    const okRes = await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ casamentoData: dataISO(250) });
    expect(okRes.status).toBe(200);
    expect(diaLocal(new Date(okRes.body.casamentoData))).toBe(diaFuturo(250));

    const [bloqueioMovido] = await db
      .select()
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueioId));
    expect(diaLocal(bloqueioMovido.casamentoData!)).toBe(diaFuturo(250));
    expect(bloqueioMovido.ocupacaoInicio).toBe(diaFuturo(247));
    expect(bloqueioMovido.ocupacaoFim).toBe(diaFuturo(259));
  });
});

describe("cenário 6 — constraint EXCLUDE como cinto de segurança", () => {
  it("insert direto sobreposto (bypass da rota) estoura 23P01; via rota o handler responde 409", async () => {
    const vestido = await criarVestido(f);
    await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "MANUTENCAO",
      inicio: dataFutura(500),
      fim: dataFutura(510),
    });

    // Bypass da rota: ocupação preenchida na mão, sobreposta à existente.
    let erro: unknown = null;
    try {
      await db.insert(bloqueioVestidosTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        vestidoId: vestido.id,
        tipo: "MANUTENCAO",
        inicio: dataFutura(505),
        fim: dataFutura(515),
        ocupacaoInicio: diaFuturo(505),
        ocupacaoFim: diaFuturo(515),
      });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(Error);
    const codigo =
      (erro as { cause?: { code?: string } }).cause?.code ?? (erro as { code?: string }).code;
    expect(codigo).toBe("23P01");

    const [linha] = await db
      .select()
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.vestidoId, vestido.id));
    expect(await bloqueiosDoVestido(vestido.id)).toHaveLength(1);
    expect(linha).toBeDefined();

    // Via rota, o mesmo cenário responde 409 (sem vazar 500).
    const viaRota = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: vestido.id,
      tipo: "MANUTENCAO",
      inicio: dataISO(505),
      fim: dataISO(515),
    });
    expect(viaRota.status).toBe(409);
    expect(viaRota.body).toHaveProperty("error");
    expect(await bloqueiosDoVestido(vestido.id)).toHaveLength(1);
  });
});

describe("cenário 7 — validações 400 na criação de bloqueio", () => {
  it("MANUTENCAO sem inicio → 400; RESERVA_CASAMENTO sem casamentoData → 400; nada gravado", async () => {
    const vestido = await criarVestido(f);

    const semInicio = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: vestido.id,
      tipo: "MANUTENCAO",
    });
    expect(semInicio.status).toBe(400);
    // S-D21: o assert casava a PROSA dentro do campo do código. Agora casa o
    // código, e a prosa tem lugar próprio.
    expect(semInicio.body.error).toBe("MANUTENCAO_SEM_INICIO");
    expect(semInicio.body.detalhe).toMatch(/início/);

    const semData = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
    });
    expect(semData.status).toBe(400);
    expect(semData.body.error).toBe("RESERVA_SEM_DATA_DE_CASAMENTO");
    expect(semData.body.detalhe).toMatch(/data do casamento/);

    expect(await bloqueiosDoVestido(vestido.id)).toHaveLength(0);
  });
});

describe("cenário 8 — vestido de outra loja", () => {
  it("POST bloqueio com vestido de outra loja → 404 e nada gravado", async () => {
    const vestidoLojaB = await criarVestido(f, { lojaId: lojaBId });

    const res = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: vestidoLojaB.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataISO(0),
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Vestido/i);

    const gravados = await db
      .select()
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.vestidoId, vestidoLojaB.id));
    expect(gravados).toHaveLength(0);
  });
});
