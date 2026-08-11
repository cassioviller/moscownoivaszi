import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, pool, orcamentosTable, orcamentoVersoesTable, atendimentosTable, cabinesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E160 — o CAS do aceite entra na tranca, e o que a noiva viu é o que se grava.
 *
 * `aceite-orcamento.ts` tem 71 linhas e produziu 10 defeitos na revisão da
 * ótica dos papéis — a maior densidade de qualquer arquivo do repositório. O
 * motivo é estrutural: **é a única escrita de estado que acontece sem sessão,
 * feita pela pessoa que menos pode conferir o resultado.**
 *
 * A S-M22 escolheu `FOR UPDATE` + reconferência para serializar contra este
 * CAS e aplicou o padrão em dois lugares — mas o próprio CAS não participava
 * de tranca alguma, e as portas que escrevem a mesma linha (`/aprovar`,
 * `/recusar`, as três de item) tampouco.
 */
describe("E160 — o aceite e as portas que escrevem a mesma linha", () => {
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

  /** Um orçamento ENVIADO com versão congelada e link na mão da noiva. */
  async function orcamentoEnviado(valor = 5000) {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    const item = await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: valor });
    const link = await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`);
    expect(link.status).toBe(200);
    return { lead, orcamento, item, token: link.body.token as string };
  }

  // ─────────── C1 — o aceite e a decisão da loja na mesma linha ──────────────

  it("C1/A08.3 · a recusa em voo derruba o aceite: 422, e o RECUSADO não vira APROVADO", async () => {
    const { orcamento, token } = await orcamentoEnviado(12400);

    const cliente = await pool.connect();
    try {
      // A vendedora recusando a proposta de R$ 12.400,00 no mesmo segundo.
      await cliente.query("BEGIN");
      await cliente.query("UPDATE orcamentos SET status = 'RECUSADO' WHERE id = $1", [orcamento.id]);

      const respostaP = Promise.resolve(agent.post(`/api/orcamentos/publico/aceite?token=${token}`));
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 200. O CAS guardava só `isNull(aceitoEm)` e gravava
       * APROVADO incondicionalmente — o orçamento recusado às 14:00:00 voltava
       * a APROVADO às 14:00:00,2 pelo aceite que leu o pool às 13:59:59,8.
       * RECUSADO é terminal, a vendedora lê "recusado" na tela, e o
       * `POST /contratos` fecha os R$ 12.400,00 sobre a proposta que a loja
       * negou.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(422);
      expect(resposta.body.error).toBe("NAO_ENVIADO");
    } finally {
      cliente.release();
    }

    const [depois] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, orcamento.id));
    expect(depois.status).toBe("RECUSADO");
    expect(depois.aceitoEm).toBeNull();
  });

  it("C1/A08.3 · e o espelho: o aceite em voo derruba a recusa — o comprovante não fica num RECUSADO", async () => {
    const { orcamento } = await orcamentoEnviado(12400);

    const cliente = await pool.connect();
    try {
      // A noiva aceitando no mesmo segundo em que a loja recusa.
      await cliente.query("BEGIN");
      await cliente.query(
        "UPDATE orcamentos SET status = 'APROVADO', aceito_em = now(), aprovado_em = now() WHERE id = $1",
        [orcamento.id],
      );

      const respostaP = Promise.resolve(
        agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/recusar`),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 204. O `/recusar` escrevia sem condição de status —
       * o orçamento ficava RECUSADO carregando o comprovante do aceite, com o
       * badge "Aceito pela noiva" em `orcamentos/[id].tsx:757`.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(422);
      expect(resposta.body.error).toBe("TRANSICAO_INVALIDA");
    } finally {
      cliente.release();
    }

    const [depois] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, orcamento.id));
    expect(depois.status).toBe("APROVADO");
    expect(depois.aceitoEm).not.toBeNull();
  });

  // ─────────── C4 — as três portas de item e o beco permanente ───────────────

  it("C4 · o item que chega no instante do aceite é recusado: o beco permanente não se forma", async () => {
    const { orcamento, token } = await orcamentoEnviado(5000);

    const cliente = await pool.connect();
    try {
      // O aceite da noiva commitando no meio do POST de item.
      await cliente.query("BEGIN");
      await cliente.query(
        `UPDATE orcamentos SET status = 'APROVADO', aceito_em = now(), aprovado_em = now(),
           aceite_versao = 1, aceite_hash = (SELECT hash FROM orcamento_versoes WHERE orcamento_id = $1 LIMIT 1)
         WHERE id = $1`,
        [orcamento.id],
      );

      const respostaP = Promise.resolve(
        agent
          .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
          .send({ tipo: "ACESSORIO", descricao: "Véu", valorUnitario: 1500, quantidade: 1 }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 201. O aceite gravava o hash de R$ 5.000,00 às
       * 14:02:00 e o véu de R$ 1.500,00 entrava às 14:02:00,1. O vivo virava
       * R$ 6.500,00 e o orçamento entrava em **beco permanente**: 422 para
       * sempre no contrato (o hash não bate) e 422 nas três portas de item
       * (APROVADO congela). Só refazendo tudo e pedindo novo aceite.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(422);
      expect(resposta.body.error).toBe("ORCAMENTO_APROVADO");
    } finally {
      cliente.release();
    }

    // E a prova de que o beco NÃO se formou: o contrato fecha pelo valor
    // aceito. Antes, as duas metades do beco eram provadas em separado no
    // `e115-orcamento-aceite`; aqui elas ficam encadeadas.
    const [comAceite] = await db
      .select()
      .from(orcamentosTable)
      .where(eq(orcamentosTable.id, orcamento.id));
    expect(comAceite.aceiteHash).not.toBeNull();
    const contrato = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: comAceite.leadId,
      vendedoraId: f.vendedoraId,
      valorTotal: 5000,
      orcamentoId: orcamento.id,
    });
    expect(contrato.status).toBe(201);
  });

  it("C4 · o DELETE de item no instante do aceite também é recusado", async () => {
    const { orcamento, item, token } = await orcamentoEnviado(5000);
    void token;

    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query(
        "UPDATE orcamentos SET status = 'APROVADO', aceito_em = now(), aprovado_em = now() WHERE id = $1",
        [orcamento.id],
      );

      const respostaP = Promise.resolve(
        agent.delete(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      // VERMELHO ANTES: 204 — o item que a noiva acabou de aceitar sumia.
      const resposta = await respostaP;
      expect(resposta.status).toBe(422);
    } finally {
      cliente.release();
    }
  });

  // ─────────── O2 — a tranca que não cobria o campo que decide o estado ──────

  it("O2 · o PATCH não grava status por cima do que a tranca acabou de ler", async () => {
    const { orcamento } = await orcamentoEnviado(5000);

    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query(
        "UPDATE orcamentos SET status = 'APROVADO', aceito_em = now(), aprovado_em = now() WHERE id = $1",
        [orcamento.id],
      );

      // Um PATCH que NÃO mexe no desconto — é exatamente o caso que escapava:
      // a reconferência sob FOR UPDATE só decidia `mexeNoDesconto`.
      const respostaP = Promise.resolve(
        agent.patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`).send({ status: "RECUSADO" }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 200. O `.set({...parsed.data})` gravava o `status` do
       * corpo por cima do que a tranca tinha lido. O achado A08.3 afirmava que
       * "o PATCH ao lado tem FOR UPDATE + reconferência desde a S-M22": tem a
       * tranca, e ela não cobria o campo que decide o estado.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(422);
      expect(resposta.body.error).toBe("TRANSICAO_INVALIDA");
    } finally {
      cliente.release();
    }

    const [depois] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, orcamento.id));
    expect(depois.status).toBe("APROVADO");
  });

  // ─────────── C3/O4 — o carimbo inventado ──────────────────────────────────

  it("C3/O4 · orçamento apagado na janela devolve 404, e não um `aceitoEm` que não existe", async () => {
    const { orcamento, token } = await orcamentoEnviado(5000);

    const cliente = await pool.connect();
    try {
      // Um ENVIADO se apaga. A linha some entre a leitura da rota e a escrita.
      await cliente.query("BEGIN");
      await cliente.query("DELETE FROM orcamentos WHERE id = $1", [orcamento.id]);

      const respostaP = Promise.resolve(agent.post(`/api/orcamentos/publico/aceite?token=${token}`));
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 200 com um `aceitoEm` INVENTADO. O
       * `jaAceito?.aceitoEm ?? agora` não distinguia "outro já aceitou" de "a
       * linha não existe mais": o UPDATE casava zero linhas, a auditoria não
       * rodava, e a noiva lia "Aceito em 11/08/2026 14:02" enquanto o ateliê
       * não tinha registro nenhum.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(404);
      expect(resposta.body.aceitoEm).toBeUndefined();
    } finally {
      cliente.release();
    }
  });

  // ─────────── C2 — a versão que ela viu ────────────────────────────────────

  it("C2 · aceitar com a versão que a página mostrava: a versão nova barra com 409", async () => {
    const { orcamento, token } = await orcamentoEnviado(5000);

    /**
     * A versão 2 é inserida à mão de propósito, e a razão está no relatório:
     * **nenhuma rota cria uma segunda versão hoje.** `criarVersaoEnviada` só
     * roda ao ENTRAR em ENVIADO, e a máquina de estados não permite voltar de
     * ENVIADO para RASCUNHO — então o cenário medido do C2 ("a versão 2
     * nascida no meio") descreve um mecanismo correto sobre um gatilho que
     * ainda não existe. A guarda entra agora porque o E166 vai abrir o
     * reenvio, e aí ela precisa já estar de pé.
     */
    await db.insert(orcamentoVersoesTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      orcamentoId: orcamento.id,
      numero: 2,
      itens: [],
      totalBruto: 5500,
      totalLiquido: 5500,
      hash: "hash-da-versao-2",
    });

    // A aba antiga da noiva ainda mostra a versão 1.
    const resposta = await agent.post(`/api/orcamentos/publico/aceite?token=${token}&versao=1`);
    expect(resposta.status).toBe(409);
    expect(resposta.body.error).toBe("PROPOSTA_MUDOU");

    const [depois] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, orcamento.id));
    expect(depois.aceitoEm).toBeNull();

    // Recarregada a página, ela aceita a versão que está vendo.
    const segunda = await agent.post(`/api/orcamentos/publico/aceite?token=${token}&versao=2`);
    expect(segunda.status).toBe(200);
    const [aceito] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, orcamento.id));
    expect(aceito.aceiteVersao).toBe(2);
    expect(aceito.aceiteHash).toBe("hash-da-versao-2");
  });

  // ─────────── C8 — o retorno que escondia se gravou ────────────────────────

  it("C8 · o segundo clique devolve o MESMO carimbo, lido sob a tranca", async () => {
    const { token } = await orcamentoEnviado(5000);

    const primeira = await agent.post(`/api/orcamentos/publico/aceite?token=${token}`);
    expect(primeira.status).toBe(200);
    const segunda = await agent.post(`/api/orcamentos/publico/aceite?token=${token}`);
    expect(segunda.status).toBe(200);
    expect(segunda.body.aceitoEm).toBe(primeira.body.aceitoEm);
  });

  // ─────────── O3 — a sexta FK de corpo sem prova ───────────────────────────

  it("O3 · `atendimentoId` de outra loja é 422, e não um carimbo cruzando a fronteira", async () => {
    const outra = await criarFixture();
    try {
      const leadDeOutra = await criarLead(outra);
      const [cabineDeOutra] = await db
        .insert(cabinesTable)
        .values({ id: randomUUID(), lojaId: outra.lojaId, nome: "Cabine da outra loja" })
        .returning();
      const [atendimentoDeOutra] = await db
        .insert(atendimentosTable)
        .values({
          id: randomUUID(),
          lojaId: outra.lojaId,
          leadId: leadDeOutra.id,
          cabineId: cabineDeOutra.id,
          vendedoraId: outra.vendedoraId,
          inicio: new Date(),
        })
        .returning();

      const lead = await criarLead(f);
      /**
       * VERMELHO ANTES: 201. O `atendimentoId` entrava pelo spread sem prova
       * de loja — era a sexta FK de corpo do módulo sem conferência, e a
       * função que faltava (`atendimentoNaLoja`) já existia desde o E115.
       */
      const resposta = await agent
        .post(`/api/lojas/${f.lojaId}/orcamentos`)
        .send({ leadId: lead.id, atendimentoId: atendimentoDeOutra.id });
      expect(resposta.status).toBe(422);
      expect(resposta.body.error).toBe("REFERENCIA_INVALIDA");
    } finally {
      await limparFixture(outra);
    }
  });
});
