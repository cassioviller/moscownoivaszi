import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * E169 — as duas telas onde o dinheiro é MIÚDO, cobradas mecanicamente.
 *
 * A tela de orçamento e a tela de contrato decidem, cada uma, meia dúzia de
 * coisas de dinheiro no meio do JSX: como se lê a quantidade digitada, quem
 * pode remover uma parcela, o que o alerta de divergência soma, que gesto
 * existe para desfazer um desconto. Nenhuma dessas decisões tinha régua — e a
 * régua 26 diz o que acontece quando o mesmo cuidado é LEMBRADO em vez de
 * cumprido: o sítio que esquece é o que quebra.
 *
 * Estas sondas leem o FONTE das duas telas. Elas não substituem os testes das
 * funções puras ao lado (que provam a régua): elas provam que a tela CHAMA a
 * régua, que é a fronteira onde os seis achados desta faixa moravam.
 *
 * Lição S-D7/regra 13 aplicada: a busca é no arquivo inteiro, com `\s*` entre
 * os pedaços — o prettier quebra linha no meio do par e esconde o ofensor.
 */

const RAIZ = join(import.meta.dirname, "..");
const ORCAMENTO = "pages/orcamentos/[id].tsx";
const CONTRATO = "pages/contratos/[id].tsx";

function fonte(relativo: string): string {
  return readFileSync(join(RAIZ, relativo), "utf-8");
}

/** O fonte sem comentários — eles CITAM o código errado para explicar o conserto. */
function fonteSemComentarios(relativo: string): string {
  return fonte(relativo)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Os handlers de uma tela são `const onNome = async (...) => { … };` com dois
 * espaços de indentação — o fecho é uma linha que é exatamente `  };`. Devolve
 * o nome e o corpo de cada um.
 */
function handlers(relativo: string): { nome: string; corpo: string }[] {
  const texto = fonteSemComentarios(relativo);
  const achados: { nome: string; corpo: string }[] = [];
  const abre = /^ {2}const (on[A-Z]\w*) = async[^\n]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = abre.exec(texto)) !== null) {
    const inicio = m.index;
    const fecha = texto.indexOf("\n  };", inicio);
    if (fecha === -1) continue;
    achados.push({ nome: m[1], corpo: texto.slice(inicio, fecha) });
  }
  return achados;
}

describe("varredura: a tela de orçamento e o dinheiro miúdo", () => {
  /**
   * O6 — `Number("3un")` é NaN, `NaN || 1` é 1, e a guarda `< 1` nunca
   * dispara: 3 véus de R$ 800,00 entravam como 1, R$ 1.600,00 a menos, sem um
   * toast. O valor unitário ao lado nunca teve esse buraco — ele passa por
   * `parseValor`. A quantidade passa a ter a irmã dela, `parseQuantidade`.
   */
  it("O6 · a quantidade do item não é lida com Number() cru", () => {
    const texto = fonteSemComentarios(ORCAMENTO);
    expect(
      /Number\(\s*values\.quantidade\s*\)/.test(texto),
      "a quantidade digitada ainda passa por `Number(values.quantidade)` — " +
        "use `parseQuantidade`, que separa 'não digitou' de 'digitou bobagem'",
    ).toBe(false);
    expect(texto).toContain("parseQuantidade");
  });

  /**
   * O14 — `valor <= 0` é recusado no cliente, e não existia outro gesto no
   * frontend inteiro que zerasse `descontoValor`. Quem quis dar R$ 20,00 e
   * deixou o seletor em PERCENTUAL tirava R$ 1.000,00 de um orçamento de
   * R$ 5.000,00 e só desfazia refazendo tudo. O servidor sempre aceitou 0.
   */
  it("O14 · existe o gesto que REMOVE o desconto (o servidor sempre aceitou 0)", () => {
    const texto = fonteSemComentarios(ORCAMENTO);
    expect(
      /descontoValor:\s*0\b/.test(texto),
      "nenhuma escrita da tela manda `descontoValor: 0` — não há como remover um " +
        "desconto aplicado por engano sem refazer o orçamento",
    ).toBe(true);
  });

  /**
   * O13 — quatro escritas chamavam `invalidar()` e nunca `invalidarLista()`,
   * que existe uma linha ao lado: R$ 500,00 de diferença entre duas telas do
   * mesmo sistema por até 30 segundos, com a noiva ao lado. A régua é uma só —
   * escreveu no orçamento, as DUAS visões dele recarregam.
   */
  it("O13 · toda escrita do orçamento invalida também a LISTA", () => {
    const MUTACOES = /(addItem|updateItem|removeItem|atualizar|aprovar|recusar|criarLink|desfazerAceite)\.mutateAsync/;
    const ofensores = handlers(ORCAMENTO)
      .filter((h) => MUTACOES.test(h.corpo))
      .filter((h) => !h.corpo.includes("invalidarLista"))
      .map((h) => h.nome);
    expect(
      ofensores,
      "estes handlers escrevem no orçamento e não recarregam a lista — o card da " +
        "lista fica com o valor velho (O13)",
    ).toEqual([]);
  });

  /**
   * O10 — o select filtrava vendedora inativa e o servidor não: a comissão de
   * R$ 5.000,00 ficava em nome de quem não trabalha mais na loja, com o campo
   * EM BRANCO na tela.
   */
  it("O10 · o select de vendedora sai da régua única, não de um filter inline", () => {
    const texto = fonteSemComentarios(ORCAMENTO);
    expect(
      /\.filter\(\s*\(m\)\s*=>\s*m\.ativo\s*!==\s*false\s*\)/.test(texto),
      "o filtro de equipe ainda é inline na tela — a selecionada inativa some da " +
        "lista e o campo desenha vazio (O10)",
    ).toBe(false);
    expect(texto).toContain("opcoesDeVendedora");
  });

  /**
   * O11 — a tela exigia `editar` onde o servidor deriva `criar`: o
   * `POST /orcamentos/:id/itens` termina em substantivo, então `acaoDoRequest`
   * devolve `criar`. A estagiária com `{ver, criar}` — perfil que o próprio
   * repositório nomeia como real — criava o orçamento e não conseguia pôr uma
   * linha nele. O precedente é `contratos/[id].tsx`, que separa
   * `podeCriarParcela` de `podeEditar` desde o E115.
   */
  it("O11 · a tela distingue criar de editar, como o servidor", () => {
    const texto = fonteSemComentarios(ORCAMENTO);
    expect(
      /podeNoModulo\(\s*acessosModulos\s*,\s*"leads"\s*,\s*"criar"\s*\)/.test(texto),
      "a tela de orçamento só pergunta por `editar` — quem tem `criar` sem `editar` " +
        "não vê o formulário de item que o servidor aceitaria (O11)",
    ).toBe(true);
  });
});

