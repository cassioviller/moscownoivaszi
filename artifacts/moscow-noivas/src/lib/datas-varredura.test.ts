import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * D15/E99 — a varredura que impede o fuso implícito de voltar.
 *
 * **Este teste existe porque a primeira varredura do D15 tinha um buraco.** Ela
 * contou `new Intl.DateTimeFormat` e deu o item por fechado — e o mesmo defeito
 * se escreve de outra forma: `new Date(x).toLocaleDateString("pt-BR")`, sem
 * `timeZone`, que era o que dez linhas do app faziam. O `contratos/[id].tsx`
 * mostrava "Fechado em" no relógio de quem abre, exatamente como os três
 * formatadores que o sweep tinha acabado de consertar.
 *
 * A lição vale mais que o conserto: **uma varredura que procura uma grafia
 * declara-se completa e não é.** Agora ela olha as duas.
 */

const RAIZ = join(import.meta.dirname, "..");

/** Onde o fuso do navegador é a resposta certa, e por quê. */
const PERDOADOS = [
  // O calendário do react-day-picker recebe a data que ELE mesmo montou a
  // partir da navegação do mês; não há instante de negócio envolvido.
  "components/ui/calendar.tsx",
];

function arquivosFonte(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...arquivosFonte(caminho));
    else if (/\.tsx?$/.test(entrada.name) && !entrada.name.includes(".test.")) {
      achados.push(caminho);
    }
  }
  return achados;
}

/** Um `Intl.DateTimeFormat` ou `toLocale*` sem `timeZone` no mesmo argumento. */
function semFusoExplicito(fonte: string): string[] {
  const achados: string[] = [];

  const intl = /new Intl\.DateTimeFormat\(/g;
  let m: RegExpExecArray | null;
  while ((m = intl.exec(fonte)) !== null) {
    let i = m.index + m[0].length;
    let profundidade = 1;
    while (i < fonte.length && profundidade > 0) {
      if (fonte[i] === "(") profundidade++;
      else if (fonte[i] === ")") profundidade--;
      i++;
    }
    const args = fonte.slice(m.index, i);
    if (!args.includes("timeZone")) achados.push(args.replace(/\s+/g, " ").slice(0, 90));
  }

  const toLocale = /\.toLocale(?:Date|Time)?String\(([^;]*?)\)/g;
  while ((m = toLocale.exec(fonte)) !== null) {
    if (!m[1]!.includes("timeZone")) achados.push(m[0].replace(/\s+/g, " ").slice(0, 90));
  }

  return achados;
}

describe("D15 — nenhuma data sai no relógio de quem abre", () => {
  it("a régua pega as DUAS grafias do mesmo defeito", () => {
    expect(semFusoExplicito(`new Intl.DateTimeFormat("pt-BR", { hour: "2-digit" })`)).toHaveLength(1);
    expect(semFusoExplicito(`new Date(x).toLocaleDateString("pt-BR")`)).toHaveLength(1);
    // Com o fuso dito, passa nas duas.
    expect(
      semFusoExplicito(`new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", hour: "2-digit" })`),
    ).toHaveLength(0);
    expect(
      semFusoExplicito(`new Date(x).toLocaleDateString("pt-BR", { timeZone: "UTC" })`),
    ).toHaveLength(0);
  });

  it("nenhum arquivo do app formata data sem dizer o fuso", () => {
    const ofensores: string[] = [];
    for (const arquivo of arquivosFonte(RAIZ)) {
      const relativo = arquivo.replace(`${RAIZ}/`, "");
      if (PERDOADOS.includes(relativo)) continue;
      for (const trecho of semFusoExplicito(readFileSync(arquivo, "utf8"))) {
        ofensores.push(`${relativo}: ${trecho}`);
      }
    }
    expect(ofensores).toEqual([]);
  });
});
