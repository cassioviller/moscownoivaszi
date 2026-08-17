import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getPreviewComissaoQueryKey,
  getListComissaoRegrasQueryKey,
  getListComissaoFechamentosQueryKey,
  getListPendenciasComissaoQueryKey,
  getListBaixasEstornoComissaoQueryKey,
} from "@workspace/api-client-react";
import {
  chavesDaBaixaDeEstorno,
  chavesDaEscadaDeComissao,
  chavesDoFechamentoDeComissao,
} from "./comissao-cache";

/**
 * **S-R16 — as três famílias, e a varredura que impede a sexta grafia.**
 *
 * A régua vale pelo que ela cobra: a lista certa não conserta nada se o
 * handler seguinte escrever a sua própria. É a lição do `sujoParaConfirmar`
 * (regra 26) — oito sítios, cinco grafias, três sem guarda nenhuma; virou uma
 * função MAIS uma varredura que cobra que não nasça a sexta.
 */

const TELA = path.resolve(import.meta.dirname, "../pages/comissoes/index.tsx");

describe("chaves da comissão — a prévia entra nas três famílias", () => {
  it("mexer na escada refaz a lista de regras E a prévia", () => {
    expect(chavesDaEscadaDeComissao("l1", "2026-03")).toEqual([
      getListComissaoRegrasQueryKey("l1"),
      getPreviewComissaoQueryKey("l1", { competencia: "2026-03" }),
    ]);
  });

  it("fechar/reabrir refaz histórico, pendências E a prévia", () => {
    expect(chavesDoFechamentoDeComissao("l1", "2026-03")).toEqual([
      getListComissaoFechamentosQueryKey("l1"),
      getListPendenciasComissaoQueryKey("l1"),
      getPreviewComissaoQueryKey("l1", { competencia: "2026-03" }),
    ]);
  });

  it("baixar estorno refaz as baixas E a prévia", () => {
    expect(chavesDaBaixaDeEstorno("l1", "2026-03")).toEqual([
      getListBaixasEstornoComissaoQueryKey("l1"),
      getPreviewComissaoQueryKey("l1", { competencia: "2026-03" }),
    ]);
  });
});

describe("varredura — a tela de comissões não escreve invalidação à mão", () => {
  it("todo `invalidateQueries` da tela sai de uma família nomeada", () => {
    const fonte = readFileSync(TELA, "utf8");
    // A população, dita antes da afirmação (S-C46/S-C260): as seis ações da
    // tela que mexem no que a Prévia calcula.
    for (const handler of [
      "onSalvarRegra",
      "onAlternarRegra",
      "onRemoverRegra",
      "onGerarFechamento",
      "onReabrirFechamento",
      "onBaixarEstorno",
    ]) {
      expect(fonte, `a tela perdeu o handler ${handler} — reveja a varredura`).toContain(handler);
    }
    // Sobra exatamente um: o `invalidar(chaves)` que aplica a família.
    const chamadas = fonte.match(/queryClient\.invalidateQueries\(/g) ?? [];
    /**
     * VERMELHO ANTES (com o `onAlternarRegra` de volta ao que era):
     * `AssertionError: as invalidações da tela de comissões passam por
     * lib/comissao-cache.ts — apareceu uma escrita à mão: expected 2 to be 1`
     *
     * Eram SEIS ações e CINCO grafias; três esqueciam a prévia. A conta aqui é
     * a cerca: quem escrever a sexta à mão vê este número subir.
     */
    expect(
      chamadas.length,
      "as invalidações da tela de comissões passam por lib/comissao-cache.ts — apareceu uma escrita à mão",
    ).toBe(1);
  });

  it("a chave da prévia só aparece na tela para DEFINIR a query, não para invalidá-la", () => {
    const fonte = readFileSync(TELA, "utf8");
    const usos = fonte.match(/getPreviewComissaoQueryKey\(/g) ?? [];
    expect(
      usos.length,
      "a chave da prévia é montada uma vez (a query) — invalidá-la é papel de lib/comissao-cache.ts",
    ).toBe(1);
  });
});
