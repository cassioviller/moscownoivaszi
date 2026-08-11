import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarVestido,
  criarLead,
  criarBloqueio,
  criarContrato,
  dataFutura,
  type Fixture,
} from "./helpers";

/**
 * E71 — a devolução ganha consequência.
 *
 * O atraso já era detectado (ATRASO_DEVOLUCAO), mas o vestido que voltava
 * manchado morria numa conversa. Avaria vira linha com foto-evidência (mesma
 * borda por magic bytes do E3) e o custo pode virar parcela avulsa do
 * contrato — cobrável pela mesma régua de sempre.
 */

/**
 * PNG 1×1 válido — os magic bytes importam, o conteúdo não.
 *
 * E170: estes 70 bytes mediam a BORDA e nunca o TAMANHO, e a suíte verde sobre
 * eles escondia o V1 — o `express.json()` padrão barrava a foto de celular em
 * 102.400 bytes de corpo enquanto cliente e servidor anunciavam 2 MiB. A régua
 * de tamanho existe desde o E167 e mora em `e167-avaria-fecha-api.test.ts:66`
 * (1,5 MB entram) e `:81` (acima de 2 MiB é 422 `FOTO_MUITO_GRANDE`, não um 413
 * mudo). Quem mexer no limite mexe LÁ; este arquivo segue medindo a borda.
 */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

describe("Avarias e parcela avulsa (E71)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let bloqueioId: string;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const vestido = await criarVestido(f);
    const lead = await criarLead(f);
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      casamentoData: dataFutura(30),
    });
    bloqueioId = bloqueio.id;
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("registra avaria com foto; a listagem devolve meta e a foto vem pela rota própria", async () => {
    const criada = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueioId}/avarias`)
      .send({
        descricao: "Barra rasgada no lado esquerdo",
        custoReparo: 180,
        fotoBase64: PNG_1X1.toString("base64"),
      })
      .expect(201);
    expect(criada.body.temFoto).toBe(true);
    expect(criada.body.registradoPorNome).toContain("Vendedora");
    expect(JSON.stringify(criada.body)).not.toContain("fotoBytes");

    const lista = await agent
      .get(`/api/lojas/${f.lojaId}/bloqueios/${bloqueioId}/avarias`)
      .expect(200);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].custoReparo).toBe(180);

    const foto = await agent
      .get(`/api/lojas/${f.lojaId}/avarias/${criada.body.id}/foto`)
      .expect(200);
    expect(foto.headers["content-type"]).toContain("image/png");
  });

  it("recusa binário que não é imagem — o mime sai dos bytes, não da palavra do cliente", async () => {
    await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueioId}/avarias`)
      .send({ descricao: "x", fotoBase64: Buffer.from("<script>oi</script>").toString("base64") })
      .expect(422);
  });

  it("avaria sem foto: 404 na rota da foto, temFoto false", async () => {
    const criada = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueioId}/avarias`)
      .send({ descricao: "Mancha leve no tule" })
      .expect(201);
    expect(criada.body.temFoto).toBe(false);
    await agent.get(`/api/lojas/${f.lojaId}/avarias/${criada.body.id}/foto`).expect(404);
  });

  it("a parcela avulsa entra com o próximo número e cai na régua normal", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 5000,
      fechadoEm: new Date(),
    });

    const r1 = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas`)
      .send({
        descricao: "Reparo de avaria — barra rasgada",
        valorPrevisto: 180,
        vencimento: dataFutura(10).toISOString(),
      })
      .expect(201);
    expect(r1.body.numero).toBe(1);
    expect(r1.body.status).toBe("PREVISTA");

    const r2 = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas`)
      .send({
        descricao: "Multa por devolução atrasada",
        valorPrevisto: 90,
        vencimento: dataFutura(10).toISOString(),
      })
      .expect(201);
    expect(r2.body.numero).toBe(2);
  });

  it("contrato cancelado não aceita parcela avulsa (422)", async () => {
    const lead = await criarLead(f);
    const cancelado = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 3000,
      fechadoEm: new Date(),
      canceladoEm: new Date(),
    });
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${cancelado.id}/parcelas`)
      .send({ descricao: "Multa", valorPrevisto: 50, vencimento: dataFutura(5).toISOString() })
      .expect(422);
  });
});
