// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * **S-RM11, a metade que a sobra calou: a prévia do carnê é DINHEIRO.**
 *
 * A sobra descreve a classe como lista desatualizada — o painel e a agenda
 * ficando em ontem. Duas das dez leituras são outra coisa: em
 * `contratos/[id].tsx:360` e `orcamentos/[id].tsx:540` o dia congelado é o
 * `vencimentoEntrada` que `planoDaDigitacao` usa para datar a ENTRADA do carnê,
 * e a tela promete, na linha logo acima da prévia: *"A entrada, se houver,
 * vence hoje."*
 *
 * Numa aba aberta pela virada ela vence ONTEM. E as duas telas erram de jeitos
 * DIFERENTES, o que a sobra também não separa:
 *
 * - **Aqui, no contrato**, a tela não manda `vencimentoEntrada` no corpo do
 *   `gerar-plano` (`:542`), e o servidor cai no `hojeLocal()` DELE
 *   (`financeiro-core/src/plano.ts:95`). A prévia mostra 31/07 e o banco grava
 *   01/08: **a tela mente sobre o que vai ser gravado.**
 * - **No orçamento**, `plano.linhas` VIRA o corpo do `POST /contratos`
 *   (`orcamentos/[id].tsx:987`). Tela e servidor concordam, e os dois estão
 *   errados: o contrato nasce com a entrada vencida.
 *
 * O exemplo é o do dia 31, que é onde a conta troca de mês: entrada de
 * R$ 1.000,00 num contrato de R$ 5.000,00, aba aberta às 23h59 de 31/07/2026. À
 * meia-noite a prévia continua dizendo **31/07/2026** — competência 2026-07 —
 * enquanto o `gerar-plano` grava **01/08/2026**, competência 2026-08. O recibo
 * da 7ª, o aging da cobrança e a mora da 9ª contam a partir da data GRAVADA; a
 * vendedora combinou a da tela.
 */

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ activeLojaId: "l1", acessosModulos: null, user: { id: "u1" } }),
}));

/** Referências paradas — a lição da S-RM12 (o harness não pode fingir instabilidade). */
const CONTRATO = {
  id: "c1",
  lojaId: "l1",
  leadId: "lead-1",
  orcamentoId: null,
  status: "ATIVO",
  valorTotal: "5000.00",
  descontoTipo: null,
  descontoValor: null,
  cpf: null,
  formaPagamento: null,
  dataCasamento: null,
  dataRetirada: null,
  dataDevolucao: null,
  prazoDevolucaoReservaDias: null,
  fechadoEm: new Date("2026-07-20T12:00:00.000Z"),
  canceladoEm: null,
  canceladoMotivo: null,
  vestidoDescricao: null,
  lead: { id: "lead-1", noivaNome: "Ana" },
  vendedora: { id: "v1", nome: "Bia" },
  itens: [],
  parcelas: [],
  pecas: [],
  rescisao: null,
};
const CONTRATO_QUERY = {
  data: CONTRATO,
  isLoading: false,
  isError: false,
  refetch: () => {},
};
const RECIBOS = { data: { recibos: [] as never[] }, isLoading: false, isError: false };
const DISPONIBILIDADE = { data: undefined, isLoading: false, isError: false };
const MUTACAO = { mutateAsync: async () => ({}), isPending: false, mutate: () => {} };

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    useGetContrato: () => CONTRATO_QUERY,
    useListRecibos: () => RECIBOS,
    useGetDisponibilidade: () => DISPONIBILIDADE,
    useCancelarContrato: () => MUTACAO,
    useUpdateContrato: () => MUTACAO,
    useGerarPlanoParcelas: () => MUTACAO,
    useEstornarParcela: () => MUTACAO,
    useRemoveParcela: () => MUTACAO,
    usePerdoarMora: () => MUTACAO,
    useRestabelecerMora: () => MUTACAO,
  };
});

const { default: ContratoDetail } = await import("./[id]");

/** 23h59 de 31/07/2026 em São Paulo (UTC−3) — um minuto antes da virada de MÊS. */
const VESPERA = new Date("2026-08-01T02:59:00.000Z");

function montarOContrato() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/loja/l1/contratos/c1"]}>
        <Routes>
          <Route path="/loja/:lojaId/contratos/:id" element={<ContratoDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // O carnê que a vendedora digita: R$ 1.000,00 de entrada e 4× a partir de
  // 10/09. A prévia nasce do que está nos campos, e é o objeto que ela envia.
  fireEvent.change(screen.getByLabelText("Entrada (opcional)"), { target: { value: "1000" } });
  fireEvent.change(screen.getByLabelText("Nº de parcelas"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("1ª parcela vence em *"), {
    target: { value: "2026-09-10" },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(VESPERA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("S-RM11 — a entrada do carnê vence HOJE, e hoje muda à meia-noite", () => {
  it("às 23h59 de 31/07 a prévia data a entrada em 31/07 — e às 00h01 ela passa a 01/08", async () => {
    montarOContrato();

    // A tela promete isto na letra, logo acima da prévia.
    expect(
      screen.getByText(/A entrada, se houver, vence hoje\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Entrada de R\$ 1\.000,00 em 31\/07\/2026/)).toBeInTheDocument();

    // A aba fica aberta. Passam dois minutos e o mês vira — sem remontar nada.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });

    /**
     * VERMELHO ANTES (com `vencimentoEntrada: hojeLocal()` de volta no
     * `useMemo` do `:351`, régua da regra 34): a prévia não re-renderiza, e o
     * `getByText` de 01/08 não acha nada.
     *
     * ```
     * TestingLibraryElementError: Unable to find an element with the text:
     * /Entrada de R\$ 1\.000,00 em 01\/08\/2026/.
     * ```
     *
     * O que ficava na tela era a linha de 31/07 — a entrada vencendo ONTEM,
     * na competência do mês passado, enquanto o `gerar-plano` gravaria 01/08.
     */
    expect(screen.getByText(/Entrada de R\$ 1\.000,00 em 01\/08\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Entrada de R\$ 1\.000,00 em 31\/07\/2026/)).not.toBeInTheDocument();
  });

  it("antes da virada a prévia fica parada — o dia é uma string, e string igual não recalcula", async () => {
    montarOContrato();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(screen.getByText(/Entrada de R\$ 1\.000,00 em 31\/07\/2026/)).toBeInTheDocument();
  });
});
