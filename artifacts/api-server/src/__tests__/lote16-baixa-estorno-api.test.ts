import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, contratosTable, perfisTable } from "@workspace/db";
import {
  criarFixture,
  criarLead,
  criarContrato,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

// Meio-dia São Paulo (offset fixo) — competências passadas, como o lote 9.
const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

describe("Lote 16 — baixa manual de estorno (I10)", () => {
  afterAll(async () => {
    await fecharPool();
  });

  // Arma o cenário do I10: uma venda paga num mês fechado, depois cancelada, e a
  // vendedora que NUNCA mais vendeu — o estorno carrega sem nenhum mês para
  // absorvê-lo. Devolve o agent superadmin e o contrato pendente.
  async function comEstornoPendente(outra: Fixture) {
    const ag = await loginComLoja(outra.superAdminEmail, outra.lojaId);
    await ag.post(`/api/lojas/${outra.lojaId}/comissao/regras`).send({
      vendedoraId: outra.vendedoraId,
      vigenciaInicio: dia("2020-01-01").toISOString(),
      faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual: 10 }],
    }).expect(201);

    const lead = await criarLead(outra);
    const contrato = await criarContrato(outra, {
      leadId: lead.id,
      valorTotal: 10000,
      fechadoEm: dia("2025-06-10"),
    });
    await ag
      .post(`/api/lojas/${outra.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2025-06" })
      .expect(201);
    await ag
      .post(`/api/lojas/${outra.lojaId}/contratos/${contrato.id}/cancelar`)
      .send({ motivo: "Desistência" })
      .expect(200);
    return { ag, contrato };
  }

  it("baixa o estorno que carregava — soma no resultado e some do preview", async () => {
    const outra = await criarFixture();
    try {
      const { ag, contrato } = await comEstornoPendente(outra);

      // Antes: pendente e visível em julho, sem venda para absorver.
      const antes = await ag
        .get(`/api/lojas/${outra.lojaId}/comissao/preview`)
        .query({ competencia: "2025-07" })
        .expect(200);
      expect(antes.body[0].estornoPendente).toBe(10000);

      const baixa = await ag
        .post(`/api/lojas/${outra.lojaId}/comissao/estornos/baixa`)
        .send({ vendedoraId: outra.vendedoraId, competencia: "2025-07", motivo: "Acordo com a vendedora" })
        .expect(200);
      expect(baixa.body).toEqual({
        vendedoraId: outra.vendedoraId,
        contratosBaixados: 1,
        valorBaixado: 10000,
      });

      // Depois: o estorno reconciliado sai do preview (sem venda e sem pendência).
      const depois = await ag
        .get(`/api/lojas/${outra.lojaId}/comissao/preview`)
        .query({ competencia: "2025-07" })
        .expect(200);
      expect(depois.body).toEqual([]);

      // Rastro: quem baixou e por quê ficam no contrato, distinguindo a baixa
      // manual da reconciliação automática (que não preenche estes campos).
      const [linha] = await db
        .select({
          estornadaEm: contratosTable.comissaoEstornadaEm,
          por: contratosTable.comissaoEstornoBaixaPor,
          motivo: contratosTable.comissaoEstornoBaixaMotivo,
        })
        .from(contratosTable)
        .where(eq(contratosTable.id, contrato.id));
      expect(linha.estornadaEm).not.toBeNull();
      expect(linha.por).toBe(outra.superAdminId);
      expect(linha.motivo).toBe("Acordo com a vendedora");
    } finally {
      await limparFixture(outra);
    }
  });

  it("baixar duas vezes: a segunda não acha o que baixar → 422", async () => {
    const outra = await criarFixture();
    try {
      const { ag } = await comEstornoPendente(outra);
      await ag
        .post(`/api/lojas/${outra.lojaId}/comissao/estornos/baixa`)
        .send({ vendedoraId: outra.vendedoraId, competencia: "2025-07" })
        .expect(200);
      const segunda = await ag
        .post(`/api/lojas/${outra.lojaId}/comissao/estornos/baixa`)
        .send({ vendedoraId: outra.vendedoraId, competencia: "2025-07" })
        .expect(422);
      expect(segunda.body.error).toBe("SEM_ESTORNO_PENDENTE");
    } finally {
      await limparFixture(outra);
    }
  });

  it("só admin baixa: quem tem comissão mas não admin leva 403", async () => {
    const outra = await criarFixture();
    try {
      const { ag } = await comEstornoPendente(outra);
      // A vendedora ganha comissão (para passar o gate do módulo) mas não admin.
      await db
        .update(perfisTable)
        .set({ acessosModulos: { comissao: { ver: true, criar: true, editar: true } } })
        .where(eq(perfisTable.id, outra.perfilId));

      const vend = await loginComLoja(outra.vendedoraEmail, outra.lojaId);
      const negada = await vend
        .post(`/api/lojas/${outra.lojaId}/comissao/estornos/baixa`)
        .send({ vendedoraId: outra.vendedoraId, competencia: "2025-07" })
        .expect(403);
      expect(negada.body.error).toBe("ACESSO_NEGADO_MODULO");
      expect(negada.body.modulo).toBe("admin");

      // E o admin (superadmin) segue conseguindo — a pendência não foi tocada.
      await ag
        .post(`/api/lojas/${outra.lojaId}/comissao/estornos/baixa`)
        .send({ vendedoraId: outra.vendedoraId, competencia: "2025-07" })
        .expect(200);
    } finally {
      await limparFixture(outra);
    }
  });

  it("baixa manual aparece no relatório com autor, motivo e valor; loja alheia não vê", async () => {
    const outra = await criarFixture();
    const alheia = await criarFixture();
    try {
      const { ag, contrato } = await comEstornoPendente(outra);
      await ag
        .post(`/api/lojas/${outra.lojaId}/comissao/estornos/baixa`)
        .send({ vendedoraId: outra.vendedoraId, competencia: "2025-07", motivo: "Desligamento" })
        .expect(200);

      const rel = await ag
        .get(`/api/lojas/${outra.lojaId}/comissao/estornos/baixas`)
        .expect(200);
      expect(rel.body).toHaveLength(1);
      expect(rel.body[0]).toMatchObject({
        contratoId: contrato.id,
        vendedoraId: outra.vendedoraId,
        valor: 10000,
        motivo: "Desligamento",
      });
      expect(rel.body[0].baixadoPorNome).toContain("Super Admin");
      expect(rel.body[0].noivaNome).toContain("Noiva");
      expect(rel.body[0].baixadoEm).toBeTruthy();

      // A loja alheia não enxerga a baixa desta.
      const agAlheia = await loginComLoja(alheia.superAdminEmail, alheia.lojaId);
      const relAlheia = await agAlheia
        .get(`/api/lojas/${alheia.lojaId}/comissao/estornos/baixas`)
        .expect(200);
      expect(relAlheia.body).toEqual([]);
    } finally {
      await limparFixture(outra);
      await limparFixture(alheia);
    }
  });

  it("reconciliação automática (absorvida por fechamento) NÃO entra no relatório", async () => {
    const outra = await criarFixture();
    try {
      const ag = await loginComLoja(outra.superAdminEmail, outra.lojaId);
      await ag.post(`/api/lojas/${outra.lojaId}/comissao/regras`).send({
        vendedoraId: outra.vendedoraId,
        vigenciaInicio: dia("2020-01-01").toISOString(),
        faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual: 10 }],
      }).expect(201);

      // Junho vende e fecha; a venda é cancelada; JULHO vende de novo e o
      // fechamento de julho ABSORVE o estorno — reconciliação automática.
      const lead = await criarLead(outra);
      const contratoJun = await criarContrato(outra, {
        leadId: lead.id, valorTotal: 5000, fechadoEm: dia("2025-06-10"),
      });
      await ag.post(`/api/lojas/${outra.lojaId}/comissao/fechamentos`)
        .send({ competencia: "2025-06" }).expect(201);
      await ag.post(`/api/lojas/${outra.lojaId}/contratos/${contratoJun.id}/cancelar`)
        .send({ motivo: "Desistência" }).expect(200);
      const lead2 = await criarLead(outra);
      await criarContrato(outra, {
        leadId: lead2.id, valorTotal: 8000, fechadoEm: dia("2025-07-10"),
      });
      await ag.post(`/api/lojas/${outra.lojaId}/comissao/fechamentos`)
        .send({ competencia: "2025-07" }).expect(201);

      // O estorno foi reconciliado (comissaoEstornadaEm carimbado), mas sem
      // autor — não é baixa manual, não aparece.
      const [linha] = await db
        .select({ estornadaEm: contratosTable.comissaoEstornadaEm })
        .from(contratosTable)
        .where(eq(contratosTable.id, contratoJun.id));
      expect(linha.estornadaEm).not.toBeNull();

      const rel = await ag
        .get(`/api/lojas/${outra.lojaId}/comissao/estornos/baixas`)
        .expect(200);
      expect(rel.body).toEqual([]);
    } finally {
      await limparFixture(outra);
    }
  });

  it("vendedora de outra loja → 422 VENDEDORA_INVALIDA", async () => {
    const outra = await criarFixture();
    const alheia = await criarFixture();
    try {
      const ag = await loginComLoja(outra.superAdminEmail, outra.lojaId);
      const res = await ag
        .post(`/api/lojas/${outra.lojaId}/comissao/estornos/baixa`)
        .send({ vendedoraId: alheia.vendedoraId, competencia: "2025-07" })
        .expect(422);
      expect(res.body.error).toBe("VENDEDORA_INVALIDA");
    } finally {
      await limparFixture(outra);
      await limparFixture(alheia);
    }
  });
});
