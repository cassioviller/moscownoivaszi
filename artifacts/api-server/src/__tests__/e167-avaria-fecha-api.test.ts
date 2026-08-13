import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarReserva,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E167 — a avaria fecha.
 *
 * Três defeitos independentes bloqueavam a cobrança do reparo em pontos
 * diferentes, e cada um sozinho já bastava:
 *
 * - **V1** a foto real nunca chegava ao servidor: a rota caía no
 *   `express.json()` global de 100 KB e a foto de celular (1,5 MB) devolvia
 *   413. O 422 `FOTO_MUITO_GRANDE` que declara o teto de 2 MiB era código
 *   morto — a suíte era verde porque o único teste mandava um PNG de 70 bytes.
 * - **V14** o `GET /bloqueios/:id` não dizia de QUEM é o bloqueio quando o
 *   `lead_id` dele é nulo — e em 2026-07, 61 das 63 avarias do banco viviam
 *   nesse caso.
 * - **V2** o payload da avaria não carregava o status da parcela, então a tela
 *   não conseguia distinguir cobrança VIVA de cobrança CANCELADA.
 *
 * **S-C10 (13/08/2026) — o "61 das 63" foi remedido, e nenhuma asserção deste
 * arquivo dependia dele.** Hoje são **ZERO avarias** em `heliumdb` e em
 * `moscow_base`, e o bloqueio sem `lead_id` é 0 de 116 na loja e 2 de 127 no
 * dev: o caso é raro, não comum. Nada aqui precisou mudar de valor esperado —
 * cada `it` MONTA a sua fixture e prega o mecanismo, não a população. O número
 * era prosa, e prosa envelhecida ainda decide desenho: a conta remedida mora em
 * `src/lib/dono-do-bloqueio.ts`.
 */

/** PNG sintético inflado até `bytes` — assinatura + IHDR válidos, como o dos vestidos. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
function pngDe(bytes: number): string {
  const buf = Buffer.alloc(bytes);
  Buffer.from(PNG_1X1, "base64").copy(buf, 0);
  return buf.toString("base64");
}

describe("E167 — a avaria fecha", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  async function bloqueioDaNoiva(leadId: string) {
    const vestido = await criarVestido(f);
    return criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(60),
      leadId,
    });
  }

  describe("V1 — a foto de celular atravessa o parser", () => {
    it("1,5 MB de foto entram (o teto anunciado é 2 MiB, e ele passa a valer)", async () => {
      const lead = await criarLead(f);
      const bloqueio = await bloqueioDaNoiva(lead.id);
      const foto = pngDe(1_500_000);
      // 1,5 MB de binário viram 2,0 MB de base64 — 20× o `express.json()`
      // global de 100 KB que a rota herdava.
      expect(foto.length).toBeGreaterThan(1_900_000);

      const criada = await agent
        .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
        .send({ descricao: "Barra rasgada, foto do celular", custoReparo: 480, fotoBase64: foto })
        .expect(201);
      expect(criada.body.temFoto).toBe(true);
    });

    it("acima de 2 MiB a resposta é o 422 que nomeia o teto, não um 413 mudo", async () => {
      const lead = await criarLead(f);
      const bloqueio = await bloqueioDaNoiva(lead.id);
      const res = await agent
        .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
        .send({ descricao: "Mancha", fotoBase64: pngDe(2 * 1024 * 1024 + 1) })
        .expect(422);
      expect(res.body.error).toBe("FOTO_MUITO_GRANDE");
    });
  });

  describe("V14 — o bloqueio sem noiva diz de quem é", () => {
    it("sem `leadId` próprio, o dono é a noiva da reserva-mãe", async () => {
      const lead = await criarLead(f);
      const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: dataFutura(90) });
      const vestido = await criarVestido(f);
      const bloqueio = await criarBloqueio(f, {
        vestidoId: vestido.id,
        tipo: "RESERVA_CASAMENTO",
        casamentoData: dataFutura(90),
        leadId: null,
        reservaId: reserva.id,
      });

      const res = await agent
        .get(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
        .expect(200);
      expect(res.body.leadId).toBeNull();
      // O servidor já cobra a avaria pelo dono derivado (V3/E163). A tela
      // precisa do MESMO dono para achar o contrato — sem isto ela não desenha
      // o botão em NENHUMA avaria montada assim. (S-C10: em 2026-07 eram 61 das
      // 63 do banco; hoje o banco tem zero avarias, e o mecanismo é o mesmo.)
      expect(res.body.donoLeadId).toBe(lead.id);
    });

    it("com noiva própria, o dono é ela — a reserva não sobrepõe", async () => {
      const noivaDoBloqueio = await criarLead(f);
      const bloqueio = await bloqueioDaNoiva(noivaDoBloqueio.id);
      const res = await agent
        .get(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
        .expect(200);
      expect(res.body.donoLeadId).toBe(noivaDoBloqueio.id);
    });

    it("manutenção sem reserva não tem dono nenhum", async () => {
      const vestido = await criarVestido(f);
      const bloqueio = await criarBloqueio(f, { vestidoId: vestido.id, tipo: "MANUTENCAO" });
      const res = await agent
        .get(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
        .expect(200);
      expect(res.body.donoLeadId ?? null).toBeNull();
    });
  });

  describe("V2 — o payload carrega o status da parcela", () => {
    it("cobrada, o status é PREVISTA; cancelado o contrato, vira CANCELADA", async () => {
      const lead = await criarLead(f);
      const bloqueio = await bloqueioDaNoiva(lead.id);
      const contrato = await criarContrato(f, {
        leadId: lead.id,
        valorTotal: 5000,
        fechadoEm: dataFutura(-5),
      });
      const avaria = await agent
        .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
        .send({ descricao: "Renda solta na cauda", custoReparo: 800 })
        .expect(201);

      const antes = await agent
        .get(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
        .expect(200);
      expect(antes.body[0].parcelaId ?? null).toBeNull();
      expect(antes.body[0].parcelaStatus ?? null).toBeNull();

      const cobrada = await agent
        .post(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}/cobrar`)
        .send({ contratoId: contrato.id })
        .expect(201);
      expect(cobrada.body.parcelaStatus).toBe("PREVISTA");

      const depois = await agent
        .get(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
        .expect(200);
      expect(depois.body[0].parcelaStatus).toBe("PREVISTA");

      await agent
        .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cancelar`)
        .send({ motivo: "Noiva desistiu" })
        .expect(200);

      const morta = await agent
        .get(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
        .expect(200);
      // O `parcelaId` continua preenchido — a tela lia SÓ isso e mostrava
      // "Cobrado — ver parcela" para sempre, escondendo recobrar e remover.
      expect(morta.body[0].parcelaId).toBe(cobrada.body.parcelaId);
      expect(morta.body[0].parcelaStatus).toBe("CANCELADA");
    });
  });
});
