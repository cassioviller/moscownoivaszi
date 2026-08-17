import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";
import { SEM_PERFIS_TITULO } from "./perfis-do-sistema";

/**
 * S-D9 — **três telas leem a mesma lista global de perfis, e as três precisam
 * dar a mesma notícia quando ela vem vazia.**
 *
 * `GET /admin/perfis` (`admin.ts:221`) não filtra por loja: é a lista do
 * SISTEMA. A instalação nasce com quatro perfis (`configuracao-inicial.ts:85`
 * — Admin, Proprietário, Vendedora e Recepção), e o `DELETE` recusa o do
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

/**
 * A enumeração sai do versionamento, não do disco (S-D30). Caminhos relativos
 * a `src/`.
 */
const telas = arquivosVersionados(raizSrc, ["pages"])
  .filter((relativo) => relativo.endsWith(".tsx"))
  .map((relativo) => ({
    caminho: relativo,
    fonte: readFileSync(join(raizSrc, relativo), "utf8"),
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

  /**
   * Conjunto vazio aprova tudo em silêncio (S-D31). O piso é o medido em
   * 2026-08-07 — 66 telas `.tsx` versionadas em `pages/`, 3 delas lendo
   * `useListPerfis` — com folga para baixo.
   */
  it("a varredura olha telas de verdade, e acha quem lista perfis", () => {
    expect(telas.length).toBeGreaterThan(50);
    expect(telas.filter((t) => t.fonte.includes("useListPerfis")).length).toBeGreaterThanOrEqual(3);
  });
});
