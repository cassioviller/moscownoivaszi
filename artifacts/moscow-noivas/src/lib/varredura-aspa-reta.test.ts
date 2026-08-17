import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * **A aspa reta sai das frases que uma pessoa lê — e esta régua é o que impede
 * a próxima de nascer.**
 *
 * A decisão da dona (S-RM16, 17/08) diz: *a TELA perde as aspas retas, e o
 * manual não muda*. O E259 a executou em duas linhas de `routes/catalogo.ts` e
 * a mediu ESTREITA — contou "as únicas duas em frase que uma pessoa lê" onde
 * havia seis —, e a sobra que isso abriu (S-RM19 🟠) é a própria incoerência
 * que sobrou: **a mesma tela recusava sem aspas e confirmava com elas, a dois
 * cliques de distância**. O E262 fechou os seis sítios e escreveu o critério da
 * família inteira, que a S-RM22 pediu:
 *
 * - **Valor que a pessoa DIGITOU perde a aspa.** Ele aparece na tela sozinho,
 *   sem aspa nenhuma — a aspa em volta dele é ruído que impede o `Ctrl+F`.
 * - **Rótulo FIXO de tela citado dentro de uma frase MANTÉM a aspa, e ela é
 *   CURVA.** Aqui a aspa faz trabalho: `desmarque Atributo ativo` não diz se o
 *   `ativo` é do rótulo ou da frase, e `Com Devolvi o valor marcado abaixo`
 *   deixa de ser português. A curva não é invenção deste épico — **10 sítios
 *   de produção já a usavam**, entre eles `equipe/index.tsx:417`
 *   (`em “Convidar por link”`), que é exatamente este caso; e o manual escreve
 *   `<em>“Devolvi o valor”</em>` em `vendedora.html:853`.
 *
 * A razão é a MESMA nas duas metades — *quem procura na tela o que leu tem de
 * achar* — e ela pede coisas opostas porque as duas metades são opostas.
 *
 * ## O que esta régua alcança, e o que ela NÃO alcança
 *
 * Alcança três formas **decidíveis por máquina**, e só elas:
 *
 * 1. aspa reta encostada numa interpolação de template (`"${…}"`);
 * 2. aspa reta ESCAPADA dentro de uma string (`\"…\"`);
 * 3. no `.tsx`, aspa reta encostada numa expressão JSX (`"{…}"`).
 *
 * **Não alcança a aspa reta em texto JSX nu** (`desmarcar "Atributo ativo"`
 * escrito solto entre tags), e a razão está medida, não suposta. A varredura
 * exploratória que achou esse sítio devolveu **149 candidatos** e só chegou aos
 * 4 verdadeiros depois de EXCLUIR à mão `description:`, `title:`, `message:`,
 * `placeholder`, `aria-label`, `refine(`, `format(` e mais quatro formas —
 * porque em `.tsx` um par de aspas em prosa e um argumento de função têm a
 * mesma forma léxica, e separá-los exige saber se o ponto está em texto JSX ou
 * em código, que é trabalho de parser. **Régua que precisa de onze exclusões
 * escritas à mão é classificador, não régua** (é o precedente da S-CF3 e da
 * S-RM14: quando a fronteira não é decidível, o que se registra é a tentativa e
 * o número que a reprovou).
 *
 * ## A forma é a da regra 31 — sonda de passivo, não caça a zero
 *
 * As três formas acima aparecem legitimamente onde a aspa é da NORMA, não da
 * frase: `ETag` e `Content-Disposition` (HTTP), o campo de CSV (RFC 4180), o
 * identificador SQL, o exemplo de JSON que a tela mostra e a saída de script de
 * operação. Esses sítios estão nomeados abaixo um a um, com a razão. **O
 * objetivo não é zerar o número: é que nenhuma linha dele siga sem julgamento**
 * — sítio novo reprova com o `arquivo:linha`, e alguém decide se é protocolo ou
 * é frase.
 *
 * **Enumera com `git ls-files`** (regra da casa; e a regra 35 manda `git add -N`
 * no arquivo novo ANTES de medir).
 */