describe("varredura: a tela de contrato e o dinheiro miúdo", () => {
  /**
   * P6 — a tela usava `estaAberta` (PREVISTA + PARCIAL) para oferecer
   * "Remover"; o servidor só aceita PREVISTA. O toast dizia "Só parcelas em
   * aberto podem ser removidas" sobre uma parcela que ESTÁ em aberto.
   */
  it("P6 · 'Remover' obedece à régua do servidor, não a `estaAberta`", () => {
    const texto = fonteSemComentarios(CONTRATO);
    expect(
      texto.includes("podeRemoverParcela"),
      "o botão Remover ainda nasce de `estaAberta` — em PARCIAL ele leva a um 422 " +
        "cuja frase se contradiz (P6)",
    ).toBe(true);
  });

  /**
   * P8 — o alerta somava AVULSA e AVARIA junto com o carnê e comparava com
   * `valorTotal`: num contrato de R$ 5.000,00 com um reparo de R$ 350,00 ele
   * acende sobre um estado que o servidor considera correto.
   */
  it("P8 · o alerta de divergência compara só o CARNÊ", () => {
    const texto = fonteSemComentarios(CONTRATO);
    expect(
      /somaCentavos\(\s*parcelas\.filter\(\s*\(p\)\s*=>\s*p\.status\s*!==\s*"CANCELADA"\s*\)/.test(
        texto,
      ),
      "o total do plano ainda soma toda parcela não-cancelada — a de avaria entra e " +
        "o alarme toca sozinho (P8)",
    ).toBe(false);
    expect(texto).toContain("totalDoCarneCentavos");
  });

  /**
   * P7 — removida uma parcela do carnê, `temCarne` seguia verdadeiro e o
   * formulário sumia para sempre: não havia gesto que devolvesse os R$ 500,00.
   */
  it("P7 · o formulário reabre quando falta parcela no carnê", () => {
    const texto = fonteSemComentarios(CONTRATO);
    expect(
      texto.includes("faltanteDoCarneCentavos"),
      "a tela ainda esconde o gerar-plano por `!temCarne` puro — carnê com buraco " +
        "não tem por onde ser completado (P7)",
    ).toBe(true);
  });
});

/**
 * Conjunto vazio aprova tudo em silêncio (S-D31). As duas telas são os
 * arquivos mais quentes do gate; se alguma sumir do versionamento, a sonda
 * inteira acima passa a não olhar nada.
 */
describe("varredura: as telas existem", () => {
  it("as duas telas estão versionadas e têm tamanho de tela de verdade", () => {
    const versionados = arquivosVersionados(RAIZ, ["pages"]);
    expect(versionados).toContain(ORCAMENTO);
    expect(versionados).toContain(CONTRATO);
    expect(fonte(ORCAMENTO).split("\n").length).toBeGreaterThan(500);
    expect(fonte(CONTRATO).split("\n").length).toBeGreaterThan(300);
  });
});
