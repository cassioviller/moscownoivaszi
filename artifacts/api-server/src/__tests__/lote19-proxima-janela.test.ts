import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  REGRA_DEFAULT,
  janelasDoBloqueio,
  proximaDataLivre,
  type BloqueioJanelasInput,
} from "../lib/disponibilidade";
import {
  criarFixture,
  limparFixture,
  fecharPool,
  loginComLoja,
  criarVestido,
  type Fixture,
} from "./helpers";

/**
 * Lote 19 — E9: próxima janela livre do vestido.
 * Unidade: proximaDataLivre espelha a régua da escrita (inclusive a janela de
 * prova do candidato — dia que passa aqui é dia que o POST aceita).
 * API: wiring da rota /vestidos/:id/proxima-janela.
 */

// Reserva âncora: casamento 20/08/2026. Com REGRA_DEFAULT (14/3/2/7):
//   PROVA   [2026-08-06, 2026-08-16]
//   USO     [2026-08-17, 2026-08-22]
//   LAVAGEM [2026-08-23, 2026-08-29]
const CASAMENTO = new Date("2026-08-20T12:00:00-03:00");

function reserva(over: Partial<BloqueioJanelasInput> = {}): BloqueioJanelasInput {
  return {
    id: "blq-existente",
    tipo: "RESERVA_CASAMENTO",
    casamentoData: CASAMENTO,
    provaDataReal: null,
    retiradaDataReal: null,
    devolucaoDataReal: null,
    lavagemConcluidaEm: null,
    inicio: null,
    fim: null,
    ...over,
  };
}

const janelasDe = (b: BloqueioJanelasInput, hoje: string) =>
  janelasDoBloqueio(b, REGRA_DEFAULT, hoje);

describe("proximaDataLivre (unidade, sem banco)", () => {
  it("sem bloqueios, hoje já é livre", () => {
    expect(
      proximaDataLivre({ janelasExistentes: [], regra: REGRA_DEFAULT, aPartirDe: "2026-07-20" }),
    ).toBe("2026-07-20");
  });

  it("antes da reserva ainda cabe: lavagem do candidato encosta mas não sobrepõe a prova alheia", () => {
    // D=20/07: LAVAGEM candidata [23/07, 29/07] termina antes da PROVA
    // existente começar (06/08) — livre já no primeiro dia varrido.
    const livre = proximaDataLivre({
      janelasExistentes: janelasDe(reserva(), "2026-07-01"),
      regra: REGRA_DEFAULT,
      aPartirDe: "2026-07-20",
    });
    expect(livre).toBe("2026-07-20");
  });

  it("dentro do bloco, pula para depois da lavagem + prova do candidato", () => {
    // A partir de 01/08 (dentro da PROVA existente): o primeiro D em que NADA
    // do candidato (inclusive a PROVA [D-14, D-4]) toca USO/LAVAGEM existentes
    // [17/08, 29/08] é D-14 > 29/08 → 13/09.
    const livre = proximaDataLivre({
      janelasExistentes: janelasDe(reserva(), "2026-08-01"),
      regra: REGRA_DEFAULT,
      aPartirDe: "2026-08-01",
    });
    expect(livre).toBe("2026-09-13");
  });

  it("retirada sem devolução (janela aberta) bloqueia tudo à frente → null", () => {
    const aberta = reserva({ retiradaDataReal: new Date("2026-08-17T12:00:00-03:00") });
    const livre = proximaDataLivre({
      janelasExistentes: janelasDe(aberta, "2026-09-01"),
      regra: REGRA_DEFAULT,
      aPartirDe: "2026-09-01",
    });
    expect(livre).toBeNull();
  });

  it("manutenção com fim: libera quando a prova do candidato cabe depois dela", () => {
    // MANUTENCAO [10/08, 20/08] FISICA. Candidato livre exige PROVA
    // [D-14, D-4] após 20/08 → D >= 04/09.
    const manutencao = reserva({
      id: "blq-manutencao",
      tipo: "MANUTENCAO",
      casamentoData: null,
      inicio: new Date("2026-08-10T12:00:00-03:00"),
      fim: new Date("2026-08-20T12:00:00-03:00"),
    });
    const livre = proximaDataLivre({
      janelasExistentes: janelasDe(manutencao, "2026-08-01"),
      regra: REGRA_DEFAULT,
      aPartirDe: "2026-08-12",
    });
    expect(livre).toBe("2026-09-04");
  });

  it("horizonte estoura → null (nunca varre para sempre)", () => {
    const manutencaoAberta = reserva({
      id: "blq-aberta",
      tipo: "MANUTENCAO",
      casamentoData: null,
      inicio: new Date("2026-01-01T12:00:00-03:00"),
      fim: null,
    });
    const livre = proximaDataLivre({
      janelasExistentes: janelasDe(manutencaoAberta, "2026-06-01"),
      regra: REGRA_DEFAULT,
      aPartirDe: "2026-06-01",
      horizonteDias: 30,
    });
    expect(livre).toBeNull();
  });
});

describe("GET /vestidos/:id/proxima-janela (API)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
  });

  it("vestido sem bloqueios: livre a partir de hoje", async () => {
    const vestido = await criarVestido(f);
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/vestidos/${vestido.id}/proxima-janela`)
      .expect(200);
    expect(res.body.proximaData).toBe(res.body.aPartirDe);
    expect(res.body.horizonteDias).toBe(365);
  });

  it("vestido inativo: proximaData null", async () => {
    const vestido = await criarVestido(f, { status: "inativo" });
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/vestidos/${vestido.id}/proxima-janela`)
      .expect(200);
    expect(res.body.proximaData).toBeNull();
  });

  it("vestido inexistente → 404", async () => {
    await agent
      .get(`/api/lojas/${f.lojaId}/vestidos/nao-existe/proxima-janela`)
      .expect(404);
  });
});

afterAll(async () => {
  await fecharPool();
});