const RAIZ = path.resolve(__dirname, "../../../..");

function porGit(padroes: string[]): string[] {
  return execFileSync("git", ["ls-files", ...padroes], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

/**
 * A TELA, em arquivos: o frontend inteiro e as duas pastas do servidor onde
 * moram os recados que a tela repete — o mesmo corpus da
 * `varredura-manuais-textos`, mais os `scripts/`, que é onde vive a saída de
 * arranque.
 */
function arquivosDaTela(): string[] {
  return porGit([
    "artifacts/moscow-noivas/src/**/*.ts",
    "artifacts/moscow-noivas/src/**/*.tsx",
    "artifacts/api-server/src/routes/*.ts",
    "artifacts/api-server/src/lib/*.ts",
    "artifacts/api-server/src/scripts/*.ts",
  ]).filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));
}

/** Apaga comentários preservando posição — comentário não é frase de tela. */
function semComentarios(texto: string): string {
  const out = texto.split("");
  let i = 0;
  const n = texto.length;
  let modo: string = "codigo";
  while (i < n) {
    const c = texto[i];
    const d = texto[i + 1];
    if (modo === "codigo") {
      if (c === "/" && d === "/") {
        while (i < n && texto[i] !== "\n") out[i++] = " ";
        continue;
      }
      if (c === "/" && d === "*") {
        while (i < n && !(texto[i] === "*" && texto[i + 1] === "/")) {
          if (texto[i] !== "\n") out[i] = " ";
          i++;
        }
        if (i < n) {
          out[i] = " ";
          out[i + 1] = " ";
          i += 2;
        }
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        modo = c as string;
        i++;
        continue;
      }
      i++;
      continue;
    }
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === modo) {
      modo = "codigo";
      i++;
      continue;
    }
    i++;
  }
  return out.join("");
}

/** `nome="…"` e `nome='…'` — o valor do atributo JSX não é frase que se lê. */
function semAtributos(texto: string): string {
  const branco = (s: string) => s.replace(/[^\n]/g, " ");
  return texto
    .replace(/([A-Za-z_:-][\w:.-]*)=("(?:[^"\\\n]|\\.)*")/g, (_, n: string, v: string) => n + "=" + branco(v))
    .replace(/([A-Za-z_:-][\w:.-]*)=('(?:[^'\\\n]|\\.)*')/g, (_, n: string, v: string) => n + "=" + branco(v));
}

/** O miolo de `${…}` é CÓDIGO, não prosa — vira branco antes de procurar aspa. */
function semInterpolacoes(texto: string): string {
  const out = texto.split("");
  for (let i = 0; i < texto.length - 1; i++) {
    if (texto[i] === "$" && texto[i + 1] === "{") {
      let prof = 1;
      let j = i + 2;
      while (j < texto.length && prof > 0) {
        if (texto[j] === "{") prof++;
        else if (texto[j] === "}") prof--;
        if (prof > 0) out[j] = " ";
        j++;
      }
    }
  }
  return out.join("");
}

/**
 * O recado tem de mostrar a ASPA, não o começo da linha. A `pendencia` do
 * `financeiro/folha.tsx` tem 240 caracteres e a aspa ofensora mora no fim: um
 * `slice(0, 120)` reprova mostrando um pedaço em que não há nada de errado, e
 * quem lê o vermelho vai procurar no lugar errado.
 */
function janela(linha: string, onde: number): string {
  const inicio = Math.max(0, onde - 45);
  const fim = Math.min(linha.length, onde + 75);
  return (inicio > 0 ? "…" : "") + linha.slice(inicio, fim).trim() + (fim < linha.length ? "…" : "");
}

