import { describe, expect, it } from "vitest";
import { gerarContratoPdf, type DadosContrato } from "../lib/contrato-pdf";
import { desenharPdf } from "../lib/pdf-desenhista";

/**
 * **S-C170 — nenhuma linha desenhada passa da página, em NENHUM papel.**
 *
 * O E165 (P13) ensinou a quebra ao texto livre: as OBSERVAÇÕES passam por
 * `quebrarTexto` desde então. Mas a quebra morava no call-site, e todo call-site
 * seguinte a esqueceu: as linhas de parcela (`contrato-pdf.ts:109`), as de
 * cobrança extra (`:120`) e as de item (`:91`) chamavam `add()` cru. Medido com
 * sonda sobre `gerarContratoPdf`: a linha de `MORA` saía com **240 caracteres**
 * e a de `ATRASO_DEVOLUCAO` com **294**, para uma largura de **92** — e é
 * anterior ao conserto da S-C100: a MORA de 240 já saía da página no `main`
 * desde a S-C71, que tirou o corte sem que ninguém olhasse o papel.
 *
 * O conserto muda o DONO da quebra: ela sai dos call-sites e entra no
 * PAGINADOR (`pdf-desenhista.ts`), por onde toda linha de todo papel passa —
 * contrato, recibo e o próximo que nascer. É a mesma mudança de dono do E221
 * (o desenhista saiu de dentro do contrato): régua que depende de cada
 * chamador lembrar dela não é régua.
 *
 * A régua aqui é de EFEITO, não de letra (lição da S-C130): ela lê as linhas
 * que o PDF DESENHA (`(...) Tj`), não o que o montador quis desenhar — um
 * `add()` novo sem quebra reprova este arquivo no dia em que nascer.
 */

/** As linhas de texto realmente desenhadas, na ordem, com o escape desfeito. */
function linhasDesenhadas(bytes: Uint8Array): string[] {
  const txt = Buffer.from(bytes).toString("latin1");
  const out: string[] = [];
  const re = /\(((?:[^()\\]|\\.)*)\) Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt)) !== null) {
    out.push(m[1]!.replace(/\\([()\\])/g, "$1"));
  }
  return out;
}

const LARGURA = 92;

// A descrição real que a sonda da sobra mediu: a linha de ATRASO_DEVOLUCAO com
// a explicação inteira da 16ª, sem teto desde a S-C100 (o 200 era palpite
// sobre um banco sem teto).
const DESCRICAO_LONGA =
  "Atraso na devolucao do vestido - cláusula 16ª: aluguel proporcional por dia de atraso " +
  "contado da data de devolucao pactuada, acrescido da taxa diaria enquanto a peca nao " +
  "retornar ao atelie, conforme registrado na devolucao de 12/08/2026 pela recepcao, " +
  "com vistoria assinada pela costureira responsavel";

function dados(extra?: Partial<DadosContrato>): DadosContrato {
  return {
    lojaNome: "Moscow Noivas",
    noivaNome: "Ana Lima",
    valorTotal: "R$ 5.000,00",
    ...extra,
  };
}

describe("S-C170 — a cobrança extra cabe na página", () => {
  it(`nenhuma linha desenhada passa de ${LARGURA} caracteres — nem a de ${DESCRICAO_LONGA.length}`, () => {
    const bytes = gerarContratoPdf(
      dados({
        cobrancasExtras: [
          { descricao: DESCRICAO_LONGA, valor: "R$ 350,00", vencimento: "19/08/2026", forma: "Pix" },
        ],
        totalExtras: "R$ 350,00",
      }),
    );
    const linhas = linhasDesenhadas(bytes);
    const maisLonga = linhas.reduce((a, b) => (b.length > a.length ? b : a), "");
    expect(maisLonga.length, `linha de ${maisLonga.length}: "${maisLonga.slice(0, 60)}…"`).toBeLessThanOrEqual(LARGURA);
  });

  it("a quebra não come o texto — a frase chega inteira, só que em mais linhas", () => {
    const bytes = gerarContratoPdf(
      dados({
        cobrancasExtras: [{ descricao: DESCRICAO_LONGA, valor: "R$ 350,00" }],
      }),
    );
    // Rejunta as linhas e confere as pontas e o meio da frase — se o corte
    // engolisse um pedaço, é aqui que apareceria.
    const tudo = linhasDesenhadas(bytes).join(" ").replace(/\s+/g, " ");
    expect(tudo).toContain("Atraso na devolucao do vestido");
    expect(tudo).toContain("taxa diaria enquanto a peca nao retornar ao atelie");
    expect(tudo).toContain("vistoria assinada pela costureira responsavel");
    expect(tudo).toContain("R$ 350,00");
  });

  it("a parcela do plano com descrição longa quebra igual — mesma classe, porta ao lado", () => {
    const bytes = gerarContratoPdf(
      dados({
        parcelas: [{ descricao: DESCRICAO_LONGA.slice(0, 240), valor: "R$ 515,00", vencimento: "10/07/2026" }],
      }),
    );
    const linhas = linhasDesenhadas(bytes);
    expect(Math.max(...linhas.map((l) => l.length))).toBeLessThanOrEqual(LARGURA);
  });

  it("a continuação herda o recuo da lista — a segunda linha não volta à margem", () => {
    const bytes = gerarContratoPdf(
      dados({
        cobrancasExtras: [{ descricao: DESCRICAO_LONGA, valor: "R$ 350,00" }],
      }),
    );
    const linhas = linhasDesenhadas(bytes);
    const primeira = linhas.findIndex((l) => l.includes("Atraso na devolucao"));
    expect(primeira).toBeGreaterThan(-1);
    // A linha da lista abre com dois espaços; a continuação dela também deve
    // abrir com espaço, senão o texto quebrado se disfarça de item novo.
    expect(linhas[primeira + 1]!.startsWith(" ")).toBe(true);
  });

  it("o papel curto continua idêntico — a quebra só age em quem passa da largura", () => {
    const curto = gerarContratoPdf(
      dados({
        parcelas: [{ descricao: "Entrada", valor: "R$ 900,00", vencimento: "10/06/2026" }],
      }),
    );
    const linhas = linhasDesenhadas(curto);
    expect(linhas).toContain("  Entrada: R$ 900,00 · vence 10/06/2026");
  });

  it("a régua é do DESENHISTA — qualquer papel que passe por ele herda a quebra", () => {
    // Direto na camada que é a dona: um token cru, sem montador nenhum. É isto
    // que garante o recibo e o próximo papel sem que cada um repita o teste.
    const bytes = desenharPdf([{ tipo: "linha", text: DESCRICAO_LONGA, size: 10 }]);
    const linhas = linhasDesenhadas(bytes);
    expect(Math.max(...linhas.map((l) => l.length))).toBeLessThanOrEqual(LARGURA);
    expect(linhas.join(" ").replace(/\s+/g, " ")).toContain(
      "vistoria assinada pela costureira responsavel",
    );
  });
});
