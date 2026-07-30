import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, parcelasTable, auditLogTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  criarFixture,
  criarContrato,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * B6/E94 — dois recebimentos ao mesmo tempo na MESMA parcela.
 *
 * `POST /parcelas/:id/receber` lia a parcela fora da transação, somava em JS
 * (`jaRecebido + entrando`) e gravava o TOTAL com um UPDATE filtrado só por
 * `id`. A recepção lança R$ 300 e a vendedora lança R$ 700 no mesmo segundo:
 * as duas leem `valorRecebido = 0`, uma grava 300 e a outra grava 700, e a
 * última a escrever vence. Os R$ 300 entraram na gaveta e não existem no
 * sistema — sem erro, sem trilha divergente, sem nada que denuncie.
 *
 * O molde é `lote17-agenda-concorrencia`: dispara as duas requests em
 * `Promise.all` e afirma o par de status E o estado do banco. A diferença é
 * que lá quem arbitra é uma constraint do Postgres; aqui não existe constraint
 * possível (o valor certo depende do que foi lido), então quem arbitra é o
 * UPDATE condicional — o mesmo idioma de `convites.ts` e `portal.ts`.
 */

describe("E94/B6 — corrida no recebimento de parcela", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Uma parcela de 1.000 em contrato ativo, nada recebido. */
  async function novaParcela(valorPrevisto = 1_000): Promise<string> {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: valorPrevisto,
      fechadoEm: new Date(),
    });
    const id = randomUUID();
    await db.insert(parcelasTable).values({
      id,
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero: 0,
      valorPrevisto,
      vencimento: new Date(),
      status: "PREVISTA",
    });
    return id;
  }

  const receber = (parcelaId: string, valor: number) =>
    agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/receber`).send({
      valorRecebido: valor,
      recebidoEm: new Date().toISOString(),
      formaRecebimento: "PIX",
    });

  const lerParcela = async (id: string) => {
    const [p] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, id));
    return p;
  };

  /**
   * O invariante que importa, e o único que vale afirmar sob corrida: **o que
   * está gravado é a soma exata do que a API confirmou**. Nem menos (o dinheiro
   * que a vendedora viu "registrado" e sumiu — o bug) nem mais (cobrar duas
   * vezes o mesmo recebimento).
   *
   * Não afirmamos "exatamente um vence": dois podem vencer legitimamente se o
   * segundo LER o estado já gravado pelo primeiro e somar em cima. Isso não é
   * perda, é a soma certa — e proibi-lo seria testar o escalonador do Postgres
   * em vez do conserto.
   */
  const somaDosConfirmados = (rs: { status: number }[], valores: number[]) =>
    rs.reduce((s, r, i) => (r.status === 200 ? s + valores[i] : s), 0);

  it("dois recebimentos simultâneos: nada é gravado que a API não tenha confirmado", async () => {
    const parcelaId = await novaParcela(1_000);
    const valores = [300, 700];

    const rs = await Promise.all(valores.map((v) => receber(parcelaId, v)));

    // Ao menos um passa — a corrida não pode travar as duas pontas.
    expect(rs.some((r) => r.status === 200)).toBe(true);
    // Quem não passou passou com 409 explícito, nunca com 200 mentiroso.
    expect(rs.every((r) => r.status === 200 || r.status === 409)).toBe(true);

    const parcela = await lerParcela(parcelaId);
    expect(parcela.valorRecebido).toBe(somaDosConfirmados(rs, valores));
    // Antes do conserto os dois respondiam 200 e o banco guardava 300 OU 700 —
    // nunca 1.000. Era essa diferença que ia para a gaveta.
    expect(parcela.status).toBe(parcela.valorRecebido === 1_000 ? "PAGA" : "PARCIAL");
  });

  it("o 409 diz que a parcela mudou, e não um erro genérico", async () => {
    const parcelaId = await novaParcela(1_000);
    const [r1, r2] = await Promise.all([receber(parcelaId, 300), receber(parcelaId, 700)]);
    const perdedor = r1.status === 409 ? r1 : r2;

    // A vendedora vai reler o valor na tela e digitar de novo — precisa saber
    // que o motivo é "alguém mexeu", não "deu erro".
    expect(perdedor.body.error).toBe("PARCELA_MUDOU");
    expect(perdedor.body.detalhe).toMatch(/mudou|confira/i);
  });

  it("a trilha tem uma linha por recebimento CONFIRMADO, e nenhuma a mais", async () => {
    const parcelaId = await novaParcela(1_000);
    const valores = [300, 700];
    const rs = await Promise.all(valores.map((v) => receber(parcelaId, v)));
    const confirmados = rs.filter((r) => r.status === 200).length;

    const linhas = await db
      .select()
      .from(auditLogTable)
      .where(
        and(eq(auditLogTable.lojaId, f.lojaId), eq(auditLogTable.entidadeId, parcelaId)),
      );
    // Auditoria de dinheiro que não aconteceu é pior que auditoria nenhuma:
    // ela faz a conferência bater com um recebimento inexistente. Antes, os
    // dois 200 deixavam duas linhas para um único valor gravado.
    expect(linhas).toHaveLength(confirmados);
  });

  it("recebimentos SEQUENCIAIS continuam somando — o conserto não quebra o parcial", async () => {
    const parcelaId = await novaParcela(1_000);

    await receber(parcelaId, 300).expect(200);
    await receber(parcelaId, 700).expect(200);

    const parcela = await lerParcela(parcelaId);
    expect(parcela.valorRecebido).toBe(1_000);
    expect(parcela.status).toBe("PAGA");
  });

  it("três ao mesmo tempo: o gravado continua sendo a soma do confirmado", async () => {
    const parcelaId = await novaParcela(1_000);
    const valores = [100, 200, 300];

    const rs = await Promise.all(valores.map((v) => receber(parcelaId, v)));

    expect(rs.some((r) => r.status === 200)).toBe(true);
    expect(rs.every((r) => r.status === 200 || r.status === 409)).toBe(true);

    const parcela = await lerParcela(parcelaId);
    expect(parcela.valorRecebido).toBe(somaDosConfirmados(rs, valores));
  });
});
