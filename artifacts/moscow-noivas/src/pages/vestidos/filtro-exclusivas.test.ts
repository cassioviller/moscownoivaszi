import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * **S-C22 — o recorte da peça exclusiva (cláusula 12ª) existe no acervo.**
 *
 * O E216 deixou o custo declarado: `exclusiva` é **coluna do vestido**, não
 * atributo de catálogo, então ela não entra por `atributos=` como decote e
 * volume entram — e não havia como perguntar ao acervo *quais peças carregam a
 * multa da 12ª*.
 *
 * **A população corrigiu a sobra**: ela dizia *"132 peças em `moscow_base` e
 * ZERO marcadas"*. Medido no `heliumdb`, que é o banco de `DATABASE_URL`
 * (a lição de `1d9ccff`): **514 peças, e as ZERO seguem zero.**
 *
 * E é por isso que a régua é de FIAÇÃO e não de tela renderizada: com zero
 * peças exclusivas, um teste que montasse a lista passaria com o filtro ligado
 * ou desligado — verde nos dois lados do conserto, que é o defeito que a
 * S-C100 nomeou. O que dá para afirmar sem inventar população é que as **cinco
 * pontas do filtro estão ligadas**: o parâmetro na URL, o predicado, o chip, a
 * conta de "tem filtro ativo" e o botão.
 *
 * Entrar agora e não *"no dia em que a loja marcar as primeiras"* é a escolha
 * que a própria sobra sugeria pelo avesso: **é nesse dia que a pergunta
 * nasce**, e quem acabou de marcar cinco peças entre 514 precisa achá-las para
 * conferir — sem o recorte, rolando a lista inteira olhando selo por selo.
 */

const TELA = join(import.meta.dirname, "index.tsx");

describe("S-C22 — o acervo sabe recortar as peças exclusivas", () => {
  const fonte = readFileSync(TELA, "utf8");

  it("a tela tem o que varrer — piso (S-C260)", () => {
    expect(fonte.split("\n").length).toBeGreaterThan(600);
  });

  it("o filtro mora na URL, como todos os outros desta tela (E129/D5)", () => {
    // Estado de filtro fora da URL não viaja no link e se perde na ida-e-volta
    // ao detalhe do vestido — a decisão do E129 vale para o sexto filtro igual.
    expect(fonte).toMatch(/searchParams\.get\("exclusivas"\)\s*===\s*"1"/);
    expect(fonte).toContain('definirFiltroUrl("exclusivas"');
  });

  it("o predicado recorta pela COLUNA, e não por atributo de catálogo", () => {
    // `exclusiva` é decisão da loja sobre a peça (12ª), não característica de
    // catálogo: passar por `atributos=` seria a segunda grafia do mesmo dado.
    expect(fonte).toMatch(/if \(soExclusivas && !v\.exclusiva\) return false;/);
  });

  it("as outras três pontas estão ligadas — chip, contagem de ativos e botão", () => {
    // A lição da S-C87: o predicado existir não prova que a tela o oferece, e
    // um filtro aplicado que não aparece nos chips é filtro que a vendedora
    // esquece ligado e não entende por que o acervo "sumiu".
    expect(fonte).toContain('chips.push("Só exclusivas")');
    expect(fonte).toMatch(/temFiltrosAtivos[\s\S]{0,200}soExclusivas/);
    expect(fonte).toContain('data-testid="toggle-so-exclusivas"');
    expect(fonte).toContain("Só exclusivas");
  });

  it("o botão NÃO depende da data escolhida — a 12ª é do acervo, não do calendário", () => {
    // O "Só disponíveis" ao lado só existe com data selecionada, porque a
    // disponibilidade é uma pergunta sobre um dia. "Quais peças carregam a
    // multa da 12ª" não é: ela vale sempre.
    const trecho = fonte.slice(fonte.indexOf('data-testid="toggle-so-exclusivas"') - 600);
    const antesDoBotao = trecho.slice(0, trecho.indexOf('data-testid="toggle-so-exclusivas"'));
    // O `{dataSelecionada && (` que embrulha o botão vizinho tem de estar
    // FECHADO antes deste — senão o recorte da 12ª herdaria a condição dele.
    expect(antesDoBotao).toContain(")}");
  });
});
