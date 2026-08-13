import { describe, expect, it } from "vitest";
import { pdfDoContrato, type ContratoComPapel } from "../lib/contrato-do-papel";

/**
 * **S-C36/E224 — o papel diz A QUE HORAS, porque é a hora que a 4ª decide.**
 *
 * O E222 achou as duas linhas do PDF sempre vazias e chamou a sobra de 🔵: não
 * era defeito de código, era a ausência da S-C35 vista no papel que a noiva
 * leva para casa. Ao pôr o gesto na tela, o papel passa a imprimi-las — e aí a
 * impressão vira o defeito.
 *
 * Duas coisas estavam erradas na mesma linha, e as duas vêm de o E222 ter
 * mudado a NATUREZA dos dois campos sem que o papel soubesse:
 *
 * 1. **A hora não era impressa.** A 5ª diz que a locação começa às **10:30** do
 *    dia da retirada e termina às **18:00** do dia da devolução, e o E222 fez a
 *    hora decidir o veredito da porta (expediente 10:30–19:00). *"Retirada:
 *    06/09/2028"* não diz à noiva a que horas ela vem buscar o vestido — que é
 *    exatamente a informação que as duas cláusulas existem para fixar.
 * 2. **O formatador era o de DIA DE NEGÓCIO.** `contrato-do-papel.ts:175-176`
 *    formatava os dois com `dataBR` (`timeZone: "UTC"`), e a própria nota do
 *    `dataBRInstante`, dez linhas acima, listava *"casamento, retirada,
 *    vencimento"* como dias civis — verdade escrita antes do E222 e falsa
 *    depois dele. Dentro do expediente de fábrica o dia UTC coincide (10:30 SP
 *    = 13:30 UTC), então a troca não mordia; numa loja que retire às **21:30**,
 *    21:30 SP = **00:30 UTC do dia seguinte**, e o papel imprime o dia errado.
 *    É a classe da S-O117, no documento assinável.
 */

const texto = (bytes: Uint8Array) =>
  Buffer.from(bytes)
    .toString("latin1")
    .replace(/\u00a0/g, " ")
    .replace(/\\([()])/g, "$1");

const base = {
  id: "c1",
  lojaId: "l1",
  leadId: "n1",
  valorTotal: 5000,
  status: "ATIVO",
  fechadoEm: new Date("2028-08-01T15:00:00Z"),
  loja: { nome: "Moscow Noivas" },
  lead: { noivaNome: "Ana Lima" },
  itens: [],
  parcelas: [],
  // Casamento no sábado 09/09/2028 — dia de NEGÓCIO, à meia-noite UTC.
  dataCasamento: new Date("2028-09-09T00:00:00Z"),
  // 10:30 e 18:00 no relógio da loja (a cláusula 5ª), gravados como INSTANTE.
  dataRetirada: new Date("2028-09-06T13:30:00Z"),
  dataDevolucao: new Date("2028-09-12T21:00:00Z"),
} as unknown as ContratoComPapel;

describe("S-C36 — as duas datas da locação no papel", () => {
  it("a retirada e a devolução saem com a HORA, no relógio da loja", () => {
    const txt = texto(pdfDoContrato(base));
    expect(txt).toContain("Retirada: 06/09/2028 às 10:30");
    expect(txt).toContain("Devolucao: 12/09/2028 às 18:00");
  });

  it("o casamento continua sendo DIA de negócio, sem hora nenhuma", () => {
    const txt = texto(pdfDoContrato(base));
    expect(txt).toContain("Casamento: 09/09/2028");
    expect(txt).not.toContain("Casamento: 09/09/2028 às");
  });

  /**
   * A retirada tarde da noite é o caso que separa os dois formatadores. Uma
   * loja que configure a 4ª até as 23h grava 23:00 SP = 02:00 UTC do dia
   * SEGUINTE; o `dataBR` de UTC imprimia 07/09 num contrato retirado em 06/09.
   */
  it("o instante da noite não empurra o dia do papel para a frente", () => {
    const txt = texto(
      pdfDoContrato({ ...base, dataRetirada: new Date("2028-09-07T02:00:00Z") } as ContratoComPapel),
    );
    expect(txt).toContain("Retirada: 06/09/2028 às 23:00");
    expect(txt).not.toContain("Retirada: 07/09/2028");
  });

  /**
   * O traço é decisão do desenhista (`pdf-desenhista.ts:97`): *"o papel tem de
   * dizer que ali não há dado, e não esconder a linha"*. Era ESTE o retrato que
   * a S-C36 descreveu — as duas linhas impressas e sempre vazias, em 722 dos
   * 723 contratos. O que ele imprime não muda; o que muda é quantos contratos
   * chegam nele com dado.
   */
  it("sem as datas, as duas linhas imprimem o traço — os campos são OPCIONAIS", () => {
    const txt = texto(
      pdfDoContrato({
        ...base,
        dataRetirada: null,
        dataDevolucao: null,
      } as unknown as ContratoComPapel),
    );
    expect(txt).toContain("Retirada: -");
    expect(txt).toContain("Devolucao: -");
  });
});
