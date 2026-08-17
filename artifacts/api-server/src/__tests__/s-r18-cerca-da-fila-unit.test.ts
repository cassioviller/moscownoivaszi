import { beforeEach, describe, expect, it } from "vitest";
import {
  derrubarFilaDeAtrasos,
  geracaoDaFila,
  guardarFilaDeAtrasos,
  lerFilaDeAtrasos,
} from "../lib/fila-de-atrasos-cache";

/**
 * **S-R18 — a cerca do B7 não alcançava a loja que ninguém tinha derrubado pelo
 * nome.**
 *
 * O B7 (higiene da conferência, 16/08) fechou a janela do GET em voo: a rota lê
 * a geração da loja ANTES de ir ao banco, e o `guardar` só grava se a geração
 * ainda é a mesma. O que ele não alcançava é que o `derrubarFilaDeAtrasos()`
 * **sem argumento** — o gesto do seed e dos testes, o único que existe para
 * dizer *"esqueça tudo"* — subia a geração percorrendo `geracaoPorLoja`, e esse
 * `Map` só ganha chave quando alguém derruba a loja POR NOME
 * (`fila-de-atrasos-cache.ts:101`, antes deste épico).
 *
 * Numa loja recém-aberta, ou numa loja cujo gesto de derrubar ainda não passou
 * pela porta, a sequência é esta: a rota lê geração 0, vai ao banco, alguém
 * chama `derrubarFilaDeAtrasos()`, a rota volta e grava — com geração 0, que
 * ainda é a atual. **A fila velha fica servida por até 5 min**, que é
 * exatamente o dano que o B7 mediu e disse ter fechado.
 *
 * O teste é puro: o cache é um `Map` na memória do processo (S-C282), e nada
 * aqui toca banco.
 */
describe("S-R18 — o derrubar sem nome alcança a loja que nunca foi derrubada pelo nome", () => {
  const LOJA_NOVA = "loja-que-ninguem-derrubou-pelo-nome";
  const OUTRA = "loja-derrubada-pelo-nome-uma-vez";

  beforeEach(() => derrubarFilaDeAtrasos());

  it("o GET em voo NÃO grava a fila velha depois de um derrubar global", () => {
    // A rota lê a geração antes de consultar o banco.
    const geracaoLida = geracaoDaFila(LOJA_NOVA);

    // No meio da consulta, alguém manda esquecer tudo (seed, fixture, teste).
    derrubarFilaDeAtrasos();

    // A rota volta do banco com a resposta que já nasceu velha e tenta guardar.
    guardarFilaDeAtrasos(LOJA_NOVA, { atrasos: ["a fila de antes"] }, geracaoLida);

    expect(lerFilaDeAtrasos(LOJA_NOVA)).toBeNull();
  });

  it("a geração de uma loja SOBE a cada derrubar, com nome ou sem", () => {
    const zero = geracaoDaFila(LOJA_NOVA);

    derrubarFilaDeAtrasos();
    const depoisDoGlobal = geracaoDaFila(LOJA_NOVA);
    expect(depoisDoGlobal).toBeGreaterThan(zero);

    derrubarFilaDeAtrasos(LOJA_NOVA);
    const depoisDoNome = geracaoDaFila(LOJA_NOVA);
    expect(depoisDoNome).toBeGreaterThan(depoisDoGlobal);

    // E o global depois do nome também sobe: as duas parcelas se somam, então
    // duas invalidações nunca devolvem o mesmo número para a mesma loja — que é
    // a única coisa de que a comparação do `guardar` precisa.
    derrubarFilaDeAtrasos();
    expect(geracaoDaFila(LOJA_NOVA)).toBeGreaterThan(depoisDoNome);
  });

  it("derrubar pelo NOME não mexe na geração das outras lojas", () => {
    const antes = geracaoDaFila(LOJA_NOVA);
    derrubarFilaDeAtrasos(OUTRA);
    expect(geracaoDaFila(LOJA_NOVA)).toBe(antes);
    expect(geracaoDaFila(OUTRA)).toBeGreaterThan(antes);
  });

  it("sem derrubar no meio, o GET em voo GRAVA — a cerca não é uma parede", () => {
    // Regra 34: sem esta cena, `guardarFilaDeAtrasos` podendo nunca gravar
    // deixaria as três de cima verdes por vacuidade.
    const geracaoLida = geracaoDaFila(LOJA_NOVA);
    guardarFilaDeAtrasos(LOJA_NOVA, { atrasos: ["a fila de agora"] }, geracaoLida);
    expect(lerFilaDeAtrasos(LOJA_NOVA)).toEqual({ atrasos: ["a fila de agora"] });
  });
});
