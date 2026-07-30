import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import {
  db,
  contratosTable,
  contratoItensTable,
  bloqueioVestidosTable,
  atendimentosTable,
  ajustesTable,
  ajusteChecklistItensTable,
  vestidoFotosTable,
  cabinesTable,
  portalTokensTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * E100 parte 4 — o contrato (F21) e o vestido (F39) chegam à noiva.
 *
 * O contrato assinado era o único artefato do sistema sem caminho até ela: o
 * PDF só descia no computador da loja, e o portal mostrava a PROPOSTA, nunca o
 * contrato. E o portal cobria a fase comercial e parava — "que dia eu pego o
 * vestido?" e "os ajustes ficaram prontos?" voltavam como WhatsApp.
 */
describe("E100 — o contrato e o vestido no portal", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  const publico = () => request(app);
  const abrir = (token: string) => publico().get(`/api/portal?token=${token}`);

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  async function portalDe(leadId: string) {
    const r = await agent.post(`/api/lojas/${f.lojaId}/leads/${leadId}/portal`).expect(201);
    return r.body.token as string;
  }

  /**
   * Uma noiva com contrato ATIVO, snapshot de itens e — opcionalmente — vestido
   * reservado. `descontoTipo`/`descontoValor` entram direto porque `criarContrato`
   * não os expõe, e o desconto é justamente o caso em que itens ≠ total.
   */
  async function noivaComContrato(opts: {
    itens: { descricao: string; valorUnitario: number; quantidade?: number }[];
    valorTotal: number;
    desconto?: { tipo: "PERCENTUAL" | "VALOR"; valor: number };
  }) {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: opts.valorTotal,
      fechadoEm: dataFutura(-10),
    });
    await db.insert(contratoItensTable).values(
      opts.itens.map((it) => ({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        tipo: "VESTIDO" as const,
        descricao: it.descricao,
        valorUnitario: it.valorUnitario,
        quantidade: it.quantidade ?? 1,
      })),
    );
    if (opts.desconto) {
      await db
        .update(contratosTable)
        .set({ descontoTipo: opts.desconto.tipo, descontoValor: opts.desconto.valor })
        .where(eq(contratosTable.id, contrato.id));
    }
    return { lead, contrato, token: await portalDe(lead.id) };
  }

  /**
   * Pendura ajustes na noiva — eles moram no ATENDIMENTO, não no contrato.
   *
   * Cada chamada ganha um DIA próprio, e isso não é capricho: o banco tem
   * `unique(loja_id, vendedora_id, inicio)`, a guarda que impede a mesma
   * vendedora em dois lugares à mesma hora. Dois testes usando `dataFutura(-3)`
   * caem com 23505 antes do primeiro assert — foi o que aconteceu aqui, e é o
   * MESMO tropeço que a parte 2 registrou com sete provas na mesma cabine.
   */
  let diaDoAtendimento = -3;
  async function comAjustes(
    leadId: string,
    ajustes: { descricao: string; status: "PENDENTE" | "FEITO"; checklist?: string }[],
  ) {
    const cabineId = randomUUID();
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: f.lojaId, nome: cabineId });
    const atendimentoId = randomUUID();
    await db.insert(atendimentosTable).values({
      id: atendimentoId,
      lojaId: f.lojaId,
      leadId,
      cabineId,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      inicio: dataFutura(diaDoAtendimento--),
    });
    for (const a of ajustes) {
      const ajusteId = randomUUID();
      await db.insert(ajustesTable).values({
        id: ajusteId,
        lojaId: f.lojaId,
        atendimentoId,
        descricao: a.descricao,
        status: a.status,
      });
      if (a.checklist) {
        await db.insert(ajusteChecklistItensTable).values({
          id: randomUUID(),
          ajusteId,
          descricao: a.checklist,
          feito: false,
          ordem: 0,
        });
      }
    }
  }

  /** Prende um vestido reservado ao contrato, como o fechamento faz. */
  async function comVestidoReservado(
    contratoId: string,
    leadId: string,
    extras: { retiradaDataReal?: Date; canceladoEm?: Date } = {},
  ) {
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      leadId,
      casamentoData: dataFutura(60),
      retiradaDataReal: extras.retiradaDataReal ?? null,
      canceladoEm: extras.canceladoEm ?? null,
    });
    await db
      .update(contratosTable)
      .set({ bloqueioVestidoId: bloqueio.id, dataRetirada: dataFutura(55) })
      .where(eq(contratosTable.id, contratoId));
    return { vestido, bloqueio };
  }

  // ── F21: o contrato ──

  it("o contrato ATIVO chega com o SNAPSHOT de itens, não com o orçamento vivo", async () => {
    const { token } = await noivaComContrato({
      itens: [
        { descricao: "Vestido Aurora", valorUnitario: 6000 },
        { descricao: "Véu longo", valorUnitario: 500, quantidade: 2 },
      ],
      valorTotal: 7000,
    });

    const r = await abrir(token).expect(200);

    expect(r.body.contrato.itens).toHaveLength(2);
    expect(r.body.contrato.itens[0].descricao).toBe("Vestido Aurora");
    expect(r.body.contrato.itens[1].quantidade).toBe(2);
    expect(r.body.contrato.valorTotal).toBe(7000);
  });

  /**
   * O caso que faz a seção valer ou desmoralizar: com desconto, `valorTotal` é o
   * LÍQUIDO, e a soma dos itens é outra coisa. Sem o bruto ao lado, a noiva vê
   * 6.000 + 1.000 = 7.000 e um total de 6.300 — um contrato que não fecha na
   * tela dela é pior do que não mostrar item nenhum.
   */
  it("com desconto, o bruto é a soma dos itens e o total é o líquido — a conta fecha", async () => {
    const { token } = await noivaComContrato({
      itens: [
        { descricao: "Vestido Íris", valorUnitario: 6000 },
        { descricao: "Tiara", valorUnitario: 1000 },
      ],
      valorTotal: 6300,
      desconto: { tipo: "PERCENTUAL", valor: 10 },
    });

    const r = await abrir(token).expect(200);

    expect(r.body.contrato.totalBruto).toBe(7000);
    expect(r.body.contrato.valorTotal).toBe(6300);
    expect(r.body.contrato.descontoTipo).toBe("PERCENTUAL");
    expect(r.body.contrato.descontoValor).toBe(10);
    // E o abatimento reconcilia: 7000 − 6300 = 700, que é 10% de 7000.
    expect(r.body.contrato.totalBruto - r.body.contrato.valorTotal).toBe(700);
  });

  it("sem contrato ativo, a seção não existe — nem depois de cancelar", async () => {
    const lead = await criarLead(f);
    const token = await portalDe(lead.id);
    expect((await abrir(token).expect(200)).body.contrato).toBeNull();

    const { token: t2, contrato } = await noivaComContrato({
      itens: [{ descricao: "Vestido Lua", valorUnitario: 4000 }],
      valorTotal: 4000,
    });
    await db
      .update(contratosTable)
      .set({ status: "CANCELADO", canceladoEm: new Date() })
      .where(eq(contratosTable.id, contrato.id));

    expect((await abrir(t2).expect(200)).body.contrato).toBeNull();
  });

  it("o PDF desce pelo token da noiva, e é o PDF", async () => {
    const { token } = await noivaComContrato({
      itens: [{ descricao: "Vestido Estrela", valorUnitario: 5000 }],
      valorTotal: 5000,
    });

    const r = await publico().get(`/api/portal/contrato-pdf?token=${token}`).expect(200);

    expect(r.headers["content-type"]).toContain("application/pdf");
    expect(r.body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  /**
   * Cuidado (d) do épico, literal: a rota do PDF serve documento financeiro por
   * token público e precisa checar **TTL e revogação** como as outras quatro.
   */
  it("o PDF pelo token EXPIRADO é 410, e pelo REVOGADO é 404", async () => {
    const { token, lead } = await noivaComContrato({
      itens: [{ descricao: "Vestido Névoa", valorUnitario: 5000 }],
      valorTotal: 5000,
    });
    await db
      .update(portalTokensTable)
      .set({ expiraEm: new Date(Date.now() - 86_400_000) })
      .where(eq(portalTokensTable.token, token));
    await publico().get(`/api/portal/contrato-pdf?token=${token}`).expect(410);

    const vivo = await portalDe(lead.id);
    await agent.delete(`/api/lojas/${f.lojaId}/leads/${lead.id}/portal`).expect(204);
    await publico().get(`/api/portal/contrato-pdf?token=${vivo}`).expect(404);
  });

  it("sem contrato ativo, o PDF é 404 em vez de um papel em branco", async () => {
    const lead = await criarLead(f);
    const token = await portalDe(lead.id);

    await publico().get(`/api/portal/contrato-pdf?token=${token}`).expect(404);
  });

  // ── F39: o vestido ──

  it("o vestido reservado chega com nome, retirada combinada e os ajustes", async () => {
    const { token, contrato, lead } = await noivaComContrato({
      itens: [{ descricao: "Vestido Serena", valorUnitario: 8000 }],
      valorTotal: 8000,
    });
    const { vestido } = await comVestidoReservado(contrato.id, lead.id);
    await comAjustes(lead.id, [
      { descricao: "Bainha 3cm", status: "FEITO" },
      { descricao: "Alça ajustada", status: "PENDENTE" },
    ]);

    const r = await abrir(token).expect(200);

    expect(r.body.vestido.vestidoId).toBe(vestido.id);
    expect(r.body.vestido.nome).toBe(vestido.nome);
    expect(r.body.vestido.retiradaPrevista).not.toBeNull();
    expect(r.body.vestido.retiradaFeitaEm).toBeNull();
    expect(r.body.vestido.ajustes).toEqual([
      { descricao: "Bainha 3cm", pronto: true },
      { descricao: "Alça ajustada", pronto: false },
    ]);
  });

  /**
   * O checklist é a conversa da loja com a costureira ("soltar bainha", "refazer
   * alça"), e é escrito nesse tom. A noiva quer saber se ficou pronto, não como.
   * O teste olha o JSON INTEIRO porque o vazamento poderia entrar por qualquer
   * seção — não só pela do vestido.
   */
  it("o checklist interno da costureira NUNCA sai no payload dela", async () => {
    const { token, contrato, lead } = await noivaComContrato({
      itens: [{ descricao: "Vestido Alva", valorUnitario: 8000 }],
      valorTotal: 8000,
    });
    await comVestidoReservado(contrato.id, lead.id);
    await comAjustes(lead.id, [
      { descricao: "Barra", status: "PENDENTE", checklist: "SEGREDO-DA-COSTUREIRA" },
    ]);

    const r = await abrir(token).expect(200);

    expect(JSON.stringify(r.body)).not.toContain("SEGREDO-DA-COSTUREIRA");
    expect(r.body.vestido.ajustes).toEqual([{ descricao: "Barra", pronto: false }]);
  });

  it("retirada já feita vira registro, e não promessa", async () => {
    const { token, contrato, lead } = await noivaComContrato({
      itens: [{ descricao: "Vestido Dália", valorUnitario: 8000 }],
      valorTotal: 8000,
    });
    await comVestidoReservado(contrato.id, lead.id, { retiradaDataReal: dataFutura(-2) });

    const r = await abrir(token).expect(200);
    expect(r.body.vestido.retiradaFeitaEm).not.toBeNull();
  });

  it("contrato sem reserva não inventa seção — pode ser contrato só de serviço", async () => {
    const { token } = await noivaComContrato({
      itens: [{ descricao: "Ajuste avulso", valorUnitario: 300 }],
      valorTotal: 300,
    });

    expect((await abrir(token).expect(200)).body.vestido).toBeNull();
  });

  /**
   * Bloqueio cancelado é o caso escorregadio: `contratos.bloqueioVestidoId` é
   * `set null`, e isso só dispara quando a LINHA some — cancelar é soft. Sem
   * esta guarda, o portal prometeria um vestido que a loja já liberou.
   */
  it("reserva cancelada não aparece — a loja já liberou aquele vestido", async () => {
    const { token, contrato, lead } = await noivaComContrato({
      itens: [{ descricao: "Vestido Bruma", valorUnitario: 8000 }],
      valorTotal: 8000,
    });
    await comVestidoReservado(contrato.id, lead.id, { canceladoEm: new Date() });

    expect((await abrir(token).expect(200)).body.vestido).toBeNull();
  });

  // ── A foto do vestido contratado ──

  it("a foto do vestido CONTRATADO desce mesmo sem lookbook — quem fecha na 1ª visita não tem um", async () => {
    const { token, contrato, lead } = await noivaComContrato({
      itens: [{ descricao: "Vestido Aura", valorUnitario: 8000 }],
      valorTotal: 8000,
    });
    const { vestido } = await comVestidoReservado(contrato.id, lead.id);
    await db.insert(vestidoFotosTable).values({
      id: randomUUID(),
      vestidoId: vestido.id,
      ordem: 0,
      bytes: PNG_1X1,
      mime: "image/png",
      largura: 1,
      altura: 1,
    });

    await publico()
      .get(`/api/portal/foto?token=${token}&vestidoId=${vestido.id}&ordem=0`)
      .expect(200);
  });

  it("o vestido de OUTRA noiva continua 404, mesmo existindo e tendo foto", async () => {
    const outra = await noivaComContrato({
      itens: [{ descricao: "Vestido da outra", valorUnitario: 8000 }],
      valorTotal: 8000,
    });
    const { vestido } = await comVestidoReservado(outra.contrato.id, outra.lead.id);
    await db.insert(vestidoFotosTable).values({
      id: randomUUID(),
      vestidoId: vestido.id,
      ordem: 0,
      bytes: PNG_1X1,
      mime: "image/png",
      largura: 1,
      altura: 1,
    });

    const intrusa = await criarLead(f);
    const tokenIntrusa = await portalDe(intrusa.id);

    await publico()
      .get(`/api/portal/foto?token=${tokenIntrusa}&vestidoId=${vestido.id}&ordem=0`)
      .expect(404);
  });

});
