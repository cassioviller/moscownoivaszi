import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, parcelasTable, contasPagarTable } from "@workspace/db";
import { addDias, hojeLocal } from "@workspace/financeiro-core";
import {
  criarFixture,
  criarLead,
  criarContrato,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Motor único (E25): o dashboard soma "a receber/pagar 30 dias" pela MESMA
 * régua do frontend — dia de negócio SP, hoje INCLUSIVO, centavos inteiros.
 * A soma antiga em SQL por instante descartava o vencimento de hoje (meio-dia)
 * quando a consulta rodava à tarde.
 */

/** Instante de vencimento ancorado ao meio-dia SP de um dia local. */
const vencimentoEm = (dia: string) => new Date(`${dia}T12:00:00-03:00`);

describe("Dashboard — janela de 30 dias pelo motor único (E25)", () => {
  let f: Fixture;
  let ag: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    // E101/B7: o dashboard só devolve os números de dinheiro para quem tem
    // `financeiro: ver`, e o perfil da vendedora da fixture NÃO tem (ele
    // concede leads, vestidos e agenda — ver o cabeçalho do lote7). Este teste
    // é sobre a JANELA de 30 dias e a soma em centavos, não sobre permissão:
    // ele passa a entrar pelo superadmin para continuar medindo o que mede.
    ag = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("hoje entra, +30 entra, ontem e +31 ficam fora — e centavos somam exato", async () => {
    const hoje = hojeLocal();
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 1000,
      fechadoEm: new Date(),
    });

    const parcela = (numero: number, dia: string, valor: number, status: "PREVISTA" | "PAGA" = "PREVISTA") => ({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero,
      valorPrevisto: valor,
      vencimento: vencimentoEm(dia),
      status,
    });
    await db.insert(parcelasTable).values([
      // 0.10 + 0.20 em float daria 0.30000000000000004; o motor soma inteiro.
      parcela(1, hoje, 0.1),
      parcela(2, hoje, 0.2),
      parcela(3, addDias(hoje, 30), 5), // última ponta da janela, inclusiva
      parcela(4, addDias(hoje, 31), 7777), // fora
      parcela(5, addDias(hoje, -1), 8888), // vencida: é atraso, não horizonte
      parcela(6, addDias(hoje, 10), 9999, "PAGA"), // paga não é previsão
    ]);

    await db.insert(contasPagarTable).values([
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        tipo: "DESPESA" as const,
        descricao: "Aluguel",
        valorPrevisto: 2.5,
        vencimento: vencimentoEm(hoje),
      },
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        tipo: "DESPESA" as const,
        descricao: "Fora da janela",
        valorPrevisto: 6666,
        vencimento: vencimentoEm(addDias(hoje, 31)),
      },
    ]);

    const res = await ag.get(`/api/lojas/${f.lojaId}/dashboard`).expect(200);
    expect(res.body.receberProximos30Dias).toBe(5.3);
    expect(res.body.pagarProximos30Dias).toBe(2.5);
  });
});
