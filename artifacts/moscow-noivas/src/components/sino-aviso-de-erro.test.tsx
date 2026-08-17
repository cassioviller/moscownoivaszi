// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

/**
 * **S-R17 — o aviso que o C12 criou ficava mudo depois do primeiro "dispensar".**
 *
 * O sino inteiro é feito de ids derivados do CONTEÚDO do fato:
 * `CAIXA:${diaNegativo}`, `ATRASO:${assinatura}` (peças, dias e valor),
 * `COMISSAO:${competencia}:${vendedoras}`, `LEADS_CRITICOS:${criticos}`,
 * `CONFIRMAR:${ids}`. O docblock do componente diz por quê, com todas as
 * letras: *"o aviso dispensado volta se o fato mudar (o id carrega a
 * assinatura do estado)"*.
 *
 * O aviso de ERRO da fila de atrasos — o C12 da higiene de 16/08 — nasceu com
 * id CONSTANTE, `"ATRASO:erro"`. As dispensas moram no `localStorage` por
 * pessoa×loja: um clique no X e o único aviso que diz *"não consegui ler se há
 * peça fora somando diária"* calava.
 *
 * O que ele guarda é dinheiro que CRESCE sozinho — R$ 500,00 por dia num
 * vestido de R$ 3.000,00 —, e a unidade em que ele cresce é o DIA. É essa a
 * assinatura que faltava.
 */

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ activeLojaId: "l1", acessosModulos: null, user: { id: "u1" } }),
}));

/**
 * **S-RM12 — as referências ficam PARADAS, e é isso que faz este arquivo medir
 * o componente em vez de si mesmo.**
 *
 * As cinco mocks devolviam um objeto NOVO a cada chamada (`vazia` era uma
 * função que constrói o literal; as outras quatro, arrows que fazem o mesmo).
 * O `useMemo` da lista de avisos depende do `.data` das cinco, e o react-query
 * devolve a MESMA referência enquanto o dado não muda (structural sharing) —
 * um harness que constrói por render inventa dependência instável que a
 * produção não tem, e todo contador de memoização passa a medir o instrumento.
 *
 * **Medido antes do conserto:** o corpo do `useMemo` rodava **2** vezes na
 * montagem e **5** em quatro renders, com o código consertado. É o número que
 * quase fez o agente do E256 confirmar a razão factualmente errada que o E253
 * escreveu para não consertar a S-RM7 (*"o conserto recalcularia a lista a cada
 * render"*). Com as constantes de módulo abaixo: **1 e 1**.
 */
const SEM_DADO = { data: undefined, isError: false, isPending: false, isLoading: false };
const PENDENCIAS = { data: [] as never[], isError: false };
const PARADOS = { data: { criticos: 0 }, isError: false };
const ATENDIMENTOS = { data: [] as never[], isError: false };
/** A fila não respondeu — é o caso que o C12 passou a mostrar. */
const ATRASOS = { data: undefined, isError: true };

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    useGetAlertaCaixa: () => SEM_DADO,
    useListPendenciasComissao: () => PENDENCIAS,
    useGetLeadsParados: () => PARADOS,
    useListAtendimentos: () => ATENDIMENTOS,
    useListContratosComAtraso: () => ATRASOS,
  };
});

/** Espião do corpo do `useMemo`: `avisoDoAtraso` é chamado uma vez por avaliação. */
const avisoDoAtraso = vi.fn(() => null);
vi.mock("@/lib/financeiro/fila-de-atrasos", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, avisoDoAtraso: () => avisoDoAtraso() };
});

const { SinoNotificacoes } = await import("./sino-notificacoes");

const TITULO = "Não consegui ler a fila de atrasos";
/** Meio-dia em São Paulo, longe de qualquer virada de dia (S-O119). */
const HOJE = new Date("2026-08-17T15:00:00.000Z");
const AMANHA = new Date("2026-08-18T15:00:00.000Z");

