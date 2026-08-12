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

/**
 * **S-O64 (E187) — o desconto que se EXIBE é a diferença real, e é uma régua.**
 *
 * O O9 (E166) tirou o `descontoValor` cru da página pública e pôs a subtração
 * no lugar. O conserto ficou no ARQUIVO: o portal da noiva — o outro link que a
 * loja manda pelo WhatsApp, com a mesma proposta — seguiu imprimindo o valor
 * gravado nos dois blocos, e a tela do orçamento também. Com desconto em VALOR
 * de R$ 5.000,00 sobre R$ 4.800,00 de itens (gravável até o E174), a MESMA
 * proposta dizia "Desconto R$ 5.000,00 · Total R$ 0,00" num link e
 * "− R$ 4.800,00 · Total R$ 0,00" no outro.
 *
 * A régua é `linhaDeDesconto`, e o `brl(…descontoValor)` é a assinatura de quem
 * não a chamou: aquele número é o que foi PEDIDO, não o que foi tirado.
 */
describe("S-O64 — a linha do desconto mostra o abatimento, não o valor gravado", () => {
  it("nenhuma tela imprime o `descontoValor` como dinheiro", () => {
    const ofensores = arquivosDeTela().filter((arquivo) =>
      /brl\(\s*[\w.!]*descontoValor/.test(fonteDe(arquivo)),
    );
    expect(
      ofensores,
      "o número exibido é bruto − líquido (`linhaDeDesconto`): com desconto em VALOR maior que " +
        "a soma dos itens, o valor gravado não fecha com o total, que clampa em zero (S-O64)",
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
   * **S-O65 (E187) — a dívida das telas internas era 8 e é ZERO.**
   *
   * O E181 a travou em oito por regra 31 (contar, não zerar): `comissoes` ×3,
   * `noivas/[leadId]/portal.tsx` ×4 e `noivas/[leadId]/lookbook.tsx` ×1. As
   * oito eram a MESMA frase: a guarda perguntava pelo `?.` (`data?.length ?? 0`,
   * `portalVivo(portal)`) e o corpo respondia pelo `!`. Duas consts e um
   * predicado de tipo (`portalVivo`, como o `temDesconto` da S-O13) tiraram as
   * oito sem uma linha de lógica nova, e o teto vira zero: a nona fica vermelha
   * como as das públicas.
   */
  it("as telas internas também não têm nenhuma asserção `x!.`", () => {
    const publicas = new Set(paginasPublicas());
    const dentro = arquivosDeTela()
      .filter((a) => !publicas.has(a))
      .flatMap(assercoes);
    expect(
      dentro,
      "a asserção sobrevive a quem mexer na guarda de cima: ponha a ausência na PERGUNTA " +
        "(uma const, ou um predicado de tipo na régua que já responde) (S-O65)",
    ).toEqual([]);
  });
});

/**
 * **S-O66 (E187) — o recorte passa a pegar quem afirma e PASSA ADIANTE.**
 *
 * O recorte de cima é `nome!.` — afirmar e desreferenciar no mesmo gesto.
 * `brutoEmCentavos(contrato.itens!)` escapava dele por afirmar e entregar o
 * valor a OUTRA função: sem itens, a soma era de `undefined`, e o estrago sai
 * do arquivo que o afirmou.
 *
 * A pergunta que a sobra fazia era se a varredura devia crescer, e a resposta
 * saiu da contagem. `nome!` em qualquer forma são **587 ocorrências em 122
 * telas**, e **23 nomes distintos** — mas CINCO deles somam 561 (95,6%):
 * `activeLojaId` (478), `id` (35), `leadId` (24), `bloqueioId` (15) e `token`
 * (9). São a sessão e os parâmetros de rota que o roteador garante, e o E181 já
 * os tinha deixado de fora de propósito. Fora esses cinco, sobram **26
 * ocorrências em 18 nomes** — uma população que se lê numa sentada.
 *
 * Então o recorte cresce com a lista de dispensa NOMEADA, e a dívida do que
 * resta fica travada (regra 31). Das 26, uma é falso positivo de string
 * (`"Bem-vinda à equipe!"` em `convite.tsx`, que o `[,);\]}:]` já não pega),
 * **duas eram a classe** — e a sobra nomeava UMA. A varredura achou a segunda
 * na primeira execução: `abertoEmCentavos(c.parcelas!)` na ficha da noiva,
 * afirmando o carnê sob a mesma guarda de `?.length ?? 0`. As **23** que ficam
 * são de outro feitio: escalares que o ramo de cima já perguntou na mesma
 * função, uma linha acima (`casamentoData!` sob o `agruparPorMes` de quem tem
 * data, `proximaProva!` sob o `&&` dela, `compParam!` sob `competenciaValida`),
 * e nenhuma delas entrega o dado a uma soma. A 24ª fica vermelha aqui.
 */
const GARANTIDOS_PELO_ROTEADOR = new Set(["activeLojaId", "id", "leadId", "bloqueioId", "token"]);

/** `nome!` seguido do que fecha uma expressão — nunca `!.` (o recorte de cima). */
const ASSERCAO_PASSADA_ADIANTE = /\b([a-zA-Z_][\w]*)!\s*(?=[,);\]}:])/g;

function assercoesPassadasAdiante(relativo: string): string[] {
  return [...fonteDe(relativo).matchAll(ASSERCAO_PASSADA_ADIANTE)]
    .map((m) => m[1]!)
    .filter((nome) => !GARANTIDOS_PELO_ROTEADOR.has(nome))
    .map((nome) => `${relativo} → ${nome}!`);
}

describe("S-O66 — afirmar e passar adiante é a mesma classe, um arquivo mais longe", () => {
  /**
   * O que separa esta classe das outras 23 é o ESTRAGO, e ele é de dinheiro:
   * `itens` e `parcelas` são as coleções que o core soma. Sem elas a conta não
   * estoura — ela sai errada, dentro de outra função, no arquivo ao lado.
   */
  it("nenhuma tela entrega uma coleção AFIRMADA para o dinheiro somar", () => {
    const ofensores = arquivosDeTela()
      .flatMap(assercoesPassadasAdiante)
      .filter((o) => /→ (itens|parcelas)!$/.test(o));
    expect(
      ofensores,
      "o `!` some quando a coleção sai da consulta para uma const (ou para um `&&`): a estreita " +
        "atravessa a função, e sem ela a soma seria de `undefined` (S-O66)",
    ).toEqual([]);
  });

  it("a dívida do recorte novo está travada em 23", () => {
    const dentro = arquivosDeTela().flatMap(assercoesPassadasAdiante);
    expect(dentro.length, `asserções vivas:\n${dentro.join("\n")}`).toBe(23);
  });

  it("os cinco nomes dispensados são a maioria esmagadora — a lista é curta por medida", () => {
    const todos = arquivosDeTela().flatMap((a) => [
      ...fonteDe(a).matchAll(ASSERCAO_PASSADA_ADIANTE),
    ]);
    const dispensados = todos.filter((m) => GARANTIDOS_PELO_ROTEADOR.has(m[1]!)).length;
    // 95,6% em 2026-08-12: dispensar por NOME é o que torna o recorte contável.
    expect(dispensados / todos.length).toBeGreaterThan(0.9);
  });
});
