import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, lojasTable, parcelasTable } from "@workspace/db";
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
 * **E234 — o que é da loja mora no cadastro da loja (D7, respondida SIM).**
 *
 * Sete colunas novas em `lojas`, e três lugares que têm de vê-las: a porta da
 * dona (`PATCH /lojas/:id/dados`), a SESSÃO (`/auth/me` — a tela lê a loja
 * dali; sem os sete no select, o formulário abria vazio e "salvar" apagava o
 * que estava gravado — achado durante a execução, não no plano) e o PAPEL
 * (o instrumento imprime representante, foro e PIX; o recibo imprime o PIX).
 *
 * VERMELHO ANTES (no `main`): a porta respondia 400 CAMPO_NAO_EDITAVEL para
 * `cidade`, o `/auth/me` não trazia os campos, e o PDF saía com a lacuna.
 */
const SETE = {
  cidade: "São José dos Campos",
  uf: "sp",
  representanteNome: "Renato Nascimento de Brito",
  representanteRg: "42.909.064-x",
  representanteCpf: "33348647827", // sem pontuação: a porta normaliza
  pixChave: "23723482805",
  pixTitular: "Karina Shabalina",
};

const textoDoPdf = (bytes: Buffer) =>
  [...bytes.toString("latin1").matchAll(/\((.*)\) Tj/g)]
    .map((m) => m[1]!.trim().replace(/\\([()])/g, "$1"))
    .join(" ");

describe("E234 — o cadastro da loja alimenta o instrumento", () => {
  let f: Fixture;
  let dona: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    dona = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("a porta da dona grava os sete, normaliza o CPF e recusa o que não fecha", async () => {
    const r = await dona
      .patch(`/api/lojas/${f.lojaId}/dados`)
      .send({ ...SETE, representanteCpf: "123.456.789-00" })
      .expect(422);
    expect(r.body.error).toBe("CPF_INVALIDO");
    expect(r.body.campos).toEqual([{ campo: "representanteCpf", motivo: expect.stringContaining("dígitos") }]);

    const ok = await dona.patch(`/api/lojas/${f.lojaId}/dados`).send(SETE).expect(200);
    expect(ok.body.representanteCpf).toBe("333.486.478-27");
    expect(ok.body.cidade).toBe("São José dos Campos");

    const noBanco = (await db.select().from(lojasTable).where(eq(lojasTable.id, f.lojaId)))[0]!;
    expect(noBanco.pixChave).toBe("23723482805");
    expect(noBanco.pixTitular).toBe("Karina Shabalina");

    // Vazio APAGA: limpar o campo na tela não pode gravar "".
    await dona.patch(`/api/lojas/${f.lojaId}/dados`).send({ pixTitular: "" }).expect(200);
    expect((await db.select().from(lojasTable).where(eq(lojasTable.id, f.lojaId)))[0]!.pixTitular).toBeNull();
    await dona.patch(`/api/lojas/${f.lojaId}/dados`).send({ pixTitular: SETE.pixTitular }).expect(200);
  });

  it("a sessão devolve os sete — é dali que a tela Dados da loja lê", async () => {
    // A dona da fixture é superadmin (a outra ramificação de `buscarLojasUsuario`
    // devolve a linha inteira); a VENDEDORA passa pelo select enumerado.
    const vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const me = await vendedora.get("/api/auth/me").expect(200);
    const loja = (me.body.lojas as { id: string; representanteNome?: string; pixChave?: string; cidade?: string }[]).find(
      (l) => l.id === f.lojaId,
    )!;
    expect(loja.representanteNome).toBe("Renato Nascimento de Brito");
    expect(loja.pixChave).toBe("23723482805");
    expect(loja.cidade).toBe("São José dos Campos");
  });

  it("o instrumento imprime quem assina, o foro e o PIX; o recibo imprime o PIX", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 3000, fechadoEm: new Date() });
    const pdf = await dona.get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/pdf`).expect(200);
    const txt = textoDoPdf(pdf.body as Buffer);
    expect(txt).toContain(
      "neste ato representada por Renato Nascimento de Brito, Carteira de Identidade nº 42.909.064-x, CPF nº 333.486.478-27",
    );
    expect(txt).toContain("foro da comarca deste município de SÃO JOSÉ DOS CAMPOS");
    expect(txt).toContain("São José dos Campos - SP,");
    expect(txt).toContain("PIX: 23723482805 (Karina Shabalina)");

    // O recibo é o papel do PAGAMENTO — a chave é onde se paga.
    const [parcela] = await db
      .insert(parcelasTable)
      .values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 1,
        origem: "PLANO",
        valorPrevisto: 1000,
        vencimento: new Date(Date.now() + 30 * 86_400_000),
      })
      .returning();
    await dona
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcela!.id}/receber`)
      .send({ valorRecebido: 1000, recebidoEm: new Date().toISOString(), formaRecebimento: "PIX" })
      .expect(200);
    const recibos = await dona.get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/recibos`).expect(200);
    const recibo = await dona
      .get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/recibos/${recibos.body.recibos[0].id}/pdf`)
      .expect(200);
    expect(textoDoPdf(recibo.body as Buffer)).toContain("PIX: 23723482805 (Karina Shabalina)");
  });
});
