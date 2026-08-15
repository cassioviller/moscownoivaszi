import { describe, expect, it } from "vitest";
import * as gerado from "@workspace/api-zod";

/**
 * **S-C281 — nenhum campo de data aceita `null` sem dizer que aceita.**
 *
 * A sobra pediu *"varredura dos bodies de escrita com data opcional
 * não-nullable"*, e a medição corrigiu o pedido em dois pontos:
 *
 * 1. **A grafia `.optional()` era o grep, não a classe.** Ela contava 22
 *    campos; a classe eram **31**, porque `zod.coerce.date()` **obrigatório**
 *    aceita `null` do mesmo jeito — quem produz a época é o `new Date(null)`
 *    de dentro da coerção, e ele roda antes de qualquer `.optional()`.
 * 2. **Os obrigatórios eram os piores**, porque eram os de dinheiro:
 *    `ReceberParcelaBody.recebidoEm`, `CreatePagamentoBody.data`,
 *    `PagarContaPagarBody.data`, `CreateContaPagarBody.vencimento`.
 *
 * Por isso esta régua mede por **EFEITO** e não por grafia, como a S-C170 (que
 * lê as linhas que o PDF DESENHA) e a S-C180 (que lê o que a tela OFERECE): ela
 * pergunta a cada campo *"o que você devolve quando recebe `null`?"*. Devolver
 * uma `Date` é o defeito, escrito de qualquer forma — inclusive de uma forma
 * que ninguém pensou em pregar.
 *
 * O que ela protege depois do conserto: o codegen escreve `dataDoCorpo()` por
 * um hook do `orval.config.ts`, e hook é gesto que se pode desligar sem
 * ninguém notar — é a classe da S-C150 (*guarda que depende do codegen só
 * protege depois de o codegen rodar*). Se alguém tirar a peneira, ou se um
 * campo novo escapar dela, o número abaixo sobe de zero e esta régua acusa
 * nomeando o campo.
 *
 * As duas garantias são complementares: a primeira diz que nulo não vira data
 * em lugar nenhum, a segunda diz que onde nulo É um gesto ele continua sendo.
 */

/** Todo schema exportado que é um objeto zod, com o nome pelo qual é citado. */
function schemasDoContrato(): Array<[string, any]> {
  return Object.entries<any>(gerado).filter(([, s]) => s?.shape && typeof s.safeParse === "function");
}

/** Todo campo de todo schema, achatado. */
function camposDoContrato(): Array<{ schema: string; campo: string; def: any }> {
  const saida: Array<{ schema: string; campo: string; def: any }> = [];
  for (const [schema, s] of schemasDoContrato()) {
    for (const [campo, def] of Object.entries<any>(s.shape)) {
      saida.push({ schema, campo, def });
    }
  }
  return saida;
}

describe("S-C281 — nulo não é data", () => {
  it("a população medida é grande o bastante para a régua significar alguma coisa", () => {
    // O piso da S-C46/S-C75: varredura sobre conjunto vazio é verde por não ter
    // olhado. O gerado tem 916 chamadas de data; os schemas de objeto que as
    // carregam são muitos mais que estes números, e o piso é conservador de
    // propósito — ele existe para reprovar o dia em que o `import` quebrar e o
    // objeto vier vazio, não para pregar a contagem exata do spec.
    expect(schemasDoContrato().length).toBeGreaterThan(200);
    expect(camposDoContrato().length).toBeGreaterThan(1000);
  });

  it("nenhum campo devolve uma Date quando recebe null", () => {
    const culpados = camposDoContrato()
      .filter(({ def }) => {
        const r = def.safeParse(null);
        return r.success && r.data instanceof Date;
      })
      .map(({ schema, campo }) => `${schema}.${campo}`);

    // Antes do conserto eram 31, e os quatro primeiros da lista eram de
    // dinheiro. O zero aqui é o que diz que a peneira do `dataDoCorpo()` está
    // ligada — e a lista nomeada é o que diz QUAL campo escapou, no dia em que
    // um escapar.
    expect(culpados).toEqual([]);
  });

  it("onde apagar É um gesto, o null continua chegando como null", () => {
    // A outra metade, e a que impede o conserto de virar regressão: a S-C232
    // tornou estes campos `nullable` no spec justamente para que esvaziar a
    // data no diálogo do contrato apague a data gravada. Se a peneira mordesse
    // aqui, o gesto do E224 voltaria a ser impossível — em silêncio, porque a
    // tela mandaria `null` e levaria 400.
    const gestos: Array<[string, string]> = [
      ["UpdateContratoBody", "dataRetirada"],
      ["UpdateContratoBody", "dataDevolucao"],
    ];
    for (const [schema, campo] of gestos) {
      const def = (gerado as any)[schema]?.shape?.[campo];
      expect(def, `${schema}.${campo} sumiu do spec`).toBeTruthy();
      const r = def.safeParse(null);
      expect(r.success, `${schema}.${campo} recusou o null que apaga`).toBe(true);
      expect(r.data, `${schema}.${campo} não devolveu null`).toBeNull();
    }
  });
});
