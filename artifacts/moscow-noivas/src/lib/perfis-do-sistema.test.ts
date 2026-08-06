import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SEM_PERFIS_TITULO } from "./perfis-do-sistema";

/**
 * S-D9 — **três telas leem a mesma lista global de perfis, e as três precisam
 * dar a mesma notícia quando ela vem vazia.**
 *
 * `GET /admin/perfis` (`admin.ts:221`) não filtra por loja: é a lista do
 * SISTEMA. A instalação nasce com quatro perfis (`configuracao-inicial.ts:85`
 * — Admin, Proprietária, Vendedora e Recepção), e o `DELETE` recusa o do
 * sistema (`admin.ts:289-293`). Uma lista vazia aqui não é "esta loja ainda
 * não tem"; é uma base sem configuração inicial — e nenhuma tela do app cria
 * perfil (zero usos de `useCreatePerfil`).
 *
 * A régua: **a frase mora num lugar só**. Eram três cópias literais de "Nenhum
 * perfil encontrado." (`permissoes/index.tsx`, `admin/perfis.tsx`,
 * `equipe/index.tsx`), que é a forma de vazio que o E99 tirou de trinta telas
 * — informa o que a pessoa já está vendo, e ainda por cima informa errado.
 */

const raizSrc = join(__dirname, "..");

function arquivosDe(dir: string, sufixos: string[]): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      achados.push(...arquivosDe(caminho, sufixos));
    } else if (sufixos.some((s) => entrada.endsWith(s))) {
      achados.push(caminho);
    }
  }
  return achados;
}

const telas = arquivosDe(join(raizSrc, "pages"), [".tsx"]).map((caminho) => ({
  caminho: caminho.slice(raizSrc.length + 1),
  fonte: readFileSync(caminho, "utf8"),
}));

describe("o vazio da lista de perfis", () => {
  it("nenhuma tela repete a frase que não diz por quê", () => {
    const comAFrase = telas
      .filter((t) => t.fonte.includes("Nenhum perfil encontrado"))
      .map((t) => t.caminho);
    expect(comAFrase).toEqual([]);
  });

  it("toda tela que lista perfis usa a frase compartilhada", () => {
    const semAConstante = telas
      .filter((t) => t.fonte.includes("useListPerfis"))
      .filter((t) => !t.fonte.includes("SEM_PERFIS_TITULO"))
      .map((t) => t.caminho);
    expect(semAConstante).toEqual([]);
  });

  it("a frase diz o que aconteceu, não o que a pessoa já está vendo", () => {
    expect(SEM_PERFIS_TITULO).not.toMatch(/nenhum resultado|não encontrad/i);
    expect(SEM_PERFIS_TITULO.length).toBeGreaterThan(20);
  });
});
