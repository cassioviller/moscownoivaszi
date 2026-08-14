import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contratoBloqueiosTable, contratoItensTable, db, parcelasTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";
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
 * **S-C100 — a descrição da parcela chega inteira ao carnê.**
 *
 * Duas portas de `reservas.ts` gravavam `parcelas.descricao` com
 * `.slice(0, 200)`, e as duas escrevem o que a noiva lê no portal:
 *
 * | porta | frase | tamanho | o corte guardava |
 * |---|---|---|---|
 * | `POST /avarias/:id/cobrar` | `Reparo de avaria — <descrição>` | até **1019** | 200 |
 * | `POST /contratos/:id/cobranca-de-atraso` | `Atraso na devolução — <explicação>` | **260** com 3 peças | 200 |
 *
 * **Não havia limite a respeitar.** `parcelas.descricao` é `text` com
 * `character_maximum_length` NULO (medido no `heliumdb`, com
 * `SELECT current_database()` conferido), e `Parcela.descricao` não tem teto no
 * spec. O 200 era palpite sobre o banco — a mesma classe da S-C71, que já o
 * tirou da linha de `MORA` em `contratos.ts`.
 *
 * **Por que este arquivo existe, e não um assert a mais no `e212`.** O
 * `e212-atraso-na-devolucao-api.test.ts:182` escrevia o corte DENTRO do
 * `expect` — `` .toBe(`Atraso na devolução — ${explicacao}`.slice(0, 200)) `` —
 * e mesmo assim **passa nas duas versões do código**: a fixture dele é de UMA
 * peça, e a frase dá **147** caracteres. Ele pregava o corte na letra e não no
 * efeito, que é a regra 34 vista pelo avesso. O caso que reprova é o de TRÊS
 * peças, e é ele que mora aqui.
 */
describe("S-C100 — o carnê guarda a frase inteira, não os 200 primeiros caracteres", () => {
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

  const diasAtras = (n: number) => ancoraDeNegocio(addDias(hojeLocal(), -n));

  const parcelasDe = (contratoId: string, origem: "AVARIA" | "ATRASO_DEVOLUCAO") =>
    db
      .select()
      .from(parcelasTable)
      .where(and(eq(parcelasTable.contratoId, contratoId), eq(parcelasTable.origem, origem)));

  /**
   * **O teto do spec, gravado.** `AvariaInput.descricao` aceita 1.000
   * caracteres (S-O81/E191, e a `avarias-api.test.ts:105` prega os dois lados
   * do teto), e o prefixo *"Reparo de avaria — "* tem 19: a parcela que a porta
   * escreve tem **1019** caracteres. O corte guardava 200 e jogava fora **819**
   * — o que a vendedora escreveu olhando a peça, e é o texto que sustenta uma
   * cobrança de reparo contestada.
   */
  it("a avaria de 1.000 caracteres vira uma descrição de 1019 — nenhum caractere fica no caminho", async () => {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      casamentoData: dataFutura(30),
    });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 5000,
      fechadoEm: dataFutura(-5),
    });

    // O teto exato do spec, com um fim reconhecível: é ele que o corte comia.
    const marcador = " FIM DO LAUDO DA PECA";
    const laudo =
      "Renda francesa descosturada em toda a barra. ".repeat(30).slice(0, 1000 - marcador.length) + marcador;
    expect(laudo).toHaveLength(1000);

    const avaria = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: laudo, custoReparo: 350, tipo: "LIMPEZA" })
      .expect(201);

    await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}/cobrar`)
      .send({ contratoId: contrato.id })
      .expect(201);

    const [parcela] = await parcelasDe(contrato.id, "AVARIA");
    expect(parcela!.descricao).toBe(`Reparo de avaria — ${laudo}`);
    expect(parcela!.descricao).toHaveLength(1019);
    // O fim do laudo é o que o corte em 200 jogava fora.
    expect(parcela!.descricao).toContain("FIM DO LAUDO DA PECA");
  });

  /**
   * **A frase do atraso cresce com o número de peças, e o corte comia o fim.**
   * A fixture é a do §2º do E212 — três peças de R$ 3.000,00, R$ 400,00 e
   * R$ 200,00, dois dias de atraso cada, numa janela de uso de 6 dias. A
   * explicação sai com **260** caracteres, e os **60** que sobravam de fora
   * eram *" de atraso (cláusula 16ª §1º): R$ 250,00. Total R$ 1.450,00."*: a
   * multa do §1º e o TOTAL, que é a linha que a noiva confere no portal. A
   * descrição terminava em *"…R$ 66,66; multa"*.
   */
  it("três peças atrasadas: a descrição traz a multa e o TOTAL, que o corte engolia", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 3600,
      fechadoEm: new Date(),
    });
    for (const aluguel of [3000, 400, 200]) {
      const vestido = await criarVestido(f);
      const casamento = diasAtras(10);
      const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
      const bloqueio = await criarBloqueio(f, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: vestido.id,
        leadId: lead.id,
        reservaId: reserva.id,
        casamentoData: casamento,
        retiradaDataReal: diasAtras(13),
        devolucaoDataReal: diasAtras(6),
      });
      await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });
      await db.insert(contratoItensTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        tipo: "VESTIDO",
        vestidoId: vestido.id,
        descricao: vestido.nome,
        valorUnitario: aluguel,
        quantidade: 1,
      });
    }

    const previa = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cobranca-de-atraso`)
      .expect(200);
    expect(previa.body.linhas).toHaveLength(3);
    expect(previa.body.valor).toBe(1450);

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cobranca-de-atraso`)
      .send({})
      .expect(201);

    const [parcela] = await parcelasDe(contrato.id, "ATRASO_DEVOLUCAO");
    // A frase é a MESMA da prévia, inteira — a lição do E214 aplicada ao texto.
    expect(parcela!.descricao).toBe(`Atraso na devolução — ${previa.body.explicacao}`);
    // Os 60 caracteres que ficavam de fora, e são os que decidem a conversa.
    expect(parcela!.descricao).toContain("multa de atraso (cláusula 16ª §1º)");
    expect(parcela!.descricao!.endsWith(".")).toBe(true);
    expect(parcela!.descricao!.length).toBeGreaterThan(200);
    // O total, com o espaço RÍGIDO que o `brl()` põe (S-C30).
    expect(parcela!.descricao).toContain("Total R$\u00a01.450,00.");
  });
});
