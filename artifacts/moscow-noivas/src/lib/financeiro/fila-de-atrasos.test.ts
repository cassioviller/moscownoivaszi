import { describe, expect, it } from "vitest";
import { avisoDoAtraso, faixaDaLinha, type LinhaDaFilaDeAtraso } from "./fila-de-atrasos";

/**
 * **S-C32 — a fila do atraso, e o aviso que ela acende.**
 *
 * O E212 fez a conta da 16ª e deu a ela uma porta só: a ficha daquela reserva.
 * Só que o fato NÃO é um gesto — é a falta de um. A peça não volta, ninguém
 * clica em nada, e a diária de R$ 500,00 (aluguel de R$ 3.000,00 ÷ 6 dias de
 * janela) soma sozinha todo dia.
 *
 * O que se prega aqui é o TEXTO. O número vem pronto do servidor, pela mesma
 * função que a ficha usa para cobrar — refazer a conta aqui seria a segunda
 * grafia que diverge no dia em que a régua mudar (E187).
 *
 * O espaço entre "R$" e o número é U+00A0 e se escreve **escapado** (S-C30): o
 * literal faz um vermelho exibir duas strings visualmente idênticas.
 */

const linha = (over: Partial<LinhaDaFilaDeAtraso> = {}): LinhaDaFilaDeAtraso => ({
  maiorAtraso: 3,
  valor: 1750,
  temExtravio: false,
  semAluguel: [],
  jaCobrada: false,
  ...over,
});

describe("S-C32 — o aviso do atraso", () => {
  it("fila vazia não acende aviso nenhum", () => {
    expect(avisoDoAtraso({ itens: [], pecas: 0, valor: 0 })).toBeNull();
    expect(avisoDoAtraso(undefined)).toBeNull();
  });

  /**
   * O caso canônico do E212: 3 dias × R$ 500,00 + R$ 250,00 de multa =
   * R$ 1.750,00. O aviso diz o número **e** que ele sobe — é a única cobrança
   * do sistema cujo valor depende do dia em que se olha.
   */
  it("uma peça atrasada: diz quantos dias, quanto já custa, e que sobe", () => {
    const aviso = avisoDoAtraso({ itens: [linha()], pecas: 1, valor: 1750 })!;
    expect(aviso.titulo).toBe("1 peça fora do prazo de devolução");
    expect(aviso.detalhe).toBe(
      "A mais antiga está fora há 3 dias. A cláusula 16ª já cobra R$\u00a01.750,00, e o valor sobe a cada dia.",
    );
    expect(aviso.urgente).toBe(false);
  });

  it("o plural conta PEÇAS, não contratos — três araras vazias são três peças", () => {
    const aviso = avisoDoAtraso({
      itens: [linha({ maiorAtraso: 2, valor: 1450 })],
      pecas: 3,
      valor: 1450,
    })!;
    expect(aviso.titulo).toBe("3 peças fora do prazo de devolução");
    expect(aviso.detalhe).toContain("está fora há 2 dias");
  });

  it("um dia é singular — o aviso não diz “1 dias”", () => {
    const aviso = avisoDoAtraso({
      itens: [linha({ maiorAtraso: 1, valor: 750 })],
      pecas: 1,
      valor: 750,
    })!;
    expect(aviso.detalhe).toContain("está fora há 1 dia.");
  });

  /**
   * Dez dias ou mais é o caput: deixa de ser diária e vira 4× o aluguel —
   * R$ 12.000,00 num vestido de R$ 3.000,00. É o pior caso que o instrumento
   * prevê, e o aviso sobe para urgente.
   */
  it("o extravio nomeia a faixa e acende o aviso urgente", () => {
    const aviso = avisoDoAtraso({
      itens: [linha({ maiorAtraso: 12, valor: 12_000, temExtravio: true })],
      pecas: 1,
      valor: 12_000,
    })!;
    expect(aviso.urgente).toBe(true);
    expect(aviso.detalhe).toBe(
      "12 dias sem devolução — a 16ª já trata isso como extravio. A cláusula 16ª já cobra R$\u00a012.000,00, e o valor sobe a cada dia.",
    );
  });

  /**
   * A peça atrasada FORA do rol de itens não tem conta (a 16ª cobra sobre *"o
   * valor do aluguel de cada peça"*). O aviso **não cala**: uma peça fora que
   * ninguém consegue cobrar é mais grave que uma que dá para cobrar.
   */
  it("sem aluguel no rol, o aviso diz que não há de onde tirar a conta", () => {
    const aviso = avisoDoAtraso({
      itens: [linha({ valor: 0, semAluguel: ["Vestido Serena"] })],
      pecas: 1,
      valor: 0,
    })!;
    expect(aviso.detalhe).toBe(
      "A mais antiga está fora há 3 dias. Nenhuma delas está no rol de itens do contrato: não há aluguel de onde tirar a conta.",
    );
  });

  /**
   * O sino guarda o dispensado por ID, e o ID carrega a assinatura do estado
   * (E68): amanhã a peça está fora há um dia a mais e custa R$ 500,00 a mais —
   * o aviso tem de voltar sozinho, sem ninguém reabrir nada.
   */
  it("a assinatura muda quando o atraso cresce — o aviso dispensado volta amanhã", () => {
    const hoje = avisoDoAtraso({ itens: [linha()], pecas: 1, valor: 1750 })!;
    const amanha = avisoDoAtraso({
      itens: [linha({ maiorAtraso: 4, valor: 2250 })],
      pecas: 1,
      valor: 2250,
    })!;
    expect(amanha.assinatura).not.toBe(hoje.assinatura);
  });

  it("o maior atraso é o da PIOR linha, não o da primeira", () => {
    const aviso = avisoDoAtraso({
      itens: [linha({ maiorAtraso: 3 }), linha({ maiorAtraso: 21, temExtravio: true })],
      pecas: 2,
      valor: 13_750,
    })!;
    expect(aviso.detalhe).toContain("21 dias sem devolução");
    expect(aviso.urgente).toBe(true);
  });
});

describe("S-C32 — o rótulo da linha na fila", () => {
  it("dentro do §1º, diz há quantos dias", () => {
    expect(faixaDaLinha(linha())).toBe("fora do prazo há 3 dias");
    expect(faixaDaLinha(linha({ maiorAtraso: 1 }))).toBe("fora do prazo há 1 dia");
  });

  it("passado o décimo dia, diz que é extravio — a faixa mudou de cláusula", () => {
    expect(faixaDaLinha(linha({ maiorAtraso: 10, temExtravio: true }))).toBe(
      "10 dias sem devolução — extravio (16ª)",
    );
  });
});
