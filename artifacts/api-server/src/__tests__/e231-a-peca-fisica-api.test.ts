import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, bloqueioVestidosTable, contratoBloqueiosTable, contratosTable, parcelasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { derrubarFilaDeAtrasos } from "../lib/fila-de-atrasos-cache";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **E231 — a peça física: os restos do E225** (Bloco 3 da proposta de 14/08).
 *
 * - **S-C115** — desfazer a retirada com o atraso JÁ COBRADO deixava a parcela
 *   órfã: `pecasAtrasadasDoContrato` para de contar, a prévia diz
 *   `devida: false` **e `jaCobrada: true`**, e a ficha mostra "Cobrado" sobre
 *   uma conta que ela mesma diz não existir — com o dinheiro vivo no carnê.
 * - **S-C114** — o `semContrato` dizia a MESMA frase para "nunca teve
 *   contrato" (gesto de balcão) e "o contrato caiu com a peça na rua" (venda
 *   desfeita, possivelmente com atraso já cobrado num carnê morto). A ação
 *   certa é diferente, e a fila passa a dizer qual é o caso.
 * - **S-C121** — a ficha prometia uma retirada que JÁ ACONTECEU: as linhas
 *   saem do combinado (`contratos.dataRetirada`) e a peça que saiu tem
 *   `bloqueio.retiradaDataReal` — o portal da noiva mostrava a real e a ficha
 *   da LOJA não. O recorte do E229 aprende as duas reais.
 */
describe("E231 — a peça física", () => {
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

  const diasReais = (n: number) => new Date(Date.now() + n * 86_400_000);

  /** Contrato ATIVO preso a um bloqueio com retirada real e casamento passado. */
  async function pecaNaRua(opts: { cancelado?: boolean } = {}) {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      leadId: lead.id,
      casamentoData: diasReais(-10),
      retiradaDataReal: diasReais(-12),
    });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 3000,
      fechadoEm: diasReais(-30),
      canceladoEm: opts.cancelado ? diasReais(-1) : null,
    });
    await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });
    return { lead, vestido, bloqueio, contrato };
  }

  /** A parcela do atraso, cobrada e viva, presa ao contrato. */
  async function atrasoCobrado(contratoId: string) {
    const parcelaId = randomUUID();
    await db.insert(parcelasTable).values({
      id: parcelaId,
      lojaId: f.lojaId,
      contratoId,
      numero: 90,
      origem: "ATRASO_DEVOLUCAO",
      descricao: "Atraso na devolução (cláusula 16ª)",
      valorPrevisto: 750,
      vencimento: diasReais(7),
      status: "PREVISTA",
    });
    await db.update(contratosTable).set({ atrasoParcelaId: parcelaId }).where(eq(contratosTable.id, contratoId));
    return parcelaId;
  }

  describe("S-C115 — desfazer a retirada não deixa o atraso cobrado órfão", () => {
    it("com a parcela do atraso VIVA, desfazer leva 422 e diz a saída", async () => {
      const { bloqueio, contrato } = await pecaNaRua();
      await atrasoCobrado(contrato.id);

      const r = await agent
        .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
        .send({ retiradaDataReal: null });

      expect(r.status, JSON.stringify(r.body)).toBe(422);
      expect(r.body.error).toBe("ATRASO_JA_COBRADO");
      // A saída na frase: a parcela primeiro, o desfazer depois.
      expect(r.body.detalhe).toMatch(/estorn|cancel/i);
    });

    it("com a parcela do atraso CANCELADA, desfazer volta a ser legítimo", async () => {
      const { bloqueio, contrato } = await pecaNaRua();
      const parcelaId = await atrasoCobrado(contrato.id);
      await db.update(parcelasTable).set({ status: "CANCELADA" }).where(eq(parcelasTable.id, parcelaId));

      await agent
        .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
        .send({ retiradaDataReal: null })
        .expect(200);
    });

    it("sem atraso cobrado, desfazer segue como sempre — a guarda não vira parede", async () => {
      const { bloqueio } = await pecaNaRua();

      await agent
        .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
        .send({ retiradaDataReal: null })
        .expect(200);
    });
  });

  describe("S-C114 — a fila distingue 'nunca teve contrato' de 'o contrato caiu'", () => {
    // S-C89: fixture direta não passa por porta — cada leitura da fila parte
    // de cache frio (a régua do cache é o s-c89-cache-da-fila-api.test.ts).
    const fila = () => {
      derrubarFilaDeAtrasos();
      return agent.get(`/api/lojas/${f.lojaId}/contratos-com-atraso`);
    };

    it("a peça do contrato CANCELADO chega com o id dele — a venda desfeita tem endereço", async () => {
      const { bloqueio, contrato } = await pecaNaRua({ cancelado: true });

      const r = await fila().expect(200);
      const orfa = (r.body.semContrato as { bloqueioId: string; contratoCanceladoId?: string | null }[]).find(
        (o) => o.bloqueioId === bloqueio.id,
      );

      expect(orfa, "a órfã nem veio na fila").toBeDefined();
      expect(orfa!.contratoCanceladoId).toBe(contrato.id);
    });

    it("a peça que NUNCA teve contrato vem com null — e a chave existe", async () => {
      const lead = await criarLead(f);
      const vestido = await criarVestido(f);
      const bloqueio = await criarBloqueio(f, {
        vestidoId: vestido.id,
        tipo: "RESERVA_CASAMENTO",
        leadId: lead.id,
        casamentoData: diasReais(-10),
        retiradaDataReal: diasReais(-12),
      });

      const r = await fila().expect(200);
      const orfa = (r.body.semContrato as { bloqueioId: string }[]).find(
        (o) => o.bloqueioId === bloqueio.id,
      );

      expect(orfa, "a órfã nem veio na fila").toBeDefined();
      expect(orfa!).toHaveProperty("contratoCanceladoId");
      expect((orfa as unknown as { contratoCanceladoId: string | null }).contratoCanceladoId).toBeNull();
    });
  });

  describe("S-C121 — o recorte da locação aprende as datas REAIS", () => {
    it("com a peça na rua, a locação traz a retirada FEITA — a ficha para de prometer o que já aconteceu", async () => {
      const { lead, contrato } = await pecaNaRua();
      await db
        .update(contratosTable)
        .set({ dataRetirada: diasReais(-12), dataDevolucao: diasReais(-8) })
        .where(eq(contratosTable.id, contrato.id));

      const r = await agent.get(`/api/lojas/${f.lojaId}/leads/${lead.id}/locacao`).expect(200);

      expect(r.body.retiradaFeitaEm).toBeTruthy();
      expect(r.body.devolucaoFeitaEm ?? null).toBeNull();
      // A fronteira do E229, atualizada COM decisão: datas reais não são
      // dinheiro, e são exatamente o que quem atende o telefone precisa para
      // não prometer uma retirada que já aconteceu.
      expect(Object.keys(r.body).sort()).toEqual([
        "contratoId",
        "devolucao",
        "devolucaoFeitaEm",
        "retirada",
        "retiradaFeitaEm",
      ]);
    });
  });
});
