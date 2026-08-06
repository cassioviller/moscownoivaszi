import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * E145 — a régua dos erros (E96/E107) varrida sobre TODAS as rotas: o campo
 * `error` carrega CÓDIGO estável `MAIUSCULA_COM_UNDERSCORE`, e a prosa em
 * português mora em `detalhe`. O épico trocou 76 `{ error: "X not found" }` —
 * inglês, frase no campo do código, sem detalhe — e mais 8 frases em português
 * no mesmo campo; esta sonda garante que nenhum volte em silêncio.
 *
 * Por que a leitura NÃO é linha a linha (regra 13 do METODO): o objeto do
 * `res.status(404).json(...)` quebra em várias linhas quando ganha `detalhe` e
 * `campos`, e uma varredura presa à linha do status declara-se completa sem
 * ser.
 *
 * **A janela de 4 linhas tinha a mesma doença que ela existia para curar, um
 * degrau acima.** Ela buscava a ÂNCORA — `res.status(404).json` — como texto
 * contíguo numa linha, então bastava o prettier (ou uma mão) escrever
 * `res\n  .status(404)\n  .json({…})` para o 404 inteiro sumir da varredura,
 * sem vermelho nenhum. Medido em 2026-08-06: **117 sites nas 20 rotas
 * versionadas, zero cadeias quebradas** — a sonda estava verde por sorte de
 * formatação, não por régua. É a mesma fresta que a S-D7 apontou na varredura
 * da S28, e o conserto é o mesmo: trocar a régua de LINHA pela régua de
 * ESTRUTURA. A âncora tolera espaço em qualquer junta, e o objeto lido é o
 * argumento entre parênteses BALANCEADOS — sem limite de 4 linhas, sem limite
 * nenhum.
 *
 * Por que os comentários saem ANTES da varredura: o conserto CITA a grafia
 * errada para explicar-se — `contratos.ts:308` guarda `era \`{ error:
 * "Bloqueio not found" }\`` de propósito. Varrer com os comentários dentro
 * proibiria exatamente a documentação que o METODO manda escrever.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");
const ROTAS = "artifacts/api-server/src/routes";

/** O código da casa: MAIUSCULA_COM_UNDERSCORE, nada de frase. */
const CODIGO_VALIDO = /^[A-Z][A-Z0-9_]*$/;

/**
 * As rotas VERSIONADAS — régua da S38. O `readdirSync` lia o disco, e o disco
 * carrega o que o `.gitignore` esconde. Medido em 2026-08-06: os dois caminhos
 * devolvem os mesmos 20 arquivos.
 */
function arquivosDeRota(): string[] {
  return arquivosVersionados(RAIZ, [ROTAS]).filter((relativo) => relativo.endsWith(".ts"));
}

/** O argumento entre parênteses BALANCEADOS a partir de `abre`. */
function argumento(fonte: string, abre: number): string | null {
  let nivel = 0;
  for (let i = abre; i < fonte.length; i++) {
    if (fonte[i] === "(") nivel++;
    else if (fonte[i] === ")") {
      nivel--;
      if (nivel === 0) return fonte.slice(abre + 1, i);
    }
  }
  return null;
}

/**
 * Remove comentários PRESERVANDO o número de linhas, para que o ofensor saia
 * com `arquivo:linha` de verdade: o bloco vira só as quebras que continha, e a
 * linha que é só `//` vira linha vazia.
 */
function linhasSemComentarios(fonte: string): string[] {
  const semBloco = fonte.replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, ""));
  return semBloco.split("\n").map((linha) => (linha.trim().startsWith("//") ? "" : linha));
}

/**
 * A ÂNCORA do 404, tolerante a espaço em toda junta — `res.status(404).json`,
 * `res .status( 404 ) .json` e a cadeia quebrada em três linhas são a mesma
 * coisa para quem lê o programa, e passaram a ser a mesma coisa para a sonda.
 */
