import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import { db, contratosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarContrato,
  criarFixture,
  criarLead,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **E229 — a Recepção vê as DATAS, e só as datas** (S-C220, decisão da dona em
 * 14/08/2026, na recomendação).
 *
 * A S-C91 pôs retirada e devolução na ficha da noiva *"para quem atende o
 * telefone"* — e derivou as duas de `contratosDaNoiva`, que para a Recepção é
 * `[]` desde o E172 (`contratos: NADA`). A única pessoa cujo trabalho a sobra
 * nomeava era a única que não recebeu o que ela entregou.
 *
 * A decisão preserva o E172 em vez de reabri-lo: nasce a LEITURA ESTREITA —
 * `GET /leads/:leadId/locacao`, sob o módulo `leads` (o dela), devolvendo as
 * duas datas do contrato ativo e **nada de dinheiro**: nem valor, nem
 * parcelas, nem status de pagamento. É o idioma do `VestidoDaNoiva` do portal:
 * cada papel vê o RECORTE que o trabalho dele precisa.
 */
describe("E229 — a leitura estreita da locação", () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    admin = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  async function noivaComLocacao() {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 4000,
      fechadoEm: new Date(),
    });
    await db
      .update(contratosTable)
      .set({ dataRetirada: dataFutura(27), dataDevolucao: dataFutura(33) })
      .where(eq(contratosTable.id, contrato.id));
    return { lead, contrato };
  }

  it("devolve as duas datas do contrato ativo — e NENHUM campo de dinheiro", async () => {
    const { lead } = await noivaComLocacao();

    const r = await admin.get(`/api/lojas/${f.lojaId}/leads/${lead.id}/locacao`).expect(200);

    expect(r.body.retirada).toBeTruthy();
    expect(r.body.devolucao).toBeTruthy();
    // A fronteira é o teste inteiro: o payload não pode carregar o que o E172
    // fechou. Enumerar as chaves prega isso contra o futuro — campo novo aqui
    // é decisão, não deriva. E231: as duas datas REAIS entraram POR decisão
    // (S-C121 — data real não é dinheiro, e é o que impede a ficha de prometer
    // uma retirada que já aconteceu); a régua mordeu e a razão está escrita.
    expect(Object.keys(r.body).sort()).toEqual([
      "contratoId",
      "devolucao",
      "devolucaoFeitaEm",
      "retirada",
      "retiradaFeitaEm",
    ]);
  });

  it("sem contrato ativo, `null` — a ficha silencia em vez de inventar linha", async () => {
    const lead = await criarLead(f);

    const r = await admin.get(`/api/lojas/${f.lojaId}/leads/${lead.id}/locacao`).expect(200);
    expect(r.body).toBeNull();
  });

  it("contrato CANCELADO não tem locação a prometer", async () => {
    const lead = await criarLead(f);
    await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 4000,
      fechadoEm: dataFutura(-30),
      canceladoEm: new Date(),
    });

    const r = await admin.get(`/api/lojas/${f.lojaId}/leads/${lead.id}/locacao`).expect(200);
    expect(r.body).toBeNull();
  });

  it("a RECEPÇÃO alcança — é para ela que a porta existe", async () => {
    const { lead } = await noivaComLocacao();

    // O recorte de acesso da Recepção do E172: leads TUDO, contratos NADA. A
    // vendedora da fixture não serve de dublê — ela vê contratos.
    const { randomUUID } = await import("node:crypto");
    const { perfisTable, usuariosTable, usuariosLojasTable } = await import("@workspace/db");
    const sufixo = randomUUID().slice(0, 8);
    const perfilId = randomUUID();
    const usuarioId = randomUUID();
    const email = `recepcao-${sufixo}@teste.local`;
    const TUDO = { ver: true, criar: true, editar: true };
    await db.insert(perfisTable).values({
      id: perfilId,
      nome: `Recepção Teste ${sufixo}`,
      acessosModulos: { leads: TUDO, agenda: TUDO, vestidos: { ver: true, criar: false, editar: false } },
    });
    // O MESMO hash da fixture: a senha compartilhada da suíte.
    const [vendedora] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, f.vendedoraId));
    await db.insert(usuariosTable).values({
      id: usuarioId,
      nome: `Recepção Teste ${sufixo}`,
      email,
      senhaHash: vendedora!.senhaHash,
    });
    await db.insert(usuariosLojasTable).values({ usuarioId, lojaId: f.lojaId, perfilId });

    const recepcao = await loginComLoja(email, f.lojaId);
    const r = await recepcao.get(`/api/lojas/${f.lojaId}/leads/${lead.id}/locacao`).expect(200);

    expect(r.body.retirada).toBeTruthy();

    // E a porta LARGA continua fechada para ela — a estreita não é brecha.
    await recepcao
      .get(`/api/lojas/${f.lojaId}/contratos`)
      .query({ leadId: lead.id })
      .expect(403);
  });

  it("noiva de outra loja é 404 — o recorte não atravessa a cerca", async () => {
    const outra = await criarFixture();
    try {
      const { lead } = await noivaComLocacao();
      const agentOutra = await loginComLoja(outra.superAdminEmail, outra.lojaId);
      await agentOutra.get(`/api/lojas/${outra.lojaId}/leads/${lead.id}/locacao`).expect(404);
    } finally {
      await limparFixture(outra);
    }
  });

  it("sem sessão é 401 — o recorte é interno, não é o portal", async () => {
    const { lead } = await noivaComLocacao();
    await request(app).get(`/api/lojas/${f.lojaId}/leads/${lead.id}/locacao`).expect(401);
  });
});
