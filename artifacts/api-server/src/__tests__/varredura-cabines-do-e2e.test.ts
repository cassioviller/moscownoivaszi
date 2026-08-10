import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * S-D25/S-D40 — spec que cria cabine apaga a sua.
 *
 * O banco do E2E persiste entre execuções, e cabine esquecida não é lixo
 * invisível: ela nasce ATIVA na loja do seed e vira coluna que a agenda
 * desenha. Em uma semana os specs que criavam cabine por execução sem apagar
 * acumularam **220 `e<NN>-<timestamp>`** (e22 68, e25 66, e24 36, e57 26,
 * e59 24) — quatro novas por passada completa da suíte. O `e24` é a prova do
 * conserto: parou de crescer em 30/07, no dia em que ganhou a limpeza no
 * `afterAll`.
 *
 * A régua é UMA (`apagarCabineCriada`, `e2e/helpers.ts`): antes desta sonda,
 * os três specs que limpavam escreviam a mesma limpeza em três grafias, e
 * grafia múltipla para o mesmo cuidado é a regra 26 — o cuidado não está sendo
 * cumprido, está sendo lembrado. O sítio que esquece é o que quebra.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

/**
 * A criação: um POST na rota de cabines, nas duas grafias que os specs usam
 * (`request.post(`${API_URL}/api/...`)` e `api.post(`/api/...`)`). GET e PATCH
 * na mesma rota ficam de fora — consultar ou desativar não cria linha.
 */
const CRIA = /\.post\(\s*`[^`]*\/cabines`/;
const APAGA = /apagarCabineCriada\(/;

function specs(): string[] {
  return arquivosVersionados(RAIZ, ["e2e"]).filter((r) => r.endsWith(".spec.ts"));
}

describe("varredura — spec que cria cabine apaga a sua (S-D25)", () => {
  it("a assinatura reconhece a criação nas duas grafias e ignora consulta", () => {
    const re = () => new RegExp(CRIA.source);
    expect(re().test("await request.post(`${API_URL}/api/lojas/${estado.lojaId}/cabines`, {")).toBe(
      true,
    );
    expect(re().test("await api.post(`/api/lojas/${estado.lojaId}/cabines`, {")).toBe(true);
    expect(re().test("await request.get(`${API_URL}/api/lojas/${estado.lojaId}/cabines`)")).toBe(
      false,
    );
  });

  it("todo spec que cria cabine chama a régua de limpeza", () => {
    const ofensores = specs().filter((relativo) => {
      const fonte = readFileSync(join(RAIZ, relativo), "utf8");
      return CRIA.test(fonte) && !APAGA.test(fonte);
    });
    expect(ofensores).toEqual([]);
  });

  /**
   * Conjunto vazio aprovaria tudo em silêncio. O piso é o medido em
   * 2026-08-06 — 61 specs versionados, 8 deles criando cabine — com folga
   * para baixo.
   */
  it("a varredura olha specs de verdade, e acha quem cria", () => {
    const todos = specs();
    const comCriacao = todos.filter((r) => CRIA.test(readFileSync(join(RAIZ, r), "utf8")));
    expect(todos.length).toBeGreaterThan(50);
    expect(comCriacao.length).toBeGreaterThanOrEqual(8);
  });
});
