import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogTable,
  contratoBloqueiosTable,
  contratoItensTable,
  contratosTable,
  db,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";
import { janelasDoBloqueio, REGRA_DEFAULT } from "../lib/disponibilidade";
import { derrubarFilaDeAtrasos } from "../lib/fila-de-atrasos-cache";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarRegraDisponibilidade,
  criarReserva,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **E249 — a data que o papel imprime segue o casamento, e todo mundo lê a
 * mesma data.**
 *
 * Fecha três achados do `/code-review max` de 16/08, e os três são a mesma
 * frase vista de três lugares: **desde o E244, `contratos.data_devolucao` é a
 * régua da 16ª** — e o repositório inteiro ainda tratava a janela de uso como
 * se fosse.
 *
 * - **S-R2 🔴** — `PATCH /reservas/:id` adiava o casamento e deixava a data do
 *   papel onde estava. O E211/S-O4 já propagava `dataCasamento` para o contrato
 *   ATIVO, porque é ela que o PDF assinado e o portal mostram; a `dataDevolucao`
 *   ficava para trás, e é ELA que decide se a noiva deve dinheiro.
 * - **S-R3 🟠** — `lib/disponibilidade.ts` era o QUARTO sítio da 16ª, e o
 *   relatório do E244 diz "uma função nos três sítios". A tela pintava
 *   `ATRASO_DEVOLUCAO` no dia em que a porta respondia 422 `SEM_ATRASO`.
 * - **S-R12 🟡** — `PATCH /contratos/:id` é a única porta que EDITA a data do
 *   papel, e era a única de `contratos.ts` que não derrubava a fila de atrasos
 *   (S-C89): corrigida a data, a fila e o sino seguiam cobrando por 5 minutos.
 *
 * **A régua da loja desta fixture abre TODOS os dias** (`retiradaDias` de 0 a
 * 6). Não é conveniência: as cenas de dinheiro precisam que o dia do papel seja
 * `casamento + usoDiasDepois` exatamente, sem o passo do E224 que anda até dia
 * de expediente — senão o número do teste dependeria do dia da semana em que
 * ele roda. O passo do E224 é pregado à parte, com datas literais, no
 * `describe` da 4ª.
 */
