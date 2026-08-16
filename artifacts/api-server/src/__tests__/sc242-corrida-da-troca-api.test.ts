import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, pool, bloqueioVestidosTable, contratoBloqueiosTable, contratoItensTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { relogio } from "../lib/relogio";
import { diaDaSemana, diaLocal } from "@workspace/financeiro-core";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **S-C242 — a corrida da troca, e ela encontrou defeito.**
 *
 * A sobra dizia: *"a disciplina de tranca está lá (contrato → bloqueio →
 * vestido), mas nenhuma corrida determinística a exercita"*. A disciplina está
 * mesmo lá, e **não é ela que falta**: falta a régua repetir, DENTRO da
 * transação, a condição que foi lida FORA dela.
 *
 * O caminho, medido:
 *
 * 1. o handler lê `contrato_bloqueios` **no pool** para provar que a reserva é
 *    deste contrato (`contratos.ts:2152`, o 422 `RESERVA_NAO_E_DESTE_CONTRATO`);
 * 2. a transação tranca o contrato, tranca a reserva antiga e confere duas
 *    coisas: que ela existe e que **não saiu** (`retiradaDataReal`);
 * 3. **não confere que o vínculo ainda existe**, nem que a reserva antiga
 *    ainda está viva.
 *
 * Duas trocas do mesmo contrato no mesmo segundo passam as duas pelo passo 1.
 * A primeira roda inteira: cria a reserva B, cancela a antiga, apaga o vínculo
 * antigo e grava o novo. A segunda entra em seguida, encontra a reserva antiga
 * já cancelada — e **nada olha para isso** —, cria a reserva C, tenta apagar um
 * vínculo que já não existe (no-op silencioso) e grava o SEU vínculo.
 *
 * **O contrato termina com DUAS reservas vivas e dois vestidos presos**, de um
 * gesto que era para trocar uma peça por outra. E o snapshot do item diz um só:
 * o segundo `UPDATE contrato_itens ... WHERE vestido_id = <antigo>` não acha
 * linha nenhuma, porque a primeira troca já reescreveu aquela linha.
 *
 * É a **K8 do PATCH** (*a condição do `where` repete o estado LIDO*) e a
 * **S-O31 do `POST /link`** (*o status é lido no pool e dois cliques congelam
 * duas versões*) — a mesma classe, terceira vez nesta trilha.
 */
describe("S-C242 — duas trocas simultâneas do mesmo contrato", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    // A 17ª §1º veda sexta e sábado; a cena é sobre a CORRIDA (S-O119).
    let quarta = new Date();
    while (diaDaSemana(diaLocal(quarta)) !== 3) quarta = new Date(quarta.getTime() + 86_400_000);
    vi.spyOn(relogio, "agora").mockReturnValue(quarta);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await limparFixture(f);
    await fecharPool();
  });

  async function vendaFechada() {
    const lead = await criarLead(f);
    const vestidoA = await criarVestido(f);
    const bloqueioA = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestidoA.id,
      leadId: lead.id,
      casamentoData: dataFutura(90),
    });
    const orcamento = await criarOrcamento(f, { leadId: lead.id });
    await criarOrcamentoItem(f, {
      orcamentoId: orcamento.id,
      tipo: "VESTIDO",
      descricao: vestidoA.nome,
      valorUnitario: 5000,
      vestidoId: vestidoA.id,
    });
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        orcamentoId: orcamento.id,
        valorTotal: 5000,
        bloqueioVestidoIds: [bloqueioA.id],
      })
      .expect(201);
    return { lead, vestidoA, bloqueioA, contratoId: criado.body.id as string };
  }

  it("a segunda troca não prende uma SEGUNDA peça — o contrato fica com uma reserva viva", async () => {
    const { bloqueioA, contratoId } = await vendaFechada();
    const vestidoB = await criarVestido(f, { precoBase: 7000 });
    const vestidoC = await criarVestido(f, { precoBase: 9000 });

    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      // A barreira: a linha do contrato fica trancada, e as duas trocas param
      // no primeiro degrau da disciplina (contrato → bloqueio → vestido). É o
      // que torna a corrida DETERMINÍSTICA — as duas já passaram pela leitura
      // do pool quando a barreira cai.
      await cliente.query("SELECT id FROM contratos WHERE id = $1 FOR UPDATE", [contratoId]);

      // O `Test` do supertest é LAZY (S33): o `Promise.resolve` dispara agora.
      const primeira = Promise.resolve(
        agent
          .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
          .send({ bloqueioId: bloqueioA.id, vestidoNovoId: vestidoB.id }),
      );
      const segunda = Promise.resolve(
        agent
          .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
          .send({ bloqueioId: bloqueioA.id, vestidoNovoId: vestidoC.id }),
      );
      // E247 (G8): a prova de que as duas ESPERARAM — nenhuma respondeu antes do commit.
      let chegouPrimeira = false, chegouSegunda = false;
      void primeira.then(() => { chegouPrimeira = true; }, () => { chegouPrimeira = true; });
      void segunda.then(() => { chegouSegunda = true; }, () => { chegouSegunda = true; });
      await new Promise((r) => setTimeout(r, 400));
      expect([chegouPrimeira, chegouSegunda], "uma troca respondeu ANTES do commit — não esperou a tranca").toEqual([false, false]);
      await cliente.query("COMMIT");

      const respostas = await Promise.all([primeira, segunda]);
      const vitorias = respostas.filter((r) => r.status === 200);
      const recusas = respostas.filter((r) => r.status !== 200);

      // Uma troca acontece; a outra tem de ser RECUSADA, e recusada dizendo o
      // motivo certo — a reserva de que ela partia já não é deste contrato.
      expect(vitorias.length, "as duas trocas venceram — o contrato prendeu duas peças").toBe(1);
      expect(recusas[0]!.status).toBe(422);
      expect(recusas[0]!.body.error).toBe("RESERVA_NAO_E_DESTE_CONTRATO");
    } finally {
      cliente.release();
    }

    // O invariante, medido no banco e não na resposta: UMA reserva viva presa
    // ao contrato, e o snapshot do item apontando exatamente essa peça.
    const vinculos = await db
      .select({ bloqueioId: contratoBloqueiosTable.bloqueioId })
      .from(contratoBloqueiosTable)
      .innerJoin(
        bloqueioVestidosTable,
        eq(bloqueioVestidosTable.id, contratoBloqueiosTable.bloqueioId),
      )
      .where(and(
        eq(contratoBloqueiosTable.contratoId, contratoId),
        isNull(bloqueioVestidosTable.canceladoEm),
      ));
    expect(vinculos.length, "o contrato ficou com mais de uma reserva viva").toBe(1);

    const itens = await db
      .select({ vestidoId: contratoItensTable.vestidoId })
      .from(contratoItensTable)
      .where(eq(contratoItensTable.contratoId, contratoId));
    const [viva] = await db
      .select({ vestidoId: bloqueioVestidosTable.vestidoId })
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, vinculos[0]!.bloqueioId));
    expect(itens.map((i) => i.vestidoId)).toEqual([viva!.vestidoId]);
  });
});