const ANCORA_404 = /\bres\s*\.\s*status\s*\(\s*404\s*\)\s*\.\s*json\s*\(/g;

/** Cada 404 da fonte, com o `error:` literal que ele devolve (ou `null`). */
function quatrocentosEQuatro(
  fonte: string,
): { indice: number; codigo: string | null; valido: boolean }[] {
  const achados: { indice: number; codigo: string | null; valido: boolean }[] = [];
  const re = new RegExp(ANCORA_404.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte)) !== null) {
    // O objeto inteiro, entre parênteses balanceados: sem janela de 4 linhas,
    // sem janela nenhuma. `detalhe` e `campos` podem crescer à vontade.
    const objeto = argumento(fonte, m.index + m[0].length - 1);
    const literal = objeto?.match(/error:\s*"([^"]*)"/) ?? null;
    const codigo = literal ? (literal[1] as string) : null;
    achados.push({ indice: m.index, codigo, valido: codigo !== null && CODIGO_VALIDO.test(codigo) });
  }
  return achados;
}

/** Só os códigos que reprovam — para os exemplos ficarem legíveis. */
function quatrocentosEQuatroEm(fonte: string): string[] {
  return quatrocentosEQuatro(fonte)
    .filter((a) => a.codigo !== null && !a.valido)
    .map((a) => a.codigo as string);
}

describe("varredura — os 404 falam código + detalhe, nunca frase no campo do código", () => {
  it("as assinaturas reconhecem a grafia errada e aceitam a certa", () => {
    expect(CODIGO_VALIDO.test("LEAD_NAO_ENCONTRADO")).toBe(true);
    expect(CODIGO_VALIDO.test("RESERVA_DE_OUTRA_NOIVA")).toBe(true);
    expect(CODIGO_VALIDO.test("Lead not found")).toBe(false);
    expect(CODIGO_VALIDO.test("Convite não encontrado")).toBe(false);
    // e a limpeza de comentários deixa passar a citação documental
    const citacao = `// era \`{ error: "Bloqueio not found" }\` — de propósito`;
    expect(linhasSemComentarios(citacao).join("\n")).not.toContain("not found");
  });

  it("nenhuma rota diz 'not found' fora de comentário", () => {
    const ofensores: string[] = [];
    for (const arquivo of arquivosDeRota()) {
      const linhas = linhasSemComentarios(readFileSync(join(RAIZ, arquivo), "utf8"));
      linhas.forEach((linha, i) => {
        if (linha.includes("not found")) {
          ofensores.push(
            `${arquivo}:${i + 1} — 'not found' em string: use CÓDIGO estável no ` +
              `campo \`error\` e a frase em português em \`detalhe\``,
          );
        }
      });
    }
    expect(ofensores).toEqual([]);
  });

  it("a âncora do 404 sobrevive à formatação, e o objeto lido não tem limite de linhas", () => {
    // A cadeia quebrada — hoje não existe nenhuma nas rotas, e é exatamente
    // por isso que ela precisa de teste: a versão por linha ficava verde.
    expect(
      quatrocentosEQuatroEm('res\n  .status(404)\n  .json({ error: "Lead not found" });'),
    ).toEqual(['Lead not found']);
    // E o `error:` sete linhas abaixo do `.json(`, que a janela de 4 perdia.
    const objetoLongo =
      'res.status(404).json({\n  detalhe: "a",\n  campos: {\n    a: 1,\n    b: 2,\n  },\n  origem: "x",\n  error: "Lead not found",\n});';
    expect(quatrocentosEQuatroEm(objetoLongo)).toEqual(["Lead not found"]);
    // E o caso certo não vira ofensor.
    expect(
      quatrocentosEQuatroEm('res.status(404).json({ error: "LEAD_NAO_ENCONTRADO" });'),
    ).toEqual([]);
  });

  it("todo 404 responde CÓDIGO no campo `error` — a frase mora em `detalhe`", () => {
    const ofensores: string[] = [];
    let sitesVarridos = 0;
    for (const arquivo of arquivosDeRota()) {
      const fonte = linhasSemComentarios(readFileSync(join(RAIZ, arquivo), "utf8")).join("\n");
      for (const { indice, codigo, valido } of quatrocentosEQuatro(fonte)) {
        sitesVarridos++;
        if (codigo === null || valido) continue;
        ofensores.push(
          `${arquivo}:${fonte.slice(0, indice).split("\n").length} — 404 com frase no ` +
            `campo do código: \`error: "${codigo}"\` — o código é ` +
            `MAIUSCULA_COM_UNDERSCORE, a prosa vai para \`detalhe\``,
        );
      }
    }
    // Varredura que não achou âncora nenhuma aprova tudo em silêncio. O piso é
    // o número medido em 2026-08-06: 117 sites nas 20 rotas.
    expect(sitesVarridos).toBeGreaterThan(100);
    expect(ofensores).toEqual([]);
  });
});
