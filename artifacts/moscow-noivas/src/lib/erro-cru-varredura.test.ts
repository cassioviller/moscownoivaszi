import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * C4+F1/E122 — a varredura que impede o erro cru e o título técnico de voltarem.
 *
 * Duas réguas mecânicas:
 *
 * 1. **Nenhum toast/tela mostra `err.message`.** A mensagem que o cliente
 *    gerado monta começa em "HTTP 409 Conflict" — a régua do que a pessoa lê é
 *    `mensagemApi` (`lib/erro-api.ts`), que sabe ler o `detalhe` do servidor.
 *    O E92 adotou a régua em 23 arquivos e parou; a rodada 7 achou 47
 *    ocorrências em 27 arquivos ainda no cru.
 *
 * 2. **O título da falha é UM: "Não deu para <verbo>".** Havia cinco
 *    formulações para o mesmo evento — 76 "Erro ao X" contra 14 na voz da
 *    casa. Título começando em "Erro" é o rótulo técnico e não volta.
 *    (Exceções deliberadas, registradas no E122: "Não consegui entrar" no
 *    login — primeira pessoa, a linha que o METODO celebra — e "Essa mudança
 *    não é possível agora", que nomeia uma recusa de regra, não a falha
 *    genérica.)
 *
 * Lição S-D7 aplicada: a busca é no ARQUIVO INTEIRO com `\s*` entre os
 * tokens, não linha a linha — o prettier já escondeu um ofensor quebrando a
 * linha no meio de outra varredura.
 */

const RAIZ = join(import.meta.dirname, "..");

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

function fontes(): Array<{ arquivo: string; fonte: string }> {
  return [...arquivosFonte(join(RAIZ, "pages")), ...arquivosFonte(join(RAIZ, "components"))].map(
    (arquivo) => ({
      arquivo: relative(RAIZ, arquivo),
      fonte: readFileSync(arquivo, "utf-8")
        // Comentários citam o código errado para explicar o conserto.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1"),
    }),
  );
}

describe("varredura: o erro que a pessoa lê", () => {
  it("nenhum `<x> instanceof Error ? <x>.message` em pages/ e components/ — a régua é mensagemApi", () => {
    const ofensores = fontes()
      .filter(({ fonte }) => /(\w+)\s+instanceof\s+Error\s*\?\s*\1\s*\.\s*message/.test(fonte))
      .map(({ arquivo }) => arquivo);
    expect(
      ofensores,
      "err.message é 'HTTP 409 Conflict: CODIGO' — troque por mensagemApi(err, <fallback da tela>) " +
        "(lib/erro-api.ts, régua do E92; adoção fechada no E122)",
    ).toEqual([]);
  });

  it('nenhum título de falha começando em "Erro" — o canônico é "Não deu para <verbo>"', () => {
    const proibidos = [
      /title:\s*"Erro\b/, //           toast({ title: "Erro ao X" })
      /titulo=\s*["{]\s*"?Erro\b/, //  <Erro titulo="Erro ao carregar X">
      /<AlertTitle>\s*Erro\b/, //      <AlertTitle>Erro ao carregar X</AlertTitle>
    ];
    const ofensores = fontes()
      .filter(({ fonte }) => proibidos.some((padrao) => padrao.test(fonte)))
      .map(({ arquivo }) => arquivo);
    expect(
      ofensores,
      'título de falha com o rótulo técnico "Erro …" — o título canônico da casa é ' +
        '"Não deu para <verbo>" (F1/E122)',
    ).toEqual([]);
  });
});