/**
 * `texto` é a JANELA (o que o vermelho mostra) e `crua` é a linha INTEIRA (o que
 * a allowlist casa). Separá-los não é luxo: a marca de `leads.ts` mora a 60
 * caracteres da aspa, e casar a allowlist contra a janela faria a régua acusar
 * de frase um sítio que ela mesma já julgou protocolo.
 */
type Sitio = { arquivo: string; linha: number; forma: string; texto: string; crua: string };

function aspasRetas(): Sitio[] {
  const achados: Sitio[] = [];
  for (const arquivo of arquivosDaTela()) {
    const cru = fs.readFileSync(path.join(RAIZ, arquivo), "utf8");
    let base = semComentarios(cru);
    if (arquivo.endsWith(".tsx")) base = semAtributos(base);
    const linhas = base.split("\n");
    const cruas = cru.split("\n");
    linhas.forEach((linha, i) => {
      const formas = new Map<string, number>();
      // 1. dentro de um template literal — com o miolo dos `${…}` já apagado,
      //    porque ali a aspa é delimitador de string, não prosa. A adjacência
      //    (`"${…}"`) seria estreita demais: em `leads.ts:90` a aspa abre em
      //    `filename="dados-` e só depois vem a interpolação, e em
      //    `folha.tsx:524` ela cerca um rótulo no meio da frase — nenhuma das
      //    duas encosta na chave, e as duas são exatamente o que se procura.
      for (const t of semInterpolacoes(linha).matchAll(/`(?:[^`\\]|\\.)*`/g)) {
        const dentro = t[0].indexOf('"');
        if (dentro >= 0 && !formas.has("template")) formas.set("template", (t.index ?? 0) + dentro);
      }
      // 2. escapada dentro de uma string. A contrabarra que vem DEPOIS de
      //    outra contrabarra é uma contrabarra escapada, não uma aspa: em
      //    `pdf-desenhista.ts:53` o literal `"\\"` é o caractere `\`, e lê-lo
      //    como aspa escapada põe na fila um sítio que não existe.
      const escapada = linha.match(/(?<!\\)\\"/);
      if (escapada) formas.set("escapada", escapada.index ?? 0);
      // 3. encostada numa expressão JSX: `"{…}` (só no .tsx)
      const jsx = arquivo.endsWith(".tsx") ? linha.match(/"\{/) : null;
      if (jsx) formas.set("expressão JSX", jsx.index ?? 0);
      for (const [forma, onde] of formas) {
        const crua = cruas[i] ?? "";
        achados.push({ arquivo, linha: i + 1, forma, texto: janela(crua, onde), crua });
      }
    });
  }
  return achados;
}

/**
 * Os sítios em que a aspa reta é da NORMA e não da frase — cada um com a razão.
 * A chave é `arquivo` + um pedaço estável da linha, e não o número da linha:
 * uma edição em outro ponto do arquivo não pode fazer esta régua mentir.
 */
const DE_PROTOCOLO: { arquivo: string; marca: string; razao: string }[] = [
  // HTTP — a aspa é do cabeçalho, e tirá-la quebra o download.
  { arquivo: "artifacts/api-server/src/lib/csv.ts", marca: "Content-Disposition", razao: "HTTP: filename entre aspas" },
  { arquivo: "artifacts/api-server/src/routes/contratos.ts", marca: "Content-Disposition", razao: "HTTP: filename entre aspas" },
  // Aqui o `.setHeader` está na linha de cima, e a marca tem de morar na linha
  // que a régua enxerga — que é a do literal.
  { arquivo: "artifacts/api-server/src/routes/leads.ts", marca: 'filename="dados-', razao: "HTTP: filename entre aspas" },
  { arquivo: "artifacts/api-server/src/routes/portal.ts", marca: "Content-Disposition", razao: "HTTP: filename entre aspas" },
  { arquivo: "artifacts/api-server/src/routes/lookbooks.ts", marca: "const etag =", razao: "HTTP: ETag é aspeado por norma" },
  { arquivo: "artifacts/api-server/src/routes/portal.ts", marca: "const etag =", razao: "HTTP: ETag é aspeado por norma" },
  { arquivo: "artifacts/api-server/src/routes/vestidos.ts", marca: "const etag =", razao: "HTTP: ETag é aspeado por norma" },
  // RFC 4180 — o campo de CSV com vírgula ou quebra vai entre aspas retas.
  { arquivo: "artifacts/api-server/src/lib/csv.ts", marca: "test(seguro)", razao: "CSV: aspa do RFC 4180" },
  { arquivo: "artifacts/moscow-noivas/src/lib/financeiro/exportar.ts", marca: "test(seguro)", razao: "CSV: aspa do RFC 4180" },
  // Saída de script de operação — ninguém lê isto numa tela.
  { arquivo: "artifacts/api-server/src/scripts/restore-drill.ts", marca: "ABORTADO: alvo", razao: "console de script de operação" },
  { arquivo: "artifacts/api-server/src/scripts/seed.ts", marca: "Configurando", razao: "console de arranque" },
  { arquivo: "artifacts/api-server/src/scripts/seed.ts", marca: "senha padrão", razao: "console de arranque" },
  // JSON de exemplo mostrado na tela — a aspa é da sintaxe que a pessoa copia.
  { arquivo: "artifacts/moscow-noivas/src/pages/configuracoes/captacao.tsx", marca: "EXEMPLO_CORPO", razao: "JSON: a aspa é da sintaxe" },
];

/**
 * Um sítio de aspa reta legítima que estas três formas **não** alcançam, e fica
 * nomeado aqui para que ninguém o procure na lista acima: o identificador SQL
 * de `restore-drill.ts:44` (`'"' + nome + '"'`), montado por concatenação de
 * strings de aspa SIMPLES — a aspa dupla ali é conteúdo de uma string, sem
 * template e sem escape, que é a forma que esta régua não decide.
 */

function ehDeProtocolo(s: Sitio): boolean {
  return DE_PROTOCOLO.some((p) => p.arquivo === s.arquivo && s.crua.includes(p.marca));
}

describe("a aspa reta não nasce em frase que uma pessoa lê", () => {
  it("a varredura tem sobre o que varrer — conjunto vazio aprova tudo (S-C46)", () => {
    // Sem este piso, um `git ls-files` que devolvesse nada faria a régua abaixo
    // passar VAZIA, dizendo "não há aspa reta em frase nenhuma" sobre zero
    // arquivos lidos. É a forma exata do buraco que a S-C46 nomeia.
    // 269 arquivos em 17/08 — o piso é folgado de propósito: ele existe para
    // pegar corpus VAZIO ou quase, não para congelar a contagem de telas.
    expect(arquivosDaTela().length).toBeGreaterThan(250);
  });

  it("nenhum sítio novo de aspa reta fora dos que são protocolo", () => {
    const fora = aspasRetas()
      .filter((s) => !ehDeProtocolo(s))
      .map((s) => `${s.arquivo}:${s.linha} [${s.forma}] ${s.texto}`);
    expect(fora).toEqual([]);
  });

  it("a lista de sítios de protocolo é um passivo julgado, e o tamanho é o lembrete", () => {
    // Regra 31: o número não existe para ser zerado, existe para que ninguém
    // entre nem saia da lista sem alguém decidir. Caiu? uma porta sumiu.
    // Subiu? há um sítio novo, e o teste acima já disse qual.
    // E a lista NOMEIA quem sobrou: um número sozinho diz que há dívida e não
    // diz onde — que é a doença que a regra 31 existe para tratar.
    const sitios = aspasRetas();
    const orfaos = DE_PROTOCOLO.filter(
      (p) => !sitios.some((s) => s.arquivo === p.arquivo && s.crua.includes(p.marca)),
    ).map((p) => `${p.arquivo} « ${p.marca} » (${p.razao})`);
    expect(orfaos).toEqual([]);
    expect(DE_PROTOCOLO.length).toBe(13);
  });
});
