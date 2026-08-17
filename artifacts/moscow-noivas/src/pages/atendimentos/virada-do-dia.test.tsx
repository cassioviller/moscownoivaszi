// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * **S-RM11 — os três baldes da fila, numa aba que atravessa a meia-noite.**
 *
 * A fila de `/atendimentos` reparte o dia em atrasados · hoje · próximos, e o
 * corte é `hojeLocal()` lido DENTRO do `useMemo` (`index.tsx:224`), com as
 * dependências `[lista, historico]`. Nenhuma das duas muda à meia-noite: a
 * recepcionista que deixou a tela aberta chega às 8h e a prova das 9h30 continua
 * em "Próximos", numa seção que ela já leu ontem.
 *
 * Este teste não desmonta nada — é a única diferença para o que o E253 mediu na
 * S-R17, e é justamente a diferença que a S-RM7 achou. O dia vira com a aba de
 * pé, e o `useDiaLocal()` (E256) é quem faz o render acontecer.
 */

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ activeLojaId: "l1", acessosModulos: null, user: { id: "u1" } }),
}));

/**
 * **As referências ficam PARADAS — a lição da S-RM12, aplicada antes de o
 * harness mentir.**
 *
 * O `useMemo` da lista depende de `atendimentos.data`. Uma mock que devolvesse
 * `{ data: [...] }` novo a cada chamada recalcularia tudo por render, e o teste
 * passaria a medir o instrumento: a virada apareceria "consertada" mesmo com o
 * `hojeLocal()` de volta lá dentro, porque a dependência nova já força o
 * recálculo. Constantes de módulo, como `sino-virada-do-dia.test.tsx`.
 */
/** 00h30 do dia 18/08 em São Paulo (UTC−3) — meia hora DEPOIS da virada. */
const MEIA_NOITE_E_MEIA = new Date("2026-08-18T03:30:00.000Z");
const ATENDIMENTO = {
  id: "a1",
  lojaId: "l1",
  leadId: "lead-1",
  cabineId: "c1",
  vendedoraId: "v1",
  tipo: "ATENDIMENTO",
  inicio: MEIA_NOITE_E_MEIA,
  situacao: "AGENDADO",
  contatadoEm: null,
  confirmadoEm: null,
  remarcacaoPedidaEm: null,
  lead: { id: "lead-1", noivaNome: "Ana" },
};
const LISTA = {
  data: [ATENDIMENTO],
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: () => {},
};
const EQUIPE = { data: [] as never[], isLoading: false, isError: false };
const MUTACAO = { mutateAsync: async () => ({}), isPending: false };

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    useListAtendimentos: () => LISTA,
    useListEquipe: () => EQUIPE,
    useUpdateAtendimento: () => MUTACAO,
    useCreateOrcamento: () => MUTACAO,
  };
});

const { default: Atendimentos } = await import("./index");

/** 23h59 do dia 17/08 em São Paulo — um minuto antes da virada. */
const ANTES_DA_VIRADA = new Date("2026-08-18T02:59:00.000Z");

function montarAFila() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/loja/l1/atendimentos"]}>
        <Atendimentos />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(ANTES_DA_VIRADA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("S-RM11 — a fila reparte o dia NOVO sem que a aba seja recarregada", () => {
  it("a prova das 00h30 sai de 'Próximos' e entra em 'Hoje' quando o dia vira", async () => {
    montarAFila();

    // Às 23h59 do dia 17 ela é de amanhã, e a régua está certa: "Hoje" mostra o
    // vazio e a seção "Próximos" existe por causa dela.
    expect(screen.getByText("Nenhum atendimento hoje.")).toBeInTheDocument();
    expect(screen.getByText("Próximos")).toBeInTheDocument();

    // A aba fica aberta. Passam dois minutos e o dia vira — sem remontar nada.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });

    /**
     * VERMELHO ANTES (com `const hoje = hojeLocal()` de volta dentro do
     * `useMemo` do `:218`, régua da regra 34):
     *
     * ```
     * Error: expect(element).not.toBeInTheDocument()
     *
     * expected document not to contain element, found <p
     *   class="text-sm text-muted-foreground"
     * >
     *   Nenhum atendimento hoje.
     * </p> instead
     * ```
     *
     * A tela não re-renderiza à meia-noite, então `t0`/`t1` continuam os de
     * ontem e o atendimento das 00h30 segue em "Próximos" — a seção que a
     * recepcionista já leu.
     */
    expect(screen.queryByText("Nenhum atendimento hoje.")).not.toBeInTheDocument();
    expect(screen.queryByText("Próximos")).not.toBeInTheDocument();
    expect(screen.getByTestId("linha-atendimento-a1")).toBeInTheDocument();
  });

  it("antes da virada nada se mexe — o conserto não é 'a fila remonta sozinha'", async () => {
    montarAFila();

    // Trinta segundos: ainda é dia 17, e o balde tem de continuar o mesmo.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(screen.getByText("Nenhum atendimento hoje.")).toBeInTheDocument();
    expect(screen.getByText("Próximos")).toBeInTheDocument();
  });
});
