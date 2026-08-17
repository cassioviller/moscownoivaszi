import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * **S-RM8 — a identidade que o `useFieldArray` apaga.**
 *
 * O `useFieldArray` do react-hook-form publica a chave DELE em `field.id` e
 * **sobrescreve o que houver ali**. Um campo chamado `id` dentro do
 * `z.array(z.object({ … }))` some da linha renderizada — e quem precisa da
 * identidade passa a resolvê-la por POSIÇÃO, que foi exatamente o defeito 🟠
 * que o E253 consertou em `catalogo/[atributoId]/editar.tsx` (S-R7): as duas
 * listas que o índice indexava andavam em ritmos diferentes, e o X do
 * "Champagne" apagava o "Marfim".
 *
 * O E253 consertou o sítio e declarou a CLASSE — ninguém tinha varrido os
 * outros `useFieldArray` do repositório. Esta é a varredura, e ela vale pelo
 * que cobra, não pela lista certa (regra 26): não é um retrato dos sítios de
 * hoje, é a cerca do próximo.
 *
 * **A população, dita antes da afirmação (S-C46):** varridos os `pages/`,
 * `components/` e `hooks/` versionados do app — **um** arquivo usa
 * `useFieldArray`, com **um** `z.array(z.object({…}))`, e ele já nomeia o
 * campo `opcaoId`. Zero ofensores hoje: o achado do E256 é que a classe tem
 * população 1, e ela já está paga. O que fica é o vermelho para o segundo
 * `useFieldArray` que nascer com um `id:` no schema.
 */

const RAIZ = join(import.meta.dirname, "..");

/**
 * Comentário e literal de string saem ANTES do casamento de chaves: um
 * parêntese dentro de `// (S-R7)` ou de `"Informe o valor"` desequilibraria a
 * contagem de profundidade e a varredura passaria a ler o objeto errado — em
 * silêncio, que é o pior jeito de uma sonda errar.
 */
function normalizar(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
}

function fonteDe(relativo: string): string {
  return normalizar(readFileSync(join(RAIZ, relativo), "utf-8"));
}

function telasEHooks(): string[] {
  return arquivosVersionados(RAIZ, ["pages", "components", "hooks"]).filter(
    (r) => /\.tsx?$/.test(r) && !r.includes(".test."),
  );
}

/** Os arquivos que montam um array de campos — a população da classe. */
function comFieldArray(): string[] {
  return telasEHooks().filter((r) => /\buseFieldArray\s*[({]/.test(fonteDe(r)));
}

/**
 * Recorta cada `z.array(z.object({ … }))` do arquivo, casando chaves de
 * verdade — regex sozinha para no primeiro `}` e perderia o objeto inteiro
 * quando houver aninhamento (`z.object({ faixa: z.object({…}) })`).
 */
function objetosDeArray(fonte: string): string[] {
  const blocos: string[] = [];
  const abertura = /z\.array\(\s*z\.object\(\{/g;
  let m: RegExpExecArray | null;
  while ((m = abertura.exec(fonte))) {
    let profundidade = 1;
    let i = m.index + m[0].length;
    while (i < fonte.length && profundidade > 0) {
      if (fonte[i] === "{") profundidade++;
      else if (fonte[i] === "}") profundidade--;
      i++;
    }
    blocos.push(fonte.slice(m.index + m[0].length, i - 1));
  }
  return blocos;
}

/** As chaves do PRIMEIRO nível do objeto — as que viram campos da linha. */
function chavesDoPrimeiroNivel(bloco: string): string[] {
  const chaves: string[] = [];
  const nome = /([A-Za-z_$][\w$]*)\s*:/y;
  let profundidade = 0;
  for (let i = 0; i < bloco.length; i++) {
    const c = bloco[i]!;
    if (c === "{" || c === "(" || c === "[") profundidade++;
    else if (c === "}" || c === ")" || c === "]") profundidade--;
    else if (profundidade === 0 && /[A-Za-z_$]/.test(c) && !/[\w$.]/.test(bloco[i - 1] ?? " ")) {
      nome.lastIndex = i;
      const m = nome.exec(bloco);
      if (m) {
        chaves.push(m[1]!);
        i = nome.lastIndex - 1;
      }
    }
  }
  return chaves;
}

describe("S-RM8 — nenhum array de `useFieldArray` chama um campo de `id`", () => {
  it("a varredura olhou alguma coisa — a população é dita antes da afirmação", () => {
    // Cerca contra a varredura que passa por não ter olhado (S-C46): se um dia
    // o recorte parar de casar, o número cai e o teste fica vermelho aqui, não
    // silenciosamente verde lá embaixo.
    expect(telasEHooks().length).toBeGreaterThan(100);
    expect(comFieldArray()).toEqual(["pages/catalogo/[atributoId]/editar.tsx"]);
  });

  it("o único array de campos de hoje já nomeia a identidade de `opcaoId`", () => {
    const blocos = comFieldArray().flatMap((r) => objetosDeArray(fonteDe(r)));
    expect(blocos).toHaveLength(1);
    expect(chavesDoPrimeiroNivel(blocos[0]!)).toEqual(["opcaoId", "valor", "ativo"]);
  });

  it("nenhum arquivo com `useFieldArray` declara `id` num `z.array(z.object({…}))`", () => {
    const ofensores = comFieldArray().flatMap((relativo) =>
      objetosDeArray(fonteDe(relativo))
        .filter((bloco) => chavesDoPrimeiroNivel(bloco).includes("id"))
        .map((_, n) => `${relativo} → z.array(z.object) #${n + 1}`),
    );
    /**
     * VERMELHO ANTES (medido devolvendo `opcaoId` ao nome `id`, regra 34):
     * `AssertionError: um campo `id` dentro do array do `useFieldArray` … :
     * expected [ 'pages/catalogo/[atributoId]/editar.tsx → z.array(z.object) #1' ]
     * to deeply equal []`
     */
    expect(
      ofensores,
      "um campo `id` dentro do array do `useFieldArray` é sobrescrito pela chave do hook e some " +
        "da linha: a identidade tem de ter outro nome (`opcaoId`, `itemId`), senão o alvo do " +
        "gesto volta a ser resolvido por POSIÇÃO — que é a S-R7 (S-RM8)",
    ).toEqual([]);
  });

  it("a régua sabe casar chaves aninhadas — o recorte não para no primeiro `}`", () => {
    // Um schema de mentira com aninhamento, comentário e parêntese dentro de
    // string: as três coisas que fariam uma regex ingênua ler o objeto errado.
    const fonte = normalizar(
      `const s = z.object({
         linhas: z.array(
           z.object({
             // a identidade (S-R7)
             id: z.string(),
             faixa: z.object({ de: z.number(), ate: z.number() }),
             nome: z.string().min(1, "Informe o nome (obrigatório"),
           }),
         ),
       });`,
    );
    const blocos = objetosDeArray(fonte);
    expect(blocos).toHaveLength(1);
    expect(chavesDoPrimeiroNivel(blocos[0]!)).toEqual(["id", "faixa", "nome"]);
  });
});
