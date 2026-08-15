import { describe, expect, it } from "vitest";
import { janelaDeProvaDoDia } from "@workspace/agenda-core";
import {
  contarProvasForaDaJanela,
  janelaDeProva,
  provaForaDaJanela,
} from "./prova-fora-da-janela";

/**
 * S-O97 — os números deste arquivo são os MESMOS do teste de API
 * (`so97-prova-nao-segue-a-data-api.test.ts`), de propósito: até o E240 a
 * janela era escrita dos dois lados da borda (aqui e em
 * `disponibilidade.ts:janelaDeProvaPrevista`) e este par de testes era o que a
 * prendia. **E240/S-O116: a conta é uma só, em `@workspace/agenda-core`**, e os
 * números ficam porque continuam sendo a cena da loja.
 */
const REGRA = { provaDiasAntes: 14, usoDiasAntes: 3 };

const prova = (dia: string, casamento: string | null, extra: Record<string, unknown> = {}) => ({
  tipo: "PROVA",
  situacao: "AGENDADO",
  inicio: `${dia}T14:00:00-03:00`,
  bloqueio: casamento ? { casamentoData: `${casamento}T12:00:00-03:00` } : null,
  ...extra,
});

describe("a janela de prova, com a régua de fábrica", () => {
  it("é [D − 14, D − 4] — termina um dia antes de o uso começar", () => {
    expect(janelaDeProva("2028-09-05T12:00:00-03:00", REGRA)).toEqual({
      inicio: "2028-08-22",
      fim: "2028-09-01",
    });
  });

  it("não existe quando a régua não deixa dia nenhum (S-A23)", () => {
    expect(janelaDeProva("2028-09-05T12:00:00-03:00", { provaDiasAntes: 3, usoDiasAntes: 3 })).toBeNull();
  });

  /**
   * E240/S-O116 — **a conta é UMA, e é a do servidor.**
   *
   * A régua da tela e a do servidor eram duas escritas da mesma aritmética,
   * presas só pelos números acima. A tela ainda convertia o casamento com
   * `diaLocal` — instante — sobre uma data de NEGÓCIO: com o casamento
   * gravado à meia-noite UTC (a grafia legada que a S-O117 descreveu),
   * `2028-09-05T00:00:00Z` virava 04/09 em São Paulo e a janela andava um dia.
   *
   * Vermelho medido antes do conserto, com a régua antiga da tela:
   * `expected { inicio: '2028-08-21', fim: '2028-08-31' } to deeply equal
   * { inicio: '2028-08-22', fim: '2028-09-01' }` — o servidor
   * (`janelaDeProvaPrevista("2028-09-05")`) dizia 22/08–01/09.
   */
  it("o casamento à meia-noite UTC dá a MESMA janela que o servidor — a tela lê dia de negócio", () => {
    expect(janelaDeProva("2028-09-05T00:00:00Z", REGRA)).toEqual({
      inicio: "2028-08-22",
      fim: "2028-09-01",
    });
    // A âncora ao meio-dia (a grafia de hoje) continua dando o mesmo.
    expect(janelaDeProva("2028-09-05T15:00:00.000Z", REGRA)).toEqual({
      inicio: "2028-08-22",
      fim: "2028-09-01",
    });
    // E a conta que os dois lados importam é a do `agenda-core`.
    expect(janelaDeProva("2028-09-05T15:00:00.000Z", REGRA)).toEqual(janelaDeProvaDoDia("2028-09-05", REGRA));
  });
});

describe("S-O97 — a prova que ficou para trás quando a reserva mudou de data", () => {
  it("prova depois do casamento é o caso pior, e tem nome próprio", () => {
    // casamento andou para trás (05/09 → 16/08) e a prova ficou em 26/08
    expect(provaForaDaJanela(prova("2028-08-26", "2028-08-16"), REGRA)).toBe("DEPOIS_DO_CASAMENTO");
  });

  it("prova longe demais, antes do casamento, é fora da janela", () => {
    // casamento andou para a frente (05/09 → 15/10): a peça não é dela em 26/08
    expect(provaForaDaJanela(prova("2028-08-26", "2028-10-15"), REGRA)).toBe("FORA_DA_JANELA");
  });

  it("prova dentro da janela não vira alarme — é o normal da loja", () => {
    expect(provaForaDaJanela(prova("2028-08-26", "2028-09-05"), REGRA)).toBeNull();
    // as duas bordas contam como dentro
    expect(provaForaDaJanela(prova("2028-08-22", "2028-09-05"), REGRA)).toBeNull();
    expect(provaForaDaJanela(prova("2028-09-01", "2028-09-05"), REGRA)).toBeNull();
  });

  it("um dia depois do fim da janela já é aviso — a peça saiu para o uso", () => {
    expect(provaForaDaJanela(prova("2028-09-02", "2028-09-05"), REGRA)).toBe("FORA_DA_JANELA");
  });

  it("prova CONCLUÍDA é história, não promessa", () => {
    expect(
      provaForaDaJanela(prova("2028-08-26", "2028-08-16", { situacao: "CONCLUIDO" }), REGRA),
    ).toBeNull();
  });

  it("quem está na cabine agora conta — é o pior momento para a loja descobrir sozinha", () => {
    expect(
      provaForaDaJanela(prova("2028-08-26", "2028-08-16", { situacao: "EM_ATENDIMENTO" }), REGRA),
    ).toBe("DEPOIS_DO_CASAMENTO");
  });

  it("o que não é PROVA não responde", () => {
    expect(provaForaDaJanela(prova("2028-08-26", "2028-08-16", { tipo: "VISITA" }), REGRA)).toBeNull();
  });

  it("sem a régua carregada, o selo não aparece — default errado é pior que piscar", () => {
    expect(provaForaDaJanela(prova("2028-08-26", "2028-08-16"), null)).toBeNull();
  });

  it("bloqueio de manutenção (sem casamento) não responde", () => {
    expect(provaForaDaJanela(prova("2028-08-26", null), REGRA)).toBeNull();
  });

  it("conta quantas ficaram para trás numa lista — zero é o normal", () => {
    const lista = [
      prova("2028-08-26", "2028-08-16"),
      prova("2028-08-26", "2028-09-05"),
      prova("2028-08-26", "2028-10-15"),
    ];
    expect(contarProvasForaDaJanela(lista, REGRA)).toBe(2);
    expect(contarProvasForaDaJanela([prova("2028-08-26", "2028-09-05")], REGRA)).toBe(0);
  });
});
