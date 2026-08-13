import { describe, expect, it } from "vitest";
import { gerarContratoPdf, quebrarTexto, type DadosContrato } from "../lib/contrato-pdf";
import { pdfDoContrato, type ContratoComPapel } from "../lib/contrato-do-papel";

/**
 * E165 — o PDF fala a verdade e cabe na página.
 *
 * O ângulo 07 revisou o dinheiro inteiro e não achou um centavo errado; a
 * fatia 2 olhou o PAPEL e achou cinco defeitos no documento assinável. A
 * aritmética estava certa — o que se imprimia dela, não.
 */

// A extração normaliza duas representações do stream: o NBSP que o `brl` põe
// entre "R$" e o número, e o escape de parênteses do formato PDF — sem isso o
// golden test compararia bytes de codificação, não texto lido por gente.
const texto = (bytes: Uint8Array) =>
  Buffer.from(bytes)
    .toString("latin1")
    .replace(/\u00a0/g, " ")
    .replace(/\\([()])/g, "$1");

/** Todas as posições `1 0 0 1 x y Tm` dos content streams, na ordem. */
function posicoes(bytes: Uint8Array): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const re = /1 0 0 1 (\d+) (-?\d+) Tm/g;
  let m: RegExpExecArray | null;
  const txt = texto(bytes);
  while ((m = re.exec(txt)) !== null) out.push({ x: Number(m[1]), y: Number(m[2]) });
  return out;
}

function contarPaginas(bytes: Uint8Array): number {
  const m = texto(bytes).match(/\/Count (\d+)/);
  return m ? Number(m[1]) : 0;
}

function dadosComParcelas(n: number): DadosContrato {
  return {
    lojaNome: "Moscow Noivas",
    noivaNome: "Ana Lima",
    valorTotal: "R$ 9.000,00",
    parcelas: [
      { descricao: "Entrada", valor: "R$ 900,00", vencimento: "10/06/2026" },
      ...Array.from({ length: n }, (_, i) => ({
        descricao: `Parcela ${i + 1}/${n}`,
        valor: "R$ 450,00",
        vencimento: "10/07/2026",
      })),
    ],
    observacao: "Multa de R$ 150,00 por dia de atraso na devolucao.",
  };
}

describe("E165 — P11: a paginação, com as assinaturas SEMPRE na página", () => {
  it("com 18 parcelas nenhuma linha desce abaixo da margem, e as assinaturas existem", () => {
    /**
     * VERMELHO ANTES (medido no achado, replicando a aritmética): entrada + 18
     * parcelas = 19 linhas; "OBSERVACOES" caía em y=62 e as linhas do bloco de
     * assinatura em y=−15, −33, −59 e −77 — o PDF saía válido, abria
     * normalmente, e NÃO TINHA onde a noiva e a loja assinam.
     */
    const bytes = gerarContratoPdf(dadosComParcelas(18));
    const pos = posicoes(bytes);
    expect(pos.length).toBeGreaterThan(0);
    expect(Math.min(...pos.map((p) => p.y))).toBeGreaterThanOrEqual(60);
    expect(contarPaginas(bytes)).toBeGreaterThanOrEqual(2);
    const txt = texto(bytes);
    expect(txt).toContain("__________________________________");
    expect(txt).toContain("Ana Lima");
  });

  it("com 36 parcelas o carnê inteiro é impresso — nenhuma linha some", () => {
    // VERMELHO ANTES: com 36 parcelas, seis linhas do próprio carnê sumiam.
    const bytes = gerarContratoPdf(dadosComParcelas(36));
    const txt = texto(bytes);
    for (let i = 1; i <= 36; i++) {
      expect(txt).toContain(`Parcela ${i}/36`);
    }
    expect(Math.min(...posicoes(bytes).map((p) => p.y))).toBeGreaterThanOrEqual(60);
    // E a observação — que sumia com 24+ — continua lá.
    expect(txt).toContain("Multa de R$ 150,00");
  });

  it("o contrato curto continua numa página só — paginar não é espalhar", () => {
    const bytes = gerarContratoPdf({ lojaNome: "L", noivaNome: "Bia", valorTotal: "R$ 2.000,00" });
    expect(contarPaginas(bytes)).toBe(1);
  });
});