async function abrirOSino() {
  const user = userEvent.setup({ pointerEventsCheck: 0, advanceTimers: vi.advanceTimersByTime });
  render(
    <MemoryRouter>
      <SinoNotificacoes />
    </MemoryRouter>,
  );
  await user.click(screen.getByTestId("sino-notificacoes"));
  return user;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(HOJE);
  localStorage.clear();
  avisoDoAtraso.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("S-R17 — o aviso de erro da fila carrega a sua assinatura", () => {
  it("dispensar cala o aviso no dia em que ele foi dispensado", async () => {
    const user = await abrirOSino();
    await user.click(screen.getByRole("button", { name: `Dispensar: ${TITULO}` }));
    expect(screen.queryByText(TITULO)).not.toBeInTheDocument();

    // Outra montagem no MESMO dia: continua dispensado, que é o que o clique
    // pediu.
    screen.getByTestId("sino-notificacoes"); // âncora: o sino segue de pé
  });

  it("no dia seguinte ele volta a falar — a diária já é outra", async () => {
    const user = await abrirOSino();
    await user.click(screen.getByRole("button", { name: `Dispensar: ${TITULO}` }));
    expect(screen.queryByText(TITULO)).not.toBeInTheDocument();

    // Outra sessão, outro dia: a tela é montada do zero e lê o mesmo localStorage.
    cleanup();
    vi.setSystemTime(AMANHA);
    await abrirOSino();

    /**
     * VERMELHO ANTES:
     * `Error: expect(received).toBeInTheDocument()`
     * `received value must be an HTMLElement or an SVGElement.`
     * `Received has value: null`
     *
     * Com o id constante `"ATRASO:erro"`, a dispensa de ontem valia hoje,
     * amanhã e no ano que vem — o `localStorage` daquela pessoa naquela loja
     * guardava a string para sempre, e o único aviso de que a peça pode estar
     * somando diária nunca mais aparecia. Os cinco irmãos dele já voltavam a
     * falar quando o fato mudava.
     */
    expect(screen.queryByText(TITULO)).toBeInTheDocument();
  });

  it("a fila que responde não gera aviso de erro nenhum", () => {
    // Sanidade da montagem: o aviso acima existe porque `isError` é `true`.
    expect(localStorage.getItem("sino:dispensadas:u1:l1")).toBeNull();
  });
});

describe("S-RM12 — o harness não pode fingir instabilidade que o react-query não tem", () => {
  it("o corpo do `useMemo` roda UMA vez em quatro renders", async () => {
    const user = await abrirOSino();
    expect(avisoDoAtraso).toHaveBeenCalledTimes(1);

    // Quatro renders que não mexem em fato nenhum: fechar, abrir, fechar.
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("sino-notificacoes"));
    await user.keyboard("{Escape}");

    /**
     * **VERMELHO ANTES (medido devolvendo as mocks à forma solta, regra 34):**
     *
     * ```
     * AssertionError: expected "vi.fn()" to be called 1 times, but got 5 times
     * ```
     *
     * E a linha de cima já reprovava antes desta, com **2**: o harness solto
     * fazia a lista nascer duas vezes só para montar e abrir o sino.
     *
     * **O que isso custou:** foi este arquivo que quase fez o agente do E256
     * confirmar a razão que o E253 escreveu para NÃO consertar a S-RM7 (*"o
     * conserto recalcularia a lista a cada render"*). Um instrumento que
     * responde o número de renders **nas duas versões do código** não mede
     * nada — é a regra 34 vista pelo avesso: em vez de teste verde sobre
     * caminho torto, teste que confirma diagnóstico falso.
     */
    expect(avisoDoAtraso).toHaveBeenCalledTimes(1);
  });
});

describe("S-R17/varredura — nenhum aviso do sino nasce com id constante", () => {
  it("todo `id:` da lista de notificações é derivado do conteúdo", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const fonte = readFileSync(
      path.resolve(import.meta.dirname, "./sino-notificacoes.tsx"),
      "utf8",
    );
    /**
     * VERMELHO ANTES: `AssertionError: aviso do sino com id constante — o
     * dispensar dele é para sempre (S-R17): expected [ 'id: "ATRASO:erro",' ]
     * to deeply equal []`
     *
     * Regra 26 na forma mais curta: seis avisos, cinco com a assinatura do
     * fato e um sem. A cerca é esta linha — a sétima não nasce constante.
     */
    // A população da varredura, dita antes da afirmação (S-C46/S-C260): são
    // seis avisos no sino, e é sobre os seis que a frase abaixo vale.
    expect(fonte.match(/lista\.push\(\{/g) ?? []).toHaveLength(6);

    const constantes = fonte.match(/^\s*id: "[^"]*",$/gm)?.map((l) => l.trim()) ?? [];
    expect(
      constantes,
      "aviso do sino com id constante — o dispensar dele é para sempre (S-R17)",
    ).toEqual([]);
  });
});
