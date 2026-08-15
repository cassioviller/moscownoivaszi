import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, contratosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarContrato,
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * S-C232 — apagar uma data gravada é uma decisão tão legítima quanto trocá-la.
 *
 * A nota do E224 prometia (*"o campo esvaziado manda `null` de propósito"*) o
 * que nem o spec aceitava: `ContratoUpdate` declarava as datas da locação e o
 * prazo da 18ª sem `null`. E a sobra estava ERRADA no mecanismo, para pior:
 * o Zod gerado é `zod.coerce.date()`, e `new Date(null)` é **01/01/1970** —
 * o `PATCH { dataRetirada: null }` de hoje não era recusado, era CONVERTIDO
 * numa retirada em 31/12/1969 21:00 (São Paulo), que o expediente da 4ª
 * recusava por acidente de horário.
 *
 * VERMELHO ANTES (spec sem null, medido neste arquivo):
 * - `dataRetirada: null` → `expected 200 "OK", got 422 "Unprocessable Entity"`
 *   com `RETIRADA_FORA_DO_EXPEDIENTE` sobre "31/12/1969" — a data fantasma.
 * - `prazoDevolucaoReservaDias: null` → 400 `VALIDACAO`
 *   (`expected 200 "OK", got 400 "Bad Request"`).
 *
 * Com o spec `nullable` (`type: ["string","null"]`), o `ZodNullable` decide
 * ANTES da coerção: `null` atravessa como `null`, o UPDATE grava `null`, e as
 * guardas de retirada/carnê não rodam — apagar a data não pode violar prazo
 * nenhum.
 */
describe("S-C232 — o PATCH aceita null e apaga a data da locação", () => {
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

  async function contratoComDatas() {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 3000,
      fechadoEm: new Date(),
    });
    // Gravadas por fora da porta, como o E224 as deixaria: quarta 15h e
    // segunda 15h locais, dentro do expediente de retirada padrão.
    await db
      .update(contratosTable)
      .set({
        dataRetirada: new Date("2027-09-08T15:00:00-03:00"),
        dataDevolucao: new Date("2027-09-13T15:00:00-03:00"),
        prazoDevolucaoReservaDias: 5,
      })
      .where(eq(contratosTable.id, contrato.id));
    return contrato;
  }

  it("dataRetirada: null apaga a retirada — e NÃO vira 01/01/1970", async () => {
    const contrato = await contratoComDatas();
    await agent
      .patch(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`)
      .send({ dataRetirada: null })
      .expect(200);

    const [linha] = await db
      .select({
        dataRetirada: contratosTable.dataRetirada,
        dataDevolucao: contratosTable.dataDevolucao,
      })
      .from(contratosTable)
      .where(eq(contratosTable.id, contrato.id));
    expect(linha.dataRetirada).toBeNull();
    // O campo que não veio no corpo fica como está — a gramática do S-M10.
    expect(linha.dataDevolucao).not.toBeNull();
  });

  it("dataDevolucao: null e prazoDevolucaoReservaDias: null apagam os dois", async () => {
    const contrato = await contratoComDatas();
    await agent
      .patch(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`)
      .send({ dataDevolucao: null, prazoDevolucaoReservaDias: null })
      .expect(200);

    const [linha] = await db
      .select({
        dataRetirada: contratosTable.dataRetirada,
        dataDevolucao: contratosTable.dataDevolucao,
        prazoDevolucaoReservaDias: contratosTable.prazoDevolucaoReservaDias,
      })
      .from(contratosTable)
      .where(eq(contratosTable.id, contrato.id));
    expect(linha.dataDevolucao).toBeNull();
    expect(linha.prazoDevolucaoReservaDias).toBeNull();
    expect(linha.dataRetirada).not.toBeNull();
  });

  it("campo AUSENTE continua sendo 'não mexi': o PATCH de outra coisa preserva as datas", async () => {
    const contrato = await contratoComDatas();
    await agent
      .patch(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`)
      .send({ observacoes: "só a observação" })
      .expect(200);

    const [linha] = await db
      .select({
        dataRetirada: contratosTable.dataRetirada,
        dataDevolucao: contratosTable.dataDevolucao,
        prazoDevolucaoReservaDias: contratosTable.prazoDevolucaoReservaDias,
      })
      .from(contratosTable)
      .where(eq(contratosTable.id, contrato.id));
    expect(linha.dataRetirada).not.toBeNull();
    expect(linha.dataDevolucao).not.toBeNull();
    expect(linha.prazoDevolucaoReservaDias).toBe(5);
  });
});
