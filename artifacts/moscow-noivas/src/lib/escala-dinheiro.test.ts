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

describe("E8 — o rosa da marca não é cor de dinheiro", () => {
  it("nenhum valor em `brl()` sai com text-primary", () => {
    const ofensores: string[] = [];
    for (const arquivo of arquivosTsx(RAIZ)) {
      const fonte = readFileSync(arquivo, "utf8");
      for (const linha of fonte.split("\n")) {
        // A mesma linha renderiza dinheiro E pinta de rosa: é o E8 exato.
        if (linha.includes("brl(") && linha.includes("text-primary")) {
          ofensores.push(`${arquivo.replace(`${RAIZ}/`, "")}: ${linha.trim().slice(0, 90)}`);
        }
      }
    }
    expect(ofensores).toEqual([]);
  });
});
