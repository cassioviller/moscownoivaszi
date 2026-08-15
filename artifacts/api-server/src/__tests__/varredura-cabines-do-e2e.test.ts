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
   * S-C75 — quem cria cabine é o que esta varredura existe para conter, e o
   * que ela contém é RETRATO, não piso. O `>= 8` foi medido em 2026-08-06 e em
   * 2026-08-15 já eram **9** — o nono entrou sem uma linha de explicação, que
   * é exatamente o formato que a S-C46 descreve: piso não cobra remedida, e a
   * prosa envelhece calada. O retrato é NOMEADO: o próximo spec que criar
   * cabine fica vermelho aqui com o próprio nome, e o parágrafo se escreve no
   * vermelho.
   *
   * A população segue piso (S-C46): spec nasce toda semana por motivo que nada
   * tem a ver com cabine. Medido em 2026-08-15: 65 specs.
   */
  it("a varredura olha specs de verdade, e quem cria cabine é retrato nomeado", () => {
    const todos = specs();
    const comCriacao = todos.filter((r) => CRIA.test(readFileSync(join(RAIZ, r), "utf8")));
    expect(todos.length).toBeGreaterThan(50);
    expect(comCriacao.sort(), "specs que criam cabine — cada um chama a limpeza acima").toEqual([
      "e2e/18-agenda-grade.spec.ts",
      "e2e/22-atendimento-inicio-real.spec.ts",
      "e2e/24-dias-funcionamento.spec.ts",
      "e2e/25-confirmar-presenca.spec.ts",
      "e2e/49-provas-recorte.spec.ts",
      "e2e/55-ficha-responde-o-telefone.spec.ts",
      "e2e/57-confeccao-na-fila.spec.ts",
      "e2e/59-confeccao-vira-peca.spec.ts",
      "e2e/60-ficha-do-trabalho.spec.ts",
    ]);
  });
});
