import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * E181 — as duas réguas que as telas re-escreviam em vez de chamar.
 *
 * 1. **S-O13** — a pergunta "este registro tem desconto?" é `temDesconto`
 *    (P15/E163). Havia **quatro** sítios com a expressão à mão (a sobra
 *    nomeava três): a proposta e o CONTRATO no portal da noiva, a página
 *    pública e a linha do subtotal do orçamento. A expressão inline acerta
 *    hoje e é a quinta grafia de uma régua que já tem dona (regra 26).
 *
 * 2. **S-O16** — a página pública afirmava `dados!` em **20** lugares (a sobra
 *    dizia dezoito), e o portal da noiva em **41**. Nenhuma delas estava
 *    errada: o ramo de erro retorna antes. A asserção é o que sobrevive à
 *    refatoração do ramo acima — e aí a noiva, sem sessão e sem menu, fica
 *    com a tela em branco no link que a loja mandou por WhatsApp.
 *
 * As páginas PÚBLICAS saem do roteador, não de uma lista aqui: é rota de
 * `:token` em `App.tsx`, que é a definição exata de "abre sem sessão".
 *
 * O recorte da asserção é `nome!.` — afirmar e desreferenciar no mesmo gesto.
 * `activeLojaId!` e `bloqueioId!` sozinhos ficam de fora de propósito: são
 * parâmetros de rota que o roteador garante, e são centenas.
 */

const RAIZ = join(import.meta.dirname, "..");

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function fonteDe(relativo: string): string {
  return semComentarios(readFileSync(join(RAIZ, relativo), "utf-8"));
}

function arquivosDeTela(): string[] {
  return arquivosVersionados(RAIZ, ["pages", "components"]).filter(
    (r) => /\.tsx?$/.test(r) && !r.includes(".test."),
  );
}

/** As telas que abrem SEM sessão — as rotas de `:token` do `App.tsx`. */
function paginasPublicas(): string[] {
  const app = readFileSync(join(RAIZ, "App.tsx"), "utf-8");
  const nomes = [...app.matchAll(/<Route\s+path="\/[^"]*\/:token"\s+element=\{<(\w+)\s*\/>\}/g)].map(
    (m) => m[1]!,
  );
  return nomes.map((nome) => {
    const imp = new RegExp(`const ${nome} = lazy\\(\\(\\) => import\\("@/(pages/[^"]+)"\\)\\)`).exec(app);
    if (!imp) throw new Error(`rota pública ${nome} sem import correspondente em App.tsx`);
    return `${imp[1]}.tsx`;
  });
}

const ASSERCAO = /\b([a-zA-Z_][\w]*)!\./g;

function assercoes(relativo: string): string[] {
  return [...fonteDe(relativo).matchAll(ASSERCAO)].map((m) => `${relativo} → ${m[1]}!`);
}

describe("S-O13 — a pergunta do desconto tem dona", () => {
  it("nenhuma tela reescreve `descontoTipo && descontoValor` — a régua é `temDesconto`", () => {
    const ofensores = arquivosDeTela().filter((arquivo) =>
      // O `!` entra no caminho de propósito: a primeira versão desta varredura
      // perdeu `dados!.descontoTipo && dados!.descontoValor` da página pública,
      // que era o sítio com as DUAS coisas erradas ao mesmo tempo.
      /\.descontoTipo\s*&&\s*[\w.!]+\.descontoValor/.test(fonteDe(arquivo)),
    );
    expect(
      ofensores,
      "a expressão inline é a régua do `temDesconto` reescrita à mão (P15/E163): tipo com " +
        "valor 0 é SEM desconto, e quem pergunta pergunta lá (S-O13)",
    ).toEqual([]);
  });
});

describe("S-O16 — a tela que a noiva abre não afirma o dado da consulta", () => {
  it("as páginas públicas não têm nenhuma asserção `x!.`", () => {
    const ofensores = paginasPublicas().flatMap(assercoes);
    expect(
      ofensores,
      "a página abre sem sessão e sem menu: com o dado ausente, a asserção estoura e a noiva " +
        "fica com a tela em branco. Ponha a ausência na PERGUNTA (`isError || !dados`) (S-O16)",
    ).toEqual([]);
  });

  it("a varredura olha o roteador de verdade — as quatro rotas de token", () => {
    expect(paginasPublicas().length).toBeGreaterThanOrEqual(4);
    expect(arquivosDeTela().length).toBeGreaterThan(100);
  });

  /**
   * A dívida das telas INTERNAS fica contada, não zerada (regra 31): quem tem
   * sessão tem menu, e o estrago é outro. **Oito**, em 2026-08-12:
   * `comissoes/index.tsx` ×3, `noivas/[leadId]/portal.tsx` ×4 e
   * `noivas/[leadId]/lookbook.tsx` ×1. A nona fica vermelha aqui.
   */
  it("a dívida das telas internas está travada em 8", () => {
    const publicas = new Set(paginasPublicas());
    const dentro = arquivosDeTela()
      .filter((a) => !publicas.has(a))
      .flatMap(assercoes);
    expect(dentro.length, `asserções vivas:\n${dentro.join("\n")}`).toBe(8);
  });
});
