// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

/**
 * **S-RM7 — a aba que ninguém recarregou atravessa a meia-noite.**
 *
 * O E253 deu ao aviso de erro da fila a assinatura que faltava
 * (`ATRASO:erro:${hojeLocal()}`, S-R17) e provou o conserto **desmontando e
 * remontando** a tela no dia seguinte. Numa aba aberta, ninguém desmonta nada:
 * a lista de avisos nasce num `useMemo` cujas dependências são as cinco
 * queries e a base da URL, e o DIA não está entre elas. À meia-noite o id
 * continua o de ontem — e com ele a dispensa de ontem, que era exatamente o
 * "para sempre" que a S-R17 fechou.
 *
 * O ateliê abre a tela de manhã e a deixa aberta; a vendedora que dispensa o
 * aviso às 23h e sai continua sem ele no dia seguinte, com a diária de
 * R$ 500,00 correndo num vestido de R$ 3.000,00.
 *
 * O segundo `describe` é o preço: o E253 declarou em vez de consertar porque
 * "o conserto recalcularia a lista a cada render". `hojeLocal()` devolve uma
 * STRING (`YYYY-MM-DD`), e string igual é dependência estável — a lista
 * continua nascendo uma vez só.
 */

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ activeLojaId: "l1", acessosModulos: null, user: { id: "u1" } }),
}));

/**
 * **As referências têm de ficar PARADAS, e é o que o instrumento mede.**
 *
 * O `useMemo` da lista depende do `.data` das cinco queries. O react-query
 * devolve a MESMA referência enquanto o dado não muda (structural sharing) —
 * uma mock que devolve `{ data: [] }` a cada chamada inventa dependência nova
 * por render e faria o contador abaixo medir o instrumento, não o componente.
 * Medido: com as mocks soltas o corpo do memo roda **4 vezes** em 4 renders,
 * antes e depois do conserto.
 */
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const SEM_DADO = { data: undefined, isError: false, isPending: false, isLoading: false };
  const PENDENCIAS = { data: [] as never[], isError: false };
  const PARADOS = { data: { criticos: 0 }, isError: false };
  const ATENDIMENTOS = { data: [] as never[], isError: false };
  const ATRASOS = { data: undefined, isError: true };
  return {
    ...real,
    useGetAlertaCaixa: () => SEM_DADO,
    useListPendenciasComissao: () => PENDENCIAS,
    useGetLeadsParados: () => PARADOS,
    useListAtendimentos: () => ATENDIMENTOS,
    // A fila não respondeu — é o aviso do C12, o que o E253 assinou pelo dia.
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
/** 23h59 em São Paulo (UTC−3) — um minuto antes da virada. */
const ANTES_DA_VIRADA = new Date("2026-08-18T02:59:00.000Z");

function montarOSino() {
  const user = userEvent.setup({ pointerEventsCheck: 0, advanceTimers: vi.advanceTimersByTime });
  render(
    <MemoryRouter>
      <SinoNotificacoes />
    </MemoryRouter>,
  );
  return user;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(ANTES_DA_VIRADA);
  localStorage.clear();
  avisoDoAtraso.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("S-RM7 — o aviso do sino troca de dia sem que a aba seja recarregada", () => {
  it("dispensado às 23h59, ele volta a falar depois da meia-noite na MESMA aba", async () => {
    const user = montarOSino();
    await user.click(screen.getByTestId("sino-notificacoes"));
    await user.click(screen.getByRole("button", { name: `Dispensar: ${TITULO}` }));
    expect(screen.queryByText(TITULO)).not.toBeInTheDocument();

    // A aba fica aberta. Passam dois minutos e o dia vira — sem desmontar nada,
    // que é a única diferença para o teste do E253.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });

    /**
     * VERMELHO ANTES: `expect(element).toBeInTheDocument()` sobre `null` — o
     * `useMemo` da lista não depende do dia, então o id continuava
     * `ATRASO:erro:2026-08-17` e a dispensa de ontem seguia valendo hoje.
     */
    expect(screen.queryByText(TITULO)).toBeInTheDocument();
  });

  it("a dispensa de HOJE continua calando hoje — o conserto não é 'o aviso volta sempre'", async () => {
    const user = montarOSino();
    await user.click(screen.getByTestId("sino-notificacoes"));
    await user.click(screen.getByRole("button", { name: `Dispensar: ${TITULO}` }));

    // Trinta segundos: ainda é o mesmo dia.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(screen.queryByText(TITULO)).not.toBeInTheDocument();
  });
});

describe("S-RM7 — o preço que o E253 temeu, medido", () => {
  it("a lista NÃO é recalculada a cada render — o dia é uma string, e string igual é dependência estável", async () => {
    const user = montarOSino();
    expect(avisoDoAtraso).toHaveBeenCalledTimes(1);

    // Quatro renders que não mexem em fato nenhum: abrir, fechar, abrir o sino.
    await user.click(screen.getByTestId("sino-notificacoes"));
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("sino-notificacoes"));

    /**
     * Esta é a régua que autoriza o conserto. Se o dia entrasse nas
     * dependências como um objeto novo por render (um `Date`, um `{de,ate}`),
     * o número aqui seria o de renders — e a razão escrita no E253 para NÃO
     * consertar passaria a valer.
     */
    expect(avisoDoAtraso).toHaveBeenCalledTimes(1);
  });
});
