import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";
import {
  criarFixture,
  criarVestido,
  criarLead,
  criarBloqueio,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import {
  REGRA_DEFAULT,
  aparaProvaPrevistaNoPassado,
  proximaDataLivre,
  type Janela,
} from "../lib/disponibilidade";

/**
 * S-C234 — a janela de PROVA de uma CANDIDATA varria o passado.
 *
 * `janelaDeProvaPrevista` devolve `[D − provaDiasAntes, inícioDoUso − 1]` sem
 * olhar `hojeDia`: com a régua default (prova 14, uso 3+2), reservar para
 * daqui a **3 dias** cria uma janela de prova `[hoje−11, hoje−1]` — inteira
 * no PASSADO, sobre dias em que nenhuma prova vai acontecer. Uma peça que já
 * SAIU E VOLTOU (devolvida há 8 dias, lavagem terminada ontem) ocupava
 * exatamente esses dias, e o 409 conservador barrava uma reserva fisicamente
 * possível.
 *
 * O corte é só na PROVA **PREVISTA** da **CANDIDATA** (`provaDataReal` nula):
 * prova real é fato e fato não se apara; janela FÍSICA não se apara nunca —
 * o uso e a lavagem ocupam o que ocupam, no passado inclusive (é o que faz a
 * peça ainda fora continuar barrando, provado abaixo).
 *
 * A cena usa datas RELATIVAS A AGORA de propósito (a lição do E225): o corte
 * é em `hojeDia`, e `dataFutura` ancora em 2027.
 */
describe("S-C234 — a prova prevista da candidata não varre o passado", () => {
  // O deslocamento é sobre o DIA DE NEGÓCIO em SP, não sobre o instante UTC:
  // depois das 21h de SP o Date.now() já é o dia seguinte em UTC, e a cena
  // inteira andava um dia (medido: a lavagem "terminada ontem" terminava HOJE,
  // e o 409 era legítimo — a prova ainda podia acontecer hoje).
  const hojeSP = hojeLocal();
  const em = (dias: number) => ancoraDeNegocio(addDias(hojeSP, dias));

  describe("a régua pura do corte", () => {
    const j = (inicio: string, fim: string | null, classe: "PROVA" | "FISICA"): Janela => ({
      inicio,
      fim,
      motivo: classe === "PROVA" ? "PROVA" : "USO",
      classe,
      bloqueioId: "b",
    });
    const hoje = "2027-06-15";

    it("prova inteira no passado some; a que atravessa hoje é aparada; a futura fica", () => {
      expect(aparaProvaPrevistaNoPassado([j("2027-06-01", "2027-06-14", "PROVA")], hoje)).toEqual([]);
      expect(
        aparaProvaPrevistaNoPassado([j("2027-06-01", "2027-06-20", "PROVA")], hoje),
      ).toEqual([{ ...j("2027-06-15", "2027-06-20", "PROVA") }]);
      const futura = [j("2027-07-01", "2027-07-10", "PROVA")];
      expect(aparaProvaPrevistaNoPassado(futura, hoje)).toEqual(futura);
    });

    it("hoje ainda é dia de prova: a janela que termina hoje não some", () => {
      expect(
        aparaProvaPrevistaNoPassado([j("2027-06-01", "2027-06-15", "PROVA")], hoje),
      ).toEqual([j("2027-06-15", "2027-06-15", "PROVA")]);
    });

    it("janela FÍSICA não se apara nunca — o passado físico ocupa", () => {
      const fisicas = [j("2027-06-01", "2027-06-14", "FISICA"), j("2027-06-01", null, "FISICA")];
      expect(aparaProvaPrevistaNoPassado(fisicas, hoje)).toEqual(fisicas);
    });

    /**
     * A mesma classe na SUGESTÃO: `proximaDataLivre` propõe D testando a
     * candidata inteira, e a prova no passado empurrava a proposta. Com uma
     * lavagem terminada ONTEM (14/06), a peça está livre a partir do primeiro
     * D cujo USO começa hoje — D = 18/06 (uso [15/06, 20/06]); a régua velha
     * só encontrava paz quando a PROVA inteira saía de cima da lavagem morta,
     * em D = 29/06. Onze dias de acervo parado por prova que ninguém marcaria.
     */
    it("proximaDataLivre não é empurrada por prova sobre o passado", () => {
      const lavagemMorta = [j("2027-06-08", "2027-06-14", "FISICA")];
      expect(
        proximaDataLivre({ janelasExistentes: lavagemMorta, regra: REGRA_DEFAULT, aPartirDe: hoje }),
      ).toBe("2027-06-18");
    });
  });

  describe("a porta", () => {
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

    it("peça que já voltou (lavagem terminada ontem): reservar para daqui a 3 dias é 201", async () => {
      const vestido = await criarVestido(f);
      const noivaA = await criarLead(f);
      // A locação que já ACONTECEU: casamento há 10 dias, retirada há 13,
      // devolvida há 8 — com lavagem default de 7 dias, a cauda foi
      // [hoje−7, hoje−1] e terminou ONTEM. Fisicamente, a peça está livre.
      await criarBloqueio(f, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: vestido.id,
        leadId: noivaA.id,
        casamentoData: em(-10),
        ancorarCasamento: false,
        retiradaDataReal: em(-13),
        devolucaoDataReal: em(-8),
      });

      const noivaB = await criarLead(f);
      const r = await agent
        .post(`/api/lojas/${f.lojaId}/bloqueios`)
        .send({
          vestidoId: vestido.id,
          leadId: noivaB.id,
          tipo: "RESERVA_CASAMENTO",
          casamentoData: em(3).toISOString(),
        });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.vestidoId).toBe(vestido.id);
    });

    it("peça ainda NA RUA: o mesmo pedido segue 409 — o corte é da prova, não da física", async () => {
      const vestido = await criarVestido(f);
      const noivaA = await criarLead(f);
      await criarBloqueio(f, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: vestido.id,
        leadId: noivaA.id,
        casamentoData: em(-10),
        ancorarCasamento: false,
        retiradaDataReal: em(-13),
        // sem devolução: janela física ABERTA (ATRASO_DEVOLUCAO)
      });

      const noivaB = await criarLead(f);
      const r = await agent
        .post(`/api/lojas/${f.lojaId}/bloqueios`)
        .send({
          vestidoId: vestido.id,
          leadId: noivaB.id,
          tipo: "RESERVA_CASAMENTO",
          casamentoData: em(3).toISOString(),
        })
        .expect(409);
      expect(r.body.error).toBe("VESTIDO_INDISPONIVEL");
    });

    it("a prova FUTURA da candidata continua conflitando com física futura", async () => {
      const vestido = await criarVestido(f);
      const noivaA = await criarLead(f);
      // Peça sai na semana que vem: uso [hoje+7−3, hoje+7+2] = [hoje+4, hoje+9].
      await criarBloqueio(f, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: vestido.id,
        leadId: noivaA.id,
        casamentoData: em(7),
        ancorarCasamento: false,
      });

      // Candidata com casamento em hoje+12: prova [hoje−2, hoje+8] vira
      // [hoje, hoje+8] depois do corte — e ainda cruza o uso da noiva A.
      const noivaB = await criarLead(f);
      const r = await agent
        .post(`/api/lojas/${f.lojaId}/bloqueios`)
        .send({
          vestidoId: vestido.id,
          leadId: noivaB.id,
          tipo: "RESERVA_CASAMENTO",
          casamentoData: em(12).toISOString(),
        })
        .expect(409);
      expect(r.body.error).toBe("VESTIDO_INDISPONIVEL");
      expect((r.body.conflitos as { motivo: string }[]).some((c) => c.motivo === "USO")).toBe(true);
    });
  });
});
