import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { conciliarExtrato, type TransacaoExtrato } from "@workspace/financeiro-core";
import { estadoDasConsultas, estadoDoCard } from "./estado-consulta";

/**
 * E121 — a tela para de afirmar zero enquanto não sabe.
 *
 * Duas metades, de propósito:
 *
 * 1. A DECISÃO, pura: `estadoDasConsultas` é o que fica entre a query e a
 *    afirmação. O app não tem infraestrutura de render (a mesma limitação
 *    documentada no `estado-erro.test.ts`), então o pixel fica com o
 *    Playwright e a regra fica aqui.
 *
 * 2. A VARREDURA das cinco telas do épico: o defeito era mecânico — a tela
 *    consome a query e não lê `isLoading`/`isError` nenhuma vez (o grep da
 *    trilha C achou 0 ocorrências em `mensagens/index.tsx`, a única das 44
 *    telas de loja nessa condição, e 0 nas duas queries da conciliação). O
 *    conserto também se afere mecanicamente: cada tela cita o estado de CADA
 *    consulta que ela mesma dispara. A busca é no arquivo INTEIRO (lição
 *    S-D7: varredura por linha tem fresta de prettier).
 */

describe("estadoDasConsultas — a regra de quando a tela pode afirmar", () => {
  const pronta = { isLoading: false, isError: false };
  const voando = { isLoading: true, isError: false };
  const falhada = { isLoading: false, isError: true };

  it("pronto é unânime: uma consulta em voo já proíbe a afirmação", () => {
    expect(estadoDasConsultas(pronta, voando)).toBe("carregando");
    expect(estadoDasConsultas(voando, voando, voando)).toBe("carregando");
  });

  it("todas respondidas: a tela pode afirmar — inclusive zero", () => {
    expect(estadoDasConsultas(pronta, pronta)).toBe("pronto");
  });

  it("erro ganha de carregando: esperar a outra só adia a mesma notícia", () => {
    expect(estadoDasConsultas(falhada, voando)).toBe("erro");
    expect(estadoDasConsultas(voando, falhada)).toBe("erro");
  });

  it("consulta desligada por permissão não prende a tela em carregando", () => {
    // `enabled: false` no react-query: isLoading e isError ficam falsos.
    const desligada = { isLoading: false, isError: false };
    expect(estadoDasConsultas(desligada)).toBe("pronto");
    expect(estadoDasConsultas()).toBe("pronto");
  });
});

/**
 * S-C120 — e o "pronto" da linha acima era o buraco.
 *
 * `estadoDasConsultas` diz, com razão, que consulta desligada não prende a tela
 * em carregando. O que ninguém tinha dito é que ela também não LIBERA a tela
 * para afirmar: a ficha da noiva lia "pronto" para uma consulta que nunca saiu
 * do navegador e desenhava *"Nenhum contrato ainda."* — para a Recepção, que tem
 * `contratos: NADA` desde o E172 e é quem atende o telefone.
 */
describe("estadoDoCard — 'não há' e 'você não pode ver' deixam de ser a mesma frase", () => {
  const pronta = { isLoading: false, isError: false };
  const voando = { isLoading: true, isError: false };

  it("sem permissão ganha de tudo — não há o que esperar nem o que repetir", () => {
    expect(estadoDoCard(false, pronta)).toBe("sem-permissao");
    expect(estadoDoCard(false, voando)).toBe("sem-permissao");
    expect(estadoDoCard(false, { isLoading: false, isError: true })).toBe("sem-permissao");
  });

  it("com permissão, as duas regras do E121 seguem intactas", () => {
    expect(estadoDoCard(true, voando)).toBe("carregando");
    expect(estadoDoCard(true, pronta)).toBe("pronto");
    expect(estadoDoCard(true, { isLoading: true, isError: true })).toBe("erro");
  });

  it("erro sem status conhecido é erro, não permissão", () => {
    expect(estadoDoCard(true, { isLoading: false, isError: true, error: new Error("rede") })).toBe(
      "erro",
    );
  });
});

describe("C2 — o veredito que a conciliação desenhava com o sistema ainda em voo", () => {
  it('um extrato de 45 transações contra `data ?? []` dá "Bateu 0 · Só no banco 45"', () => {
    // O extrato existe (o parse é local, instantâneo); as queries de parcelas
    // e pagamentos foram habilitadas NESTE render e ainda não responderam.
    const transacoes: TransacaoExtrato[] = Array.from({ length: 45 }, (_, i) => ({
      data: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
      descricao: `PIX noiva ${i + 1}`,
      valor: 100 + i,
    }));

    // O que a tela computava: `conciliarExtrato(transacoes, [])`, porque
    // `parcelas.data ?? []` e `pagamentos.data ?? []` valem [] em voo.
    const veredito = conciliarExtrato(transacoes, []);
    expect(veredito.casadas.length).toBe(0); //   "Bateu 0"
    expect(veredito.soExtrato.length).toBe(45); // "Só no banco 45"
    // ...e a instrução ao lado dizia "lance em receber ou pagar": obedecer é
    // contar o mesmo dinheiro duas vezes no caixa.

    // O que fica entre essa conta e a tela, agora:
    const parcelas = { isLoading: true, isError: false };
    const pagamentos = { isLoading: true, isError: false };
    expect(estadoDasConsultas(parcelas, pagamentos)).toBe("carregando");
  });

  it("uma query falhada não vira veredito para sempre: vira erro com saída", () => {
    const parcelas = { isLoading: false, isError: true };
    const pagamentos = { isLoading: false, isError: false };
    expect(estadoDasConsultas(parcelas, pagamentos)).toBe("erro");
  });
});

describe("E121 — as cinco telas leem o estado de cada consulta que disparam", () => {
  const pagina = (relativo: string) =>
    readFileSync(path.resolve(import.meta.dirname, "..", "pages", relativo), "utf-8");

  it("a conciliação gateia o veredito pelas DUAS consultas", () => {
    const fonte = pagina("financeiro/conciliacao.tsx");
    expect(fonte).toContain("estadoDasConsultas(parcelas, pagamentos)");
    // O useMemo do veredito exige as duas respostas — sem elas, null.
    expect(fonte).toMatch(/!parcelas\.data\s*\|\|\s*!pagamentos\.data/);
  });

  it("a fila do dia lê as três consultas das seções e cada seção tem o próprio erro", () => {
    const fonte = pagina("mensagens/index.tsx");
    expect(fonte).toContain("estadoDasConsultas(atendimentos, parcelas, orcamentos)");
    for (const q of ["atendimentos", "parcelas", "orcamentos"]) {
      expect(fonte, `${q}.isError não é lido pela seção`).toContain(`${q}.isError`);
      expect(fonte, `${q}.isLoading não é lido pela seção`).toContain(`${q}.isLoading`);
    }
  });

  it("o painel distingue falha de zero no dinheiro e na comissão", () => {
    const fonte = pagina("dashboard.tsx");
    // A query do painel serve os 4 contadores e os 2 cards de dinheiro.
    expect(fonte).toContain("painelQuery.isError");
    // "Minha comissão": falha não pode ficar indistinguível de "sem regra".
    expect(fonte).toContain("minhaComissao.isError");
  });

  it("a coluna do funil e a tela de permissões têm ramo de erro", () => {
    expect(pagina("noivas/funil.tsx")).toContain("isError");
    expect(pagina("permissoes/index.tsx")).toContain(
      "estadoDasConsultas(perfisQuery, overridesQuery)",
    );
  });
});