describe("E249 — o papel segue o casamento", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await criarRegraDisponibilidade(f, { retiradaDias: [0, 1, 2, 3, 4, 5, 6] });
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Um dia de negócio N dias atrás de hoje, como instante ancorado. */
  const diasAtras = (n: number) => ancoraDeNegocio(addDias(hojeLocal(), -n));

  const diaDo = (d: Date | string | null | undefined) =>
    d ? new Date(d).toISOString().slice(0, 10) : null;

  /** A hora local (SP) de um instante, `"HH:MM"` — é ela que a 5ª decide. */
  const horaDe = (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : null;

  const contratoDe = async (id: string) =>
    (await db.select().from(contratosTable).where(eq(contratosTable.id, id)))[0]!;

  /**
   * Uma noiva com UMA reserva, N peças presas a ela e um contrato ATIVO com as
   * duas datas do papel.
   *
   * As N peças dividem a MESMA reserva de propósito: é o gesto real (a noiva
   * escolheu vestido, véu e bolero para o mesmo casamento) e é o que faz o
   * `PATCH /reservas` mover todas de uma vez.
   */
  async function noivaComPapel(params: {
    pecas: { aluguel: number; retiradoHaDias?: number | null; devolvidoHaDias?: number | null }[];
    casamento: Date;
    dataRetirada?: Date | null;
    dataDevolucao?: Date | null;
  }) {
    const lead = await criarLead(f);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: params.casamento });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: params.pecas.reduce((s, p) => s + p.aluguel, 0),
      dataCasamento: params.casamento,
      dataRetirada: params.dataRetirada ?? null,
      dataDevolucao: params.dataDevolucao ?? null,
      fechadoEm: new Date(),
    });
    for (const p of params.pecas) {
      const vestido = await criarVestido(f);
      const bloqueio = await criarBloqueio(f, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: vestido.id,
        leadId: lead.id,
        reservaId: reserva.id,
        casamentoData: params.casamento,
        retiradaDataReal:
          p.retiradoHaDias === null || p.retiradoHaDias === undefined ? null : diasAtras(p.retiradoHaDias),
        devolucaoDataReal:
          p.devolvidoHaDias === null || p.devolvidoHaDias === undefined ? null : diasAtras(p.devolvidoHaDias),
      });
      await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });
      await db.insert(contratoItensTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        tipo: "VESTIDO",
        vestidoId: vestido.id,
        descricao: vestido.nome,
        valorUnitario: p.aluguel,
        quantidade: 1,
      });
    }
    return { lead, reserva, contrato };
  }

  const adiarPara = (reservaId: string, quando: Date) =>
    agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reservaId}`)
      .send({ casamentoData: quando.toISOString() });

  // ─────────────────────────── S-R2 🔴 ───────────────────────────

  describe("S-R2 🔴 — adiar o casamento move as duas datas do papel", () => {
    /**
     * **A cena inteira, com o número.**
     *
     * Casamento há 100 dias, papel dando a devolução há 98 (janela `+2`, loja
     * aberta todo dia). A noiva adia para há 3 dias; a peça volta há 1 dia —
     * **em dia** pela janela nova, que termina há 1.
     *
     * Com a data do papel parada em "há 98": `diasDeAtraso` = 97, e 97 ≥ 10 é
     * EXTRAVIO pelo caput da 16ª. Antes do E244, a mesma cena dava R$ 0,00: o
     * defeito nasceu do épico do dia anterior.
     *
     * **E uma correção ao diagnóstico** (regra 20 — a sobra se confere antes de
     * consertar). A S-R2 escreveu *"4 × R$ 3.000,00 = R$ 12.000,00"*, que se lê
     * como quatro peças de R$ 3.000,00. O caput multiplica **por peça** — *"o
     * LOCATÁRIO pagará quatro vezes o valor do aluguel de cada peça"* —, então
     * R$ 12.000,00 é o número de UMA peça de R$ 3.000,00. Esta cena tem quatro,
     * e o vermelho medido é **R$ 48.000,00**: a sobra subestimava o dano por
     * fator 4.
     */
    it("R$ 48.000,00 de EXTRAVIO sobre quem devolveu em dia — a cena que abriu o achado", async () => {
      const { reserva, contrato } = await noivaComPapel({
        casamento: diasAtras(100),
        dataDevolucao: diasAtras(98),
        dataRetirada: diasAtras(103),
        pecas: Array.from({ length: 4 }, () => ({
          aluguel: 3000,
          retiradoHaDias: 103,
          devolvidoHaDias: 1,
        })),
      });

      await adiarPara(reserva.id, diasAtras(3)).expect(200);

      const c = await contratoDe(contrato.id);
      expect(diaDo(c.dataDevolucao), "o papel tem de andar com o casamento").toBe(
        addDias(hojeLocal(), -1),
      );

      const previa = await agent
        .get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cobranca-de-atraso`)
        .expect(200);
      expect(previa.body.valor).toBe(0);
      expect(previa.body.devida, "devolveu no dia que o papel novo manda").toBe(false);
      expect(previa.body.linhas).toHaveLength(0);

      await agent
        .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cobranca-de-atraso`)
        .send({})
        .expect(422)
        .expect((r) => expect(r.body.error).toBe("SEM_ATRASO"));
    });

    it("a retirada anda junto — é a mesma cláusula, o mesmo papel e o mesmo gesto", async () => {
      const { reserva, contrato } = await noivaComPapel({
        casamento: diasAtras(100),
        dataRetirada: diasAtras(103),
        dataDevolucao: diasAtras(98),
        pecas: [{ aluguel: 3000 }],
      });

      await adiarPara(reserva.id, diasAtras(3)).expect(200);

      const c = await contratoDe(contrato.id);
      expect(diaDo(c.dataRetirada), "buscar a peça 100 dias antes do casamento novo não é um prazo").toBe(
        addDias(hojeLocal(), -6),
      );
    });

    it("a HORA combinada é preservada: mudar a data não desfaz o horário que alguém marcou", async () => {
      const dezesseisHoras = new Date(`${addDias(hojeLocal(), -98)}T16:00:00-03:00`);
      const { reserva, contrato } = await noivaComPapel({
        casamento: diasAtras(100),
        dataRetirada: diasAtras(103),
        dataDevolucao: dezesseisHoras,
        pecas: [{ aluguel: 3000 }],
      });

      await adiarPara(reserva.id, diasAtras(3)).expect(200);

      const c = await contratoDe(contrato.id);
      expect(horaDe(c.dataDevolucao), "a 5ª dá 18:00 como padrão, não como regra").toBe("16:00");
    });

    it("campo vazio continua vazio — o papel que não foi impresso não nasce da mudança de data", async () => {
      const { reserva, contrato } = await noivaComPapel({
        casamento: diasAtras(100),
        pecas: [{ aluguel: 3000 }],
      });

      await adiarPara(reserva.id, diasAtras(3)).expect(200);

      const c = await contratoDe(contrato.id);
      expect(c.dataRetirada).toBeNull();
      expect(c.dataDevolucao).toBeNull();
    });

    it("contrato CANCELADO não tem papel a mover — é história, e história assinada", async () => {
      const { reserva, contrato } = await noivaComPapel({
        casamento: diasAtras(100),
        dataRetirada: diasAtras(103),
        dataDevolucao: diasAtras(98),
        pecas: [{ aluguel: 3000 }],
      });
      await db
        .update(contratosTable)
        .set({ status: "CANCELADO", canceladoEm: new Date() })
        .where(eq(contratosTable.id, contrato.id));

      await adiarPara(reserva.id, diasAtras(3)).expect(200);

      const c = await contratoDe(contrato.id);
      expect(diaDo(c.dataDevolucao)).toBe(addDias(hojeLocal(), -98));
    });

    it("a trilha diz para ONDE o papel foi, não só que ele mudou", async () => {
      const { reserva, contrato } = await noivaComPapel({
        casamento: diasAtras(100),
        dataRetirada: diasAtras(103),
        dataDevolucao: diasAtras(98),
        pecas: [{ aluguel: 3000 }],
      });

      await adiarPara(reserva.id, diasAtras(3)).expect(200);

      const [linha] = await db
        .select()
        .from(auditLogTable)
        .where(
          and(
            eq(auditLogTable.entidadeId, reserva.id),
            eq(auditLogTable.acao, "CONTRATO_DATA_SEGUIU_RESERVA"),
          ),
        )
        .orderBy(desc(auditLogTable.criadoEm))
        .limit(1);

      const detalhe = linha?.detalhe as { papel?: { contratoId: string; devolucao: string | null }[] };
      expect(detalhe?.papel, "mover a régua da cobrança sem dizer para onde é a classe que o E94 fechou").toHaveLength(1);
      expect(detalhe!.papel![0]!.contratoId).toBe(contrato.id);
      expect(diaDo(detalhe!.papel![0]!.devolucao)).toBe(addDias(hojeLocal(), -1));
    });
  });

  // ─────────────────── S-R2, o passo da 4ª (E224) ────────────────────

  /**
   * O passo que a loja de todo dia esconde: **a data nova anda até um dia de
   * expediente**, para a frente, como o E224 mandou.
   *
   * Datas literais e uma loja com o expediente do papel (terça a sábado). Base
   * das fixtures: quarta 15/09/2027.
   */
  describe("S-R2 — e o dia novo anda até dia de expediente (a 4ª)", () => {
    let g: Fixture;
    let agentG: Awaited<ReturnType<typeof loginComLoja>>;

    beforeAll(async () => {
      g = await criarFixture();
      agentG = await loginComLoja(g.vendedoraEmail, g.lojaId);
    });

    afterAll(async () => {
      await limparFixture(g);
    });

    async function casamentoEm(quando: Date, papel: { retirada?: Date | null; devolucao?: Date | null }) {
      const lead = await criarLead(g);
      const reserva = await criarReserva(g, { leadId: lead.id, casamentoData: quando });
      const vestido = await criarVestido(g);
      const contrato = await criarContrato(g, {
        leadId: lead.id,
        valorTotal: 5000,
        dataCasamento: quando,
        dataRetirada: papel.retirada ?? null,
        dataDevolucao: papel.devolucao ?? null,
        fechadoEm: new Date(),
      });
      const bloqueio = await criarBloqueio(g, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: vestido.id,
        leadId: lead.id,
        reservaId: reserva.id,
        casamentoData: quando,
      });
      await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });
      return { reserva, contrato };
    }

    it("sábado 18/09 adiado para sábado 18/12: a devolução cai na segunda, que fecha, e vira terça 21/12", async () => {
      // Janela do casamento novo: [qua 15/12, seg 20/12]. A 4ª fecha domingo e
      // segunda → retirada 15/12 (quarta, aberta), devolução 21/12 (terça).
      const { reserva, contrato } = await casamentoEm(dataFutura(3), {
        retirada: new Date("2027-09-15T10:30:00-03:00"),
        devolucao: new Date("2027-09-21T18:00:00-03:00"),
      });

      await agentG
        .patch(`/api/lojas/${g.lojaId}/reservas/${reserva.id}`)
        .send({ casamentoData: dataFutura(94).toISOString() })
        .expect(200);

      const [c] = await db.select().from(contratosTable).where(eq(contratosTable.id, contrato.id));
      expect(diaDo(c?.dataRetirada)).toBe("2027-12-15");
      expect(diaDo(c?.dataDevolucao)).toBe("2027-12-21");
      expect(horaDe(c?.dataDevolucao)).toBe("18:00");
    });

    it("a hora cede à 4ª, e só a ela: 18:30 de terça vira sábado, que fecha às 18:00, e volta ao padrão da 5ª", async () => {
      // Casamento sexta 17/09 → retirada terça 14/09, que fecha às 19:00.
      // Adiado para terça 21/12 → retirada sábado 18/12, que fecha às 18:00.
      const { reserva, contrato } = await casamentoEm(dataFutura(2), {
        retirada: new Date("2027-09-14T18:30:00-03:00"),
      });

      await agentG
        .patch(`/api/lojas/${g.lojaId}/reservas/${reserva.id}`)
        .send({ casamentoData: dataFutura(97).toISOString() })
        .expect(200);

      const [c] = await db.select().from(contratosTable).where(eq(contratosTable.id, contrato.id));
      expect(diaDo(c?.dataRetirada)).toBe("2027-12-18");
      expect(horaDe(c?.dataRetirada), "gravar 18:30 num sábado é gravar o que a porta recusa com 422").toBe("10:30");
    });
  });

  // ─────────────────────────── S-R3 🟠 ───────────────────────────

  /**
   * O quarto sítio da 16ª. A conta é pura — `janelasDoBloqueio` — e é ela que
   * pinta o acervo e o calendário.
   */
  describe("S-R3 🟠 — o acervo lê a mesma data que a porta", () => {
    const bloqueioFora = (papel: string | null) => ({
      id: "b1",
      tipo: "RESERVA_CASAMENTO" as const,
      // Data de NEGÓCIO, ancorada ao meio-dia de SP (S-O117).
      casamentoData: ancoraDeNegocio("2027-09-12"),
      provaDataReal: null,
      retiradaDataReal: new Date("2027-09-09T10:30:00-03:00"),
      devolucaoDataReal: null,
      lavagemConcluidaEm: null,
      inicio: null,
      fim: null,
      dataDevolucaoDoPapel: papel,
    });

    it("no dia que o papel dá como prazo, a peça está em USO — não em ATRASO_DEVOLUCAO", () => {
      // Casamento sábado 12/09, `usoDiasDepois=2` → janela até segunda 14/09,
      // que a 4ª fecha; o papel imprime terça 15/09. Na terça de manhã a tela
      // pintava atraso e a porta respondia 422 SEM_ATRASO.
      const janela = janelasDoBloqueio(bloqueioFora("2027-09-15T18:00:00-03:00"), REGRA_DEFAULT, "2027-09-15")
        .find((j) => j.classe === "FISICA");
      expect(janela?.motivo).toBe("USO");
    });

    it("um dia depois do papel, sim — o atraso existe, e a tela o pinta", () => {
      const janela = janelasDoBloqueio(bloqueioFora("2027-09-15T18:00:00-03:00"), REGRA_DEFAULT, "2027-09-16")
        .find((j) => j.classe === "FISICA");
      expect(janela?.motivo).toBe("ATRASO_DEVOLUCAO");
    });

    it("sem papel, a janela continua sendo a régua — e o 15/09 é atraso", () => {
      const janela = janelasDoBloqueio(bloqueioFora(null), REGRA_DEFAULT, "2027-09-15")
        .find((j) => j.classe === "FISICA");
      expect(janela?.motivo).toBe("ATRASO_DEVOLUCAO");
    });

    it("a janela FÍSICA de uma peça devolvida também vai até o papel: o dia prometido não se oferece a outra noiva", () => {
      const devolvida = { ...bloqueioFora("2027-09-15T18:00:00-03:00"), retiradaDataReal: null };
      const fisica = janelasDoBloqueio(devolvida, REGRA_DEFAULT, "2027-09-01").find((j) => j.classe === "FISICA");
      // Sem o papel seria 14/09 — e a peça apareceria livre no dia em que o
      // instrumento já a prometeu à noiva que assinou.
      expect(fisica?.fim).toBe("2027-09-15");
    });
  });

  // ─────────────────────────── S-R12 🟡 ───────────────────────────

  describe("S-R12 🟡 — corrigir a data do papel derruba a fila de atrasos", () => {
    it("a fila para de cobrar no mesmo instante, e não em até 5 minutos", async () => {
      const dona = await loginComLoja(f.superAdminEmail, f.lojaId);
      const { contrato } = await noivaComPapel({
        casamento: diasAtras(30),
        dataRetirada: diasAtras(33),
        // O papel com a data ERRADA — digitada com um mês a menos, que é o
        // gesto que esta porta existe para corrigir.
        dataDevolucao: diasAtras(28),
        pecas: [{ aluguel: 3000, retiradoHaDias: 33, devolvidoHaDias: null }],
      });

      derrubarFilaDeAtrasos(f.lojaId);
      const antes = await dona.get(`/api/lojas/${f.lojaId}/contratos-com-atraso`).expect(200);
      expect(
        (antes.body.itens as { contratoId: string }[]).some((c) => c.contratoId === contrato.id),
        "com o papel dizendo há 28 dias e a peça ainda fora, ela está atrasada",
      ).toBe(true);

      await agent
        .patch(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`)
        .send({ dataDevolucao: ancoraDeNegocio(addDias(hojeLocal(), 5)).toISOString() })
        .expect(200);

      const depois = await dona.get(`/api/lojas/${f.lojaId}/contratos-com-atraso`).expect(200);
      expect(
        (depois.body.itens as { contratoId: string }[]).some((c) => c.contratoId === contrato.id),
        "a fila responde do cache por 5 min, e esta é a única porta que EDITA a data que ela lê",
      ).toBe(false);
    });
  });
});
