import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E6/E8 (E99) — a escala de dinheiro, defendida onde ela mora.
 *
 * Medido antes de escrever: **92 lugares** do app renderizam `brl()`, com **28
 * combinações de classe** diferentes — e **58 sem `tabular-nums`**, que é
 * exatamente o que faz coluna de número deixar de alinhar. O épico falava em
 * "quatro tipografias"; são vinte e oito.
 *
 * Este teste não persegue os 92 — o cuidado (a) do épico proíbe transformá-lo
 * numa reescrita. Ele defende as duas coisas que, mudando em silêncio, desfazem
 * a decisão: **os três degraus existem e todos levam `tabular-nums`**, e
 * **dinheiro grande não volta a ser `text-primary`** (E8), que é o rosa da marca
 * lido como um segundo alerta ao lado do vermelho do atraso.
 */

const RAIZ = join(import.meta.dirname, "..");
const indexCss = readFileSync(join(RAIZ, "index.css"), "utf8");

/** O corpo de uma classe utilitária do `index.css`. */
function corpoDaClasse(nome: string): string {
  const m = indexCss.match(new RegExp(`\\.${nome}\\s*\\{([^}]*)\\}`));
  return m?.[1] ?? "";
}

function arquivosTsx(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...arquivosTsx(caminho));
    else if (entrada.name.endsWith(".tsx")) achados.push(caminho);
  }
  return achados;
}

describe("E6 — os três degraus existem, e nenhum esquece o tabular-nums", () => {
  it.each(["money-lg", "money-md", "money-sm"])("%s está definido", (classe) => {
    expect(corpoDaClasse(classe)).not.toBe("");
  });

  it.each(["money-lg", "money-md", "money-sm"])("%s tem tabular-nums", (classe) => {
    // Sem isto, "R$ 1.111,11" e "R$ 999,99" ficam com larguras diferentes e a
    // coluna de valores de uma tabela deixa de alinhar — o motivo de a escala
    // existir.
    expect(corpoDaClasse(classe)).toContain("tabular-nums");
  });

  it("o degrau maior é serif — a decisão do dono em 2026-07-28", () => {
    expect(corpoDaClasse("money-lg")).toContain("font-serif");
  });
});

describe("E134/E11 — dinheiro não é type=number", () => {
  it("nenhum input de dinheiro usa type=number com step de centavos", () => {
    /**
     * A regra escrita no repo desde o E92 ("vira roleta e muda o valor quando
     * o dedo rola a página") valia por comentário, não por teste — e três
     * campos viviam contra ela. O par que identifica dinheiro é
     * `type="number"` + `step="0.01"` na vizinhança (janela de 3 linhas, a
     * lição S-D7); contadores e horas não têm step de centavos e passam.
     */
    const ofensores: string[] = [];
    for (const arquivo of arquivosTsx(RAIZ)) {
      const linhas = readFileSync(arquivo, "utf8").split("\n");
      for (let i = 0; i < linhas.length; i++) {
        const janela = linhas.slice(i, i + 3).join("\n");
        if (janela.includes('type="number"') && janela.includes('step="0.01"')) {
          ofensores.push(`${arquivo.replace(`${RAIZ}/`, "")}:${i + 1}`);
          break;
        }
      }
    }
    expect(ofensores).toEqual([]);
  });
});

describe("E8 — o rosa da marca não é cor de dinheiro", () => {
  it("nenhum valor em `brl()` sai com text-primary — nem com o par quebrado em linhas", () => {
    /**
     * E127: a varredura lia LINHA a linha, e o prettier separou o par em
     * `noiva-portal.tsx` — `className="… text-primary">` numa linha,
     * `{brl(v.precoBase)}` na seguinte — e o preço que a noiva lê no celular
     * viveu meses a 2,68:1 com CI verde (o gêmeo do lookbook, na mesma linha,
     * foi pego pelo E99). Agora o par é procurado numa JANELA de 3 linhas:
     * atributo e expressão de um mesmo elemento não se separam mais que isso.
     *
     * `hover:text-primary` fica de fora (cor de REPOUSO é o que a WCAG mede em
     * texto parado; o alvo do hover ali é link, não o número) e
     * `text-primary-foreground` também (é o texto SOBRE o rosa, o par testado
     * de `aparencia.test.ts`). `text-primary-texto` NÃO escapa: continua sendo
     * o rosa da marca lido como segundo alerta — dinheiro usa a escala
     * `money-*`, nunca a cor da marca.
     */
    const rosaComoTexto = /(?<!hover:)text-primary(?!-foreground)/;
    const ofensores: string[] = [];
    for (const arquivo of arquivosTsx(RAIZ)) {
      const linhas = readFileSync(arquivo, "utf8").split("\n");
      for (let i = 0; i < linhas.length; i++) {
        const janela = linhas.slice(Math.max(0, i - 2), i + 1).join("\n");
        if (linhas[i].includes("brl(") && rosaComoTexto.test(janela)) {
          ofensores.push(`${arquivo.replace(`${RAIZ}/`, "")}:${i + 1}: ${linhas[i].trim().slice(0, 90)}`);
        }
      }
    }
    expect(ofensores).toEqual([]);
  });
});
