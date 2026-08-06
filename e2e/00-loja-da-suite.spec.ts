import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { lerEstado } from "./helpers";
import {
  LOJA_DA_SUITE_PADRAO,
  escolherLojaDaSuite,
  idDaLojaDaSuite,
  type LojaCandidata,
} from "./loja-da-suite";

/**
 * S-D27 — a suíte tem de saber contra QUAL loja ela roda.
 *
 * Este arquivo é o `00-` de propósito: ele não abre navegador e falha em
 * milissegundos, antes dos 6 minutos do resto da suíte. Quem quebrar a âncora
 * da loja descobre no começo, não no fim.
 *
 * Os dois primeiros são o VERMELHO da sobra: contra o critério antigo — "a loja
 * mais antiga do banco" — os dois reprovam. As duas GUARDAS abaixo passam desde
 * o primeiro run e passam de propósito: elas não medem o conserto, medem a
 * regressão.
 */

const LOJA_DO_SEED: LojaCandidata = {
  id: LOJA_DA_SUITE_PADRAO,
  nome: "Moscow Noivas SP",
  createdAt: new Date("2026-07-06T21:46:07.123Z"),
};

/**
 * O lixo de fixture com data ANTERIOR à do seed. Ele não é hipótese: a herdeira
 * real medida em 2026-08-06 era a `Loja Teste 214cda2c` (2026-07-21) com o
 * acervo vazio, e a margem para a do seed era de zero linhas.
 */
const LOJA_LIXO: LojaCandidata = {
  id: "70eb0345-97a7-4624-942f-d3fc9fa153c4",
  nome: "Loja Teste 214cda2c",
  createdAt: new Date("2020-01-01T00:00:00.000Z"),
};

test("VERMELHO 1 — uma loja mais velha não rouba a suíte (S-D27)", () => {
  const eleita = escolherLojaDaSuite([LOJA_LIXO, LOJA_DO_SEED], {});
  expect(
    eleita.id,
    "A suíte tem de rodar contra a loja do seed mesmo quando existe lixo de fixture MAIS ANTIGO no banco. " +
      "Se este assert falhar, o critério ainda é a idade, e a suíte troca de alvo sozinha.",
  ).toBe(LOJA_DO_SEED.id);
});

test("VERMELHO 2 — sem a loja da suíte, o setup estoura em vez de eleger outra (S-D27)", () => {
  expect(
    () => escolherLojaDaSuite([LOJA_LIXO], {}),
    "Banco sem a loja da suíte tem de ser um ERRO ALTO. Eleger outra é o defeito: " +
      "os 156 specs passam contra uma loja vazia e ninguém fica sabendo.",
  ).toThrow(/não existe neste banco/);
});

test("a env manda no id, e a ordem é E2E_LOJA_ID > SEED_LOJA_ID > o default", () => {
  expect(idDaLojaDaSuite({})).toBe(LOJA_DA_SUITE_PADRAO);
  expect(idDaLojaDaSuite({ SEED_LOJA_ID: "abc" })).toBe("abc");
  expect(idDaLojaDaSuite({ SEED_LOJA_ID: "abc", E2E_LOJA_ID: "xyz" })).toBe("xyz");
  // String vazia é ausência: um `export E2E_LOJA_ID=` no shell não pode
  // apontar a suíte para lugar nenhum.
  expect(idDaLojaDaSuite({ E2E_LOJA_ID: "   " })).toBe(LOJA_DA_SUITE_PADRAO);
});

test("GUARDA — o .state.json aponta para a loja da suíte", () => {
  const estado = lerEstado();
  expect(
    estado.lojaId,
    `A suíte gravou ${estado.lojaId} (${estado.lojaNome}) e a loja configurada é ${idDaLojaDaSuite()}.`,
  ).toBe(idDaLojaDaSuite());
});

/**
 * Regra 26 — o id da loja mora em DOIS arquivos (o seed e a suíte), e dois
 * literais iguais que ninguém casa divergem em silêncio. O `e2e/` não alcança
 * `@workspace/api-server`, então o casamento é feito lendo o arquivo.
 */
test("GUARDA — o id da suíte é o mesmo LOJA_PADRAO.id do seed oficial", () => {
  const fonte = readFileSync(
    path.resolve(__dirname, "../artifacts/api-server/src/lib/configuracao-inicial.ts"),
    "utf-8",
  );
  const bloco = fonte.match(/export const LOJA_PADRAO = \{\s*id:\s*"([^"]+)"/);
  expect(bloco, "LOJA_PADRAO mudou de forma em configuracao-inicial.ts").not.toBeNull();
  expect(
    bloco![1],
    "O id da loja da suíte divergiu do LOJA_PADRAO.id do seed — uma das duas pontas mudou sozinha.",
  ).toBe(LOJA_DA_SUITE_PADRAO);
});
