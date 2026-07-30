import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E145 — a régua dos erros (E96/E107) varrida sobre TODAS as rotas: o campo
 * `error` carrega CÓDIGO estável `MAIUSCULA_COM_UNDERSCORE`, e a prosa em
 * português mora em `detalhe`. O épico trocou 76 `{ error: "X not found" }` —
 * inglês, frase no campo do código, sem detalhe — e mais 8 frases em português
 * no mesmo campo; esta sonda garante que nenhum volte em silêncio.
 *
 * Por que a leitura é POR JANELA, e não linha a linha (regra 13 do METODO): o
 * objeto do `res.status(404).json(...)` quebra em várias linhas quando ganha
 * `detalhe` e `campos` — o `error:` mora até 3 linhas abaixo do `.json(`, e
 * uma varredura presa à linha do status declara-se completa sem ser.
 *
 * Por que os comentários saem ANTES da varredura: o conserto CITA a grafia
 * errada para explicar-se — `contratos.ts:308` guarda `era \`{ error:
 * "Bloqueio not found" }\`` de propósito. Varrer com os comentários dentro
 * proibiria exatamente a documentação que o METODO manda escrever.
 */

const ROTAS = join(import.meta.dirname, "..", "routes");

/** O código da casa: MAIUSCULA_COM_UNDERSCORE, nada de frase. */
const CODIGO_VALIDO = /^[A-Z][A-Z0-9_]*$/;

function arquivosDeRota(): string[] {
  return readdirSync(ROTAS)
    .filter((nome) => nome.endsWith(".ts"))
    .map((nome) => join(ROTAS, nome));
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
      const linhas = linhasSemComentarios(readFileSync(arquivo, "utf8"));
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

  it("todo 404 responde CÓDIGO no campo `error` — a frase mora em `detalhe`", () => {
    const ofensores: string[] = [];
    for (const arquivo of arquivosDeRota()) {
      const linhas = linhasSemComentarios(readFileSync(arquivo, "utf8"));
      linhas.forEach((linha, i) => {
        if (!linha.includes("res.status(404).json")) return;
        // a janela: o `error:` mora nesta linha ou em até 3 abaixo.
        const janela = linhas.slice(i, i + 4).join("\n");
        const literal = janela.match(/error:\s*"([^"]*)"/);
        if (literal && !CODIGO_VALIDO.test(literal[1] as string)) {
          ofensores.push(
            `${arquivo}:${i + 1} — 404 com frase no campo do código: ` +
              `\`error: "${literal[1]}"\` — o código é MAIUSCULA_COM_UNDERSCORE, ` +
              `a prosa vai para \`detalhe\``,
          );
        }
      });
    }
    expect(ofensores).toEqual([]);
  });
});