describe("E165 — P13/P14: o texto que chega inteiro", () => {
  it("P13 · a observação longa quebra em linhas, e o \\n digitado vira quebra", () => {
    const obs =
      "Primeira clausula: a retirada acontece ate 3 dias antes do casamento e a devolucao ate 2 dias depois.\n" +
      "Multa de R$ 150,00 por dia de atraso na devolucao da peca.";
    /**
     * VERMELHO ANTES: uma linha única de Tj em x=50 — a partir de ~95
     * caracteres o resto era desenhado FORA da página, e o que ficava de fora
     * no exemplo medido era a multa de R$ 150,00 por dia.
     */
    const linhas = quebrarTexto(obs);
    expect(linhas.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...linhas.map((l) => l.length))).toBeLessThanOrEqual(92);

    const txt = texto(gerarContratoPdf({ lojaNome: "L", noivaNome: "Ana", observacao: obs }));
    expect(txt).toContain("Multa de R$ 150,00");
  });

  it("P14 · o menos tipográfico vira hífen, não '?'", () => {
    /**
     * VERMELHO ANTES: «Desconto: ?R$ 500,00 (10%)» em TODO contrato com
     * desconto, nos dois chamadores — o abatimento sem sinal, lido como mais
     * uma cobrança.
     */
    const txt = texto(
      gerarContratoPdf({
        lojaNome: "L",
        noivaNome: "Ana",
        subtotal: "R$ 5.000,00",
        desconto: "−R$ 500,00 (10%)",
        valorTotal: "R$ 4.500,00",
      }),
    );
    expect(txt).toContain("Desconto: -R$ 500,00");
    expect(txt).not.toContain("?R$");
  });
});

describe("E165 — P10/P12: o papel conta a história verdadeira", () => {
  const base = {
    id: "c1",
    lojaId: "l1",
    leadId: "n1",
    valorTotal: 5000,
    status: "ATIVO",
    fechadoEm: new Date("2026-08-01T15:00:00Z"),
    loja: { nome: "Moscow Noivas" },
    lead: { noivaNome: "Ana Lima" },
    itens: [],
    parcelas: [
      { numero: 0, origem: "PLANO", descricao: "Entrada", valorPrevisto: 1000, vencimento: new Date("2026-09-10T12:00:00Z"), status: "PREVISTA" },
      { numero: 1, origem: "PLANO", descricao: "Parcela 1/2", valorPrevisto: 2000, vencimento: new Date("2026-10-10T12:00:00Z"), status: "PREVISTA" },
      { numero: 2, origem: "PLANO", descricao: "Parcela 2/2", valorPrevisto: 2000, vencimento: new Date("2026-11-10T12:00:00Z"), status: "PREVISTA" },
      { numero: 3, origem: "AVARIA", descricao: "Reparo de avaria - barra", valorPrevisto: 350, vencimento: new Date("2026-10-20T12:00:00Z"), status: "PREVISTA" },
    ],
  } as unknown as ContratoComPapel;

  it("P12 · a avaria sai do plano e ganha seção própria com o subtotal", () => {
    /**
     * VERMELHO ANTES: R$ 5.350,00 listados sob "Valor total: R$ 5.000,00",
     * sem nenhuma linha que reconciliasse — e o PDF regerado a cada download
     * fazia o contrato assinado por um valor imprimir outro.
     */
    const txt = texto(pdfDoContrato(base));
    expect(txt).toContain("Plano de pagamento:");
    expect(txt).toContain("Cobrancas fora do valor total");
    expect(txt).toContain("Reparo de avaria - barra");
    expect(txt).toContain("Total das cobrancas extras: R$ 350,00");

    // O carnê impresso soma exatamente o valor total: 1000+2000+2000 = 5000.
    const doPlano = txt.split("Cobrancas fora do valor total")[0];
    expect(doPlano).toContain("Entrada: R$ 1.000,00");
    expect(doPlano).toContain("Parcela 1/2: R$ 2.000,00");
    expect(doPlano).not.toContain("Reparo de avaria");
  });

  it("P10 · o contrato cancelado imprime a tarja e as parcelas canceladas marcadas", () => {
    /**
     * VERMELHO ANTES: a rota não filtrava status, o montador descartava as
     * CANCELADAs, a seção do plano sumia — e o papel de um contrato morto
     * parecia um contrato à vista em aberto, sem uma palavra sobre o
     * cancelamento.
     */
    const cancelado = {
      ...base,
      status: "CANCELADO",
      canceladoEm: new Date("2026-08-10T18:00:00Z"),
      parcelas: base.parcelas.map((p) => ({ ...p, status: "CANCELADA" })),
    } as unknown as ContratoComPapel;
    const txt = texto(pdfDoContrato(cancelado));
    expect(txt).toContain("*** CANCELADO EM 10/08/2026 ***");
    expect(txt).toContain("Entrada (cancelada)");
    expect(txt).toContain("Parcela 1/2 (cancelada)");
  });

  it("P10 · o contrato vivo segue SEM tarja e sem as canceladas", () => {
    const comCancelada = {
      ...base,
      parcelas: [
        ...base.parcelas,
        { numero: 4, origem: "AVULSA", descricao: "Cobranca cancelada", valorPrevisto: 99, vencimento: new Date("2026-10-01T12:00:00Z"), status: "CANCELADA" },
      ],
    } as unknown as ContratoComPapel;
    const txt = texto(pdfDoContrato(comCancelada));
    expect(txt).not.toContain("***");
    expect(txt).not.toContain("Cobranca cancelada");
  });
});
