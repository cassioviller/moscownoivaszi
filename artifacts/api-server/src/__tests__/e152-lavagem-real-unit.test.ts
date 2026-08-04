import { describe, expect, it } from "vitest";
import {
  REGRA_DEFAULT,
  janelasDoBloqueio,
  ocupacaoFisica,
  type BloqueioJanelasInput,
} from "../lib/disponibilidade";

/**
 * E152 — a lavagem tem fim REAL, não só previsto.
 *
 * A régua de 7 dias está CERTA: a dona respondeu (P1) *"uma semana, lavagem
 * externa"*. O defeito nunca foi o número — é que a lavagem era a única etapa
 * do ciclo sem data real. Retirada e devolução encurtam a janela quando a
 * realidade diverge do previsto; a lavagem era sempre `[fimUso+1, fimUso+7]`,
 * por soma, e a peça voltava da lavanderia na quarta presa até domingo.
 *
 * Casamento âncora D = 15/09/2027, REGRA_DEFAULT (14/3/2/7):
 *   USO     [2027-09-12, 2027-09-17]
 *   LAVAGEM [2027-09-18, 2027-09-24]
 */
const D = new Date("2027-09-15T12:00:00-03:00");
const HOJE = "2027-01-10";
const dia = (ymd: string) => new Date(`${ymd}T12:00:00-03:00`);

function bloqueio(over: Partial<BloqueioJanelasInput> = {}): BloqueioJanelasInput {
  return {
    id: "blq-1",
    tipo: "RESERVA_CASAMENTO",
    casamentoData: D,
    provaDataReal: null,
    retiradaDataReal: null,
    devolucaoDataReal: null,
    lavagemConcluidaEm: null,
    inicio: null,
    fim: null,
    ...over,
  };
}

const lavagem = (b: BloqueioJanelasInput) =>
  janelasDoBloqueio(b, REGRA_DEFAULT, HOJE).find((j) => j.motivo === "LAVAGEM") ?? null;

describe("E152 — a lavagem termina quando a peça volta", () => {
  it("sem data real, a janela é a prevista — a régua da loja continua valendo", () => {
    expect(lavagem(bloqueio())).toMatchObject({ inicio: "2027-09-18", fim: "2027-09-24" });
  });

  it("com a volta registrada, a janela termina NELA — e não no sétimo dia", () => {
    const j = lavagem(bloqueio({ lavagemConcluidaEm: dia("2027-09-20") }));
    expect(j).toMatchObject({ inicio: "2027-09-18", fim: "2027-09-20" });
  });

  it("o dia da volta ainda é ocupado; o seguinte já está livre", () => {
    // Simétrico à devolução, que também ocupa o próprio dia: a peça chegou
    // naquele dia, e é no dia seguinte que ela pode sair de novo.
    const j = lavagem(bloqueio({ lavagemConcluidaEm: dia("2027-09-20") }))!;
    expect(j.fim).toBe("2027-09-20");
  });

  it("volta DEPOIS do prazo não estica a janela — a régua é o teto", () => {
    // A peça atrasou na lavanderia: a janela prevista já cobre o período, e
    // esticar seria inventar ocupação que a régua da loja não pediu.
    const j = lavagem(bloqueio({ lavagemConcluidaEm: dia("2027-10-05") }));
    expect(j).toMatchObject({ fim: "2027-09-24" });
  });

  it("volta no MESMO dia da devolução: não houve lavagem, e não há janela", () => {
    // O caso "não houve lavagem" da spec. A alternativa seria uma janela
    // invertida [18, 17], que é pior que nenhuma.
    expect(lavagem(bloqueio({ lavagemConcluidaEm: dia("2027-09-17") }))).toBeNull();
  });

  it("a devolução real manda no início da lavagem, e a volta manda no fim", () => {
    const j = lavagem(
      bloqueio({
        retiradaDataReal: dia("2027-09-12"),
        devolucaoDataReal: dia("2027-09-16"),
        lavagemConcluidaEm: dia("2027-09-18"),
      }),
    );
    expect(j).toMatchObject({ inicio: "2027-09-17", fim: "2027-09-18" });
  });

  it("o envelope físico encolhe junto — é dele que a ocupação materializada sai", () => {
    const semVolta = ocupacaoFisica(bloqueio(), REGRA_DEFAULT);
    expect(semVolta).toEqual({ inicio: "2027-09-12", fim: "2027-09-24" });

    const comVolta = ocupacaoFisica(
      bloqueio({ lavagemConcluidaEm: dia("2027-09-19") }),
      REGRA_DEFAULT,
    );
    expect(comVolta).toEqual({ inicio: "2027-09-12", fim: "2027-09-19" });
  });

  it("colapsar a janela só REDUZ ocupação — cinco dias voltam ao mercado", () => {
    // O número que o épico entrega: com a volta na quarta, a peça deixa de
    // ficar presa até domingo. É o caso `Adelita` do caderno, que hoje o
    // sistema recusa sem oferecer caminho nenhum.
    const previsto = lavagem(bloqueio())!;
    const real = lavagem(bloqueio({ lavagemConcluidaEm: dia("2027-09-19") }))!;
    expect(previsto.fim).toBe("2027-09-24");
    expect(real.fim).toBe("2027-09-19");
  });

  it("a peça que não voltou da noiva não tem janela de lavagem para encurtar", () => {
    // Retirada sem devolução é janela física ABERTA: não há fim de uso, e
    // portanto não há lavagem a colapsar.
    const janelas = janelasDoBloqueio(
      bloqueio({ retiradaDataReal: dia("2027-09-12"), lavagemConcluidaEm: dia("2027-09-20") }),
      REGRA_DEFAULT,
      HOJE,
    );
    expect(janelas.some((j) => j.motivo === "LAVAGEM")).toBe(false);
  });
});
