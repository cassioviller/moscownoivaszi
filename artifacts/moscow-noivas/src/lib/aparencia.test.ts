import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * E92 — os dois 🔴 da trilha E são de arquivos que nenhum teste alcançava: um
 * atributo do `index.html` e seis valores do `index.css`. Estes testes leem os
 * arquivos DE VERDADE, então não é possível reverter as correções sem que a
 * suíte fique vermelha.
 *
 * Por que aritmética e não um navegador: a fórmula de contraste da WCAG 2.1 é
 * determinística sobre o valor da cor. Os números que ela produz aqui batem com
 * os que a trilha E mediu no Chrome com os tokens computados (2,78 × 2,79;
 * 4,16 × 4,15; 2,93 × 2,96) — a diferença é arredondamento, não método.
 */

const raiz = fileURLToPath(new URL("..", import.meta.url));
const indexHtml = readFileSync(`${raiz}../index.html`, "utf8");
const indexCss = readFileSync(`${raiz}index.css`, "utf8");

describe("o documento se declara em português", () => {
  /**
   * E1: com `lang="en"` o navegador desenhava os 25 `type="date"` como
   * mm/dd/yyyy, o `type="month"` como "July 2026" e o `type="time"` com slot
   * AM/PM. O filtro de "Contas a receber" dizia `De 07/01/2026 Até 07/31/2026`
   * — em português, "de 7 de janeiro a 31 de julho". Não dá erro: dá número
   * errado com cara de certo, numa tela de dinheiro. É também WCAG 3.1.1 (A).
   */
  it("index.html declara lang=pt-BR", () => {
    expect(indexHtml).toMatch(/<html lang="pt-BR">/);
    expect(indexHtml).not.toMatch(/<html lang="en"/);
  });
});

// ————— A régua de contraste da WCAG 2.1 —————

function hslParaRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** Luminância relativa (WCAG 2.1, §Relative luminance). */
function luminancia([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function razao(a: string, b: string): number {
  const parse = (t: string): [number, number, number] => {
    const m = /^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(t.trim());
    if (!m) throw new Error(`token HSL não reconhecido: "${t}"`);
    return hslParaRgb(Number(m[1]), Number(m[2]), Number(m[3]));
  };
  const la = luminancia(parse(a));
  const lb = luminancia(parse(b));
  const [alto, baixo] = la > lb ? [la, lb] : [lb, la];
  return (alto + 0.05) / (baixo + 0.05);
}

/**
 * Lê os tokens de um bloco do index.css. Os dois blocos que importam são
 * `:root` (claro) e `.dark` — e a leitura é do arquivo real de propósito:
 * um token editado à mão sem refazer a conta cai aqui.
 */
function tokens(seletor: string): Record<string, string> {
  const i = indexCss.indexOf(`\n${seletor} {`);
  if (i < 0) throw new Error(`bloco "${seletor}" não encontrado em index.css`);
  const corpo = indexCss.slice(i, indexCss.indexOf("\n}", i));
  const mapa: Record<string, string> = {};
  for (const [, nome, valor] of corpo.matchAll(/--([\w-]+):\s*([-\d.]+\s+[\d.]+%\s+[\d.]+%)\s*;/g)) {
    mapa[nome] = valor;
  }
  return mapa;
}

const claro = tokens(":root");
const escuro = tokens(".dark");

/** Texto normal, WCAG 2.1 AA (1.4.3). Todo par abaixo carrega texto de verdade. */
const AA = 4.5;

describe("contraste dos tokens (WCAG 2.1 AA, 4,5:1 para texto)", () => {
  /**
   * E2: o rótulo de TODO botão de ação do sistema — "Entrar", "Agendar",
   * "Fechar competência" — vivia em 2,78:1, branco sobre o rosa da marca. A
   * marca não mudou; mudou o que vai em cima dela.
   */
  it.each([
    ["texto do botão primário", "primary-foreground", "primary"],
    ["texto do item ativo da sidebar", "sidebar-primary-foreground", "sidebar-primary"],
    ["texto do badge/toast destrutivo", "destructive-foreground", "destructive"],
  ])("claro · %s", (_nome, frente, fundo) => {
    expect(razao(claro[frente], claro[fundo])).toBeGreaterThanOrEqual(AA);
  });

  it.each([
    ["texto do botão primário", "primary-foreground", "primary"],
    ["texto do item ativo da sidebar", "sidebar-primary-foreground", "sidebar-primary"],
    ["texto do badge/toast destrutivo", "destructive-foreground", "destructive"],
  ])("escuro · %s", (_nome, frente, fundo) => {
    expect(razao(escuro[frente], escuro[fundo])).toBeGreaterThanOrEqual(AA);
  });

  /**
   * Os tokens que são usados COMO TEXTO (`text-muted-foreground`,
   * `text-destructive`) precisam passar sobre os três fundos onde o app os
   * põe: o fundo da página, o card e o `bg-muted`.
   */
  it.each([
    ["muted-foreground", "background"],
    ["muted-foreground", "card"],
    ["muted-foreground", "muted"],
    ["destructive", "background"],
    ["destructive", "card"],
  ])("claro · %s como texto sobre %s", (frente, fundo) => {
    expect(razao(claro[frente], claro[fundo])).toBeGreaterThanOrEqual(AA);
  });

  it.each([
    ["muted-foreground", "background"],
    ["muted-foreground", "card"],
    ["muted-foreground", "muted"],
    ["destructive", "background"],
    ["destructive", "card"],
  ])("escuro · %s como texto sobre %s", (frente, fundo) => {
    expect(razao(escuro[frente], escuro[fundo])).toBeGreaterThanOrEqual(AA);
  });

  /**
   * E127/E4·E7: os dois tokens que NASCEM para ser texto. `--primary-texto`
   * existe porque `--primary` (350 25% 65%) dá 2,68:1 como texto pequeno — 11
   * pontos do app o usavam assim, um deles o preço no portal da noiva.
   * `--aviso` existe porque o terceiro estado semântico era 5 tons de âmbar à
   * mão em 3 telas, nenhum na varredura. Nos dois modos, sobre os três fundos
   * onde o app põe texto.
   */
  it.each([
    ["primary-texto", "background"],
    ["primary-texto", "card"],
    ["primary-texto", "muted"],
    ["aviso", "background"],
    ["aviso", "card"],
    ["aviso", "muted"],
  ])("claro · %s como texto sobre %s", (frente, fundo) => {
    expect(razao(claro[frente], claro[fundo])).toBeGreaterThanOrEqual(AA);
  });

  it.each([
    ["primary-texto", "background"],
    ["primary-texto", "card"],
    ["primary-texto", "muted"],
    ["aviso", "background"],
    ["aviso", "card"],
    ["aviso", "muted"],
  ])("escuro · %s como texto sobre %s", (frente, fundo) => {
    expect(razao(escuro[frente], escuro[fundo])).toBeGreaterThanOrEqual(AA);
  });

  /**
   * O rosa da marca é intocável: se alguém "consertar" o contraste mexendo em
   * --primary no modo claro, este teste avisa que a correção foi pelo lado
   * errado. (Ver E92.md: no ESCURO o rosa clareia de propósito, como
   * --positivo já fazia, porque lá o fundo é escuro.)
   */
  it("a cor da marca no modo claro continua 350 25% 65%", () => {
    expect(claro.primary).toBe("350 25% 65%");
  });

  /** A conta bate com o que o Chrome mediu na trilha E — a régua está calibrada. */
  it("reproduz os números medidos no navegador antes do conserto", () => {
    expect(razao("0 0% 100%", "350 25% 65%")).toBeCloseTo(2.78, 1); // era o botão primário
    expect(razao("30 10% 45%", "30 15% 95%")).toBeCloseTo(4.16, 1); // era muted sobre muted
    expect(razao("0 40% 50%", "20 15% 15%")).toBeCloseTo(2.93, 1); // era destructive no escuro
  });
});
