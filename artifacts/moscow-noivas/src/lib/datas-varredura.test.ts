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

/**
 * As TRÊS grafias do mesmo defeito. A lista cresceu duas vezes, e é a prova do
 * ponto: a primeira versão olhava só `Intl.DateTimeFormat`; a segunda somou
 * `toLocale*String`; e o `format()` do date-fns — que também lê o relógio do
 * navegador — só apareceu ao mexer no cabeçalho do orçamento, oito call-sites
 * depois de o item ser dado por fechado.
 */
function semFusoExplicito(codigoComComentarios: string): string[] {
  const achados: string[] = [];
  // Comentários fora: eles CITAM o código errado para explicar o conserto, e
  // uma varredura que lê documentação acusa a própria nota de rodapé.
  const fonte = codigoComComentarios
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  // date-fns: `format(x, "HH:mm")` não tem parâmetro de fuso — sempre o local.
  // Só acusa padrões com HORA ou DIA; `format(d, "yyyy-MM")` de competência é
  // outra conversa e não passa por aqui.
  const dateFns = /\bformat\(\s*new Date\([^)]*\)\s*,\s*"([^"]*)"/g;
  let f: RegExpExecArray | null;
  while ((f = dateFns.exec(fonte)) !== null) {
    if (/[Hhdm]/.test(f[1]!)) achados.push(f[0].replace(/\s+/g, " ").slice(0, 90));
  }

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

  // E115 — a QUARTA grafia: getters de calendário do NAVEGADOR. Um "hoje" (ou
  // um dia de instante) montado por getFullYear/getMonth/getDate sem UTC é a
  // meia-noite do aparelho — foi assim que a contagem até o casamento errava
  // toda noite entre 21h e 24h, a grade da semana punha a prova de sexta na
  // coluna de sábado e a ficha do vestido cortava a ocupação no dia errado. A
  // revisão de 59 agentes achou seis; esta linha acha todos. Getter UTC
  // (`getUTCDate` etc.) não casa aqui: data de negócio em UTC é a convenção.
  const getterLocal = /\.get(?:FullYear|Month|Date)\(\)/g;
  while ((m = getterLocal.exec(fonte)) !== null) {
    const ini = Math.max(0, m.index - 40);
    achados.push(fonte.slice(ini, m.index + m[0].length).replace(/\s+/g, " ").slice(-70));
  }

  return achados;
}

describe("D15 — nenhuma data sai no relógio de quem abre", () => {
  it("a régua pega as QUATRO grafias do mesmo defeito", () => {
    expect(semFusoExplicito(`new Intl.DateTimeFormat("pt-BR", { hour: "2-digit" })`)).toHaveLength(1);
    expect(semFusoExplicito(`new Date(x).toLocaleDateString("pt-BR")`)).toHaveLength(1);
    // E115: o getter local — a grafia com que seis lugares liam o calendário
    // do navegador e que as três regras acima não viam.
    expect(semFusoExplicito(`const dia = hoje.` + `getDate();`)).toHaveLength(1);
    expect(semFusoExplicito(`Date.UTC(alvo.` + `getFullYear(), alvo.` + `getMonth())`)).toHaveLength(2);
    // Com o fuso dito (ou o getter UTC), passa em todas.
    expect(
      semFusoExplicito(`new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", hour: "2-digit" })`),
    ).toHaveLength(0);
    expect(
      semFusoExplicito(`new Date(x).toLocaleDateString("pt-BR", { timeZone: "UTC" })`),
    ).toHaveLength(0);
    expect(semFusoExplicito(`casamento.getUTCDate()`)).toHaveLength(0);
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
