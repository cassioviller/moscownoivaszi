// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router";
import { getPreviewComissaoQueryKey, getListComissaoRegrasQueryKey } from "@workspace/api-client-react";

/**
 * **S-R16 — o número que a dona lê antes de fechar a competência.**
 *
 * O card da Prévia é o que responde "quanto vou pagar este mês", e o clique
 * seguinte é "Fechar competência", que lança conta a pagar. Ele é calculado
 * pelo servidor a partir das regras ATIVAS
 * (`api-server/src/routes/comissao.ts:164`), e a tela tinha seis ações que
 * mexem nisso com **cinco grafias** da mesma invalidação — três delas sem a
 * chave do preview (regra 26: cinco grafias é a medida de que falta uma
 * régua).
 *
 * Este arquivo monta a tela e olha o que cada ação invalida. É o único lugar
 * onde a pergunta cabe: a chave certa numa lista pura não prova que o handler
 * a usa.
 */

// Içados junto com as fábricas de `vi.mock`, que são hoisted para o topo do
// arquivo e não enxergam `const` de módulo.
const { COMPETENCIA, LOJA } = vi.hoisted(() => ({ COMPETENCIA: "2026-03", LOJA: "l1" }));

const espioes = vi.hoisted(() => ({
  atualizarRegra: vi.fn(),
  removerRegra: vi.fn(),
  gerarFechamento: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  // `acessosModulos: null` é o superadmin — sem mapa, sem restrição.
  useAuth: () => ({ activeLojaId: LOJA, acessosModulos: null, user: { id: "u1" } }),
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const consulta = (data: unknown) => () => ({
    data,
    isPending: false,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  const inerte = () => ({ mutateAsync: vi.fn(), isPending: false });
  const mutacao = (spy: unknown) => () => ({ mutateAsync: spy, isPending: false });
  return {
    ...real,
    useListEquipe: consulta([{ id: "v1", nome: "Ana", email: "ana@x.com", ativo: true }]),
    useListComissaoRegras: consulta([
      {
        id: "r1",
        lojaId: LOJA,
        vendedoraId: "v1",
        ativo: true,
        bonusAcumulaFaixas: false,
        vigenciaInicio: "2026-01-01T12:00:00.000Z",
        faixas: [],
      },
    ]),
    usePreviewComissao: consulta([]),
    useListComissaoFechamentos: consulta([]),
    useListBaixasEstornoComissao: consulta([]),
    useListPendenciasComissao: consulta([]),
    useCreateComissaoRegra: inerte,
    useBaixarEstornoComissao: inerte,
    useReabrirComissaoFechamento: inerte,
    useSimularComissao: inerte,
    useUpdateComissaoRegra: mutacao(espioes.atualizarRegra),
    useDeleteComissaoRegra: mutacao(espioes.removerRegra),
    useGerarComissaoFechamento: mutacao(espioes.gerarFechamento),
  };
});

const { default: Comissoes } = await import("./index");

const CHAVE_PREVIA = getPreviewComissaoQueryKey(LOJA, { competencia: COMPETENCIA });
const CHAVE_REGRAS = getListComissaoRegrasQueryKey(LOJA);

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidadas: unknown[][] = [];
  vi.spyOn(client, "invalidateQueries").mockImplementation(async (filtros) => {
    invalidadas.push((filtros as { queryKey: unknown[] }).queryKey);
  });
  const roteador = createMemoryRouter([{ path: "/loja/:lojaId/comissoes", element: <Comissoes /> }], {
    initialEntries: [`/loja/${LOJA}/comissoes?competencia=${COMPETENCIA}`],
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup({ pointerEventsCheck: 0 }), invalidadas };
}

beforeEach(() => {
  for (const espiao of Object.values(espioes)) {
    espiao.mockReset();
    espiao.mockResolvedValue([]);
  }
});

describe("S-R16 — o card da Prévia acompanha o que mudou a comissão", () => {
  it("desativar a escada refaz a prévia", async () => {
    const { user, invalidadas } = montar();
    await user.click(screen.getByTestId("alternar-regra-r1"));
    expect(espioes.atualizarRegra).toHaveBeenCalledWith({
      lojaId: LOJA,
      regraId: "r1",
      data: { ativo: false },
    });

    expect(invalidadas).toContainEqual(CHAVE_REGRAS);
    /**
     * VERMELHO ANTES:
     * `expected [ [ '/lojas/:lojaId/comissao/regras', 'l1' ] ] to deep equally contain [ '/lojas/:lojaId/comissao/preview', 'l1', { competencia: '2026-03' } ]`
     *
     * `onAlternarRegra` invalidava só a lista de regras. A escada saía do
     * cálculo do servidor no mesmo instante, e o card da Prévia seguia
     * mostrando a comissão calculada COM ela — por 30 s de `PISO_DE_FRESCOR`
     * no melhor caso, e até a próxima navegação no caso real.
     */
    expect(invalidadas).toContainEqual(CHAVE_PREVIA);
  });

  it("remover a versão da escada refaz a prévia", async () => {
    const { user, invalidadas } = montar();
    await user.click(screen.getByRole("button", { name: /^Remover a versão de/ }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remover" }));
    expect(espioes.removerRegra).toHaveBeenCalledWith({ lojaId: LOJA, regraId: "r1" });

    /**
     * VERMELHO ANTES: o mesmo `to deep equally contain` da anterior. Aqui a
     * regra nem existe mais no banco, e a Prévia continuava paga por ela.
     */
    expect(invalidadas).toContainEqual(CHAVE_PREVIA);
  });

  it("fechar a competência refaz a prévia — ela troca de FONTE, não só de número", async () => {
    const { user, invalidadas } = montar();
    await user.click(screen.getByRole("button", { name: "Fechar competência" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Fechar competência" }));
    expect(espioes.gerarFechamento).toHaveBeenCalledWith({
      lojaId: LOJA,
      data: { competencia: COMPETENCIA },
    });

    /**
     * VERMELHO ANTES: o mesmo `to deep equally contain`.
     *
     * Competência FECHADA é imutável: a partir do fecho o preview responde da
     * memória do fechamento e não do cálculo ao vivo
     * (`api-server/src/routes/comissao.ts:963-969`). Sem invalidar, o número
     * na tela e o número que virou conta a pagar passam a ter fontes
     * diferentes — e o irmão `onReabrirFechamento` já invalidava esta chave,
     * que é o desenho da regra 26.
     */
    expect(invalidadas).toContainEqual(CHAVE_PREVIA);
  });
});
