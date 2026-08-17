// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import {
  getListLojasQueryKey,
  getListUsuariosQueryKey,
  getListAuditoriaGlobalQueryKey,
  getGetConsolidadoQueryKey,
} from "@workspace/api-client-react";

/**
 * **S-R19 — os três cartões da mesma tela contavam histórias diferentes.**
 *
 * O console de superadmin mostra, um embaixo do outro: a rede neste mês (uma
 * linha por loja ATIVA), a lista de lojas, a lista de pessoas e a **Auditoria
 * global** — que existe, na letra do próprio componente, para dizer *"quem
 * apagou que loja, quem apagou que pessoa"*.
 *
 * Os dois botões que produzem exatamente esses dois fatos refaziam só a lista
 * de onde a linha saiu. Apagava-se a loja, ela sumia da tabela do meio, e o
 * cartão da auditoria — logo abaixo, na mesma rolagem — seguia dizendo
 * "nenhum ato global registrado". O `e2e/64` só via a trilha porque dá
 * `page.reload()` antes de olhar.
 */

const espioes = vi.hoisted(() => ({ apagarLoja: vi.fn(), apagarUsuario: vi.fn(), salvarLoja: vi.fn() }));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u1", nome: "Dona", isSuperAdmin: true }, acessosModulos: null }),
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
    useListLojas: consulta([
      { id: "loja-1", nome: "Moscow Noivas", chave: "moscow", ativo: true },
      { id: "loja-2", nome: "Moscow Sul", chave: "sul", ativo: true },
    ]),
    useListUsuarios: consulta([
      { id: "u1", nome: "Dona", email: "dona@x.com", ativo: true, isSuperAdmin: true, lojas: [] },
      { id: "u2", nome: "Ana", email: "ana@x.com", ativo: true, isSuperAdmin: false, lojas: [] },
    ]),
    useGetConsolidado: consulta([]),
    useListAuditoriaGlobal: consulta([]),
    useCreateLoja: inerte,
    useCreateUsuario: inerte,
    useUpdateUsuario: inerte,
    useUpdateLoja: mutacao(espioes.salvarLoja),
    useDeleteLoja: mutacao(espioes.apagarLoja),
    useDeleteUsuario: mutacao(espioes.apagarUsuario),
  };
});

const { default: AdminConsole } = await import("./index");

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidadas: unknown[][] = [];
  vi.spyOn(client, "invalidateQueries").mockImplementation(async (filtros) => {
    invalidadas.push((filtros as { queryKey: unknown[] }).queryKey);
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminConsole />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup({ pointerEventsCheck: 0 }), invalidadas };
}

beforeEach(() => {
  for (const espiao of Object.values(espioes)) {
    espiao.mockReset();
    espiao.mockResolvedValue(undefined);
  }
});

describe("S-R19 — apagar no console refaz os cartões que o ato mudou", () => {
  it("apagar a loja refaz a lista, a auditoria global e o consolidado da rede", async () => {
    const { user, invalidadas } = montar();
    await user.click(screen.getByTestId("apagar-loja-loja-2"));
    await user.click(screen.getByTestId("confirmar-apagar-loja"));
    expect(espioes.apagarLoja).toHaveBeenCalledWith({ lojaId: "loja-2" });

    expect(invalidadas).toContainEqual(getListLojasQueryKey());
    /**
     * VERMELHO ANTES:
     * `expected [ [ '/api/admin/lojas' ] ] to deep equally contain [ '/api/admin/auditoria-global' ]`
     *
     * A trilha do ato acabado de praticar. É a única lista da tela cujo
     * conteúdo o clique GERA, e era a que o clique não refazia.
     */
    expect(invalidadas).toContainEqual(getListAuditoriaGlobalQueryKey());
    /**
     * VERMELHO ANTES:
     * `expected [ [ '/api/admin/lojas' ] ] to deep equally contain [ '/api/admin/consolidado' ]`
     *
     * "A rede neste mês" é uma linha por loja ATIVA. Com duas lojas, apagar
     * uma deveria fazer a seção inteira desaparecer (ela só aparece a partir
     * de duas) — e ela seguia mostrando o funil e o caixa de uma loja que já
     * não existe.
     */
    expect(invalidadas).toContainEqual(getGetConsolidadoQueryKey());
  });

  it("apagar a pessoa refaz a lista e a auditoria global", async () => {
    const { user, invalidadas } = montar();
    await user.click(screen.getByTestId("apagar-usuario-u2"));
    await user.click(screen.getByTestId("confirmar-apagar-usuario"));
    expect(espioes.apagarUsuario).toHaveBeenCalledWith({ usuarioId: "u2" });

    expect(invalidadas).toContainEqual(getListUsuariosQueryKey());
    /** VERMELHO ANTES: o mesmo `to deep equally contain` sobre a auditoria. */
    expect(invalidadas).toContainEqual(getListAuditoriaGlobalQueryKey());
  });

  it("desativar a loja refaz o consolidado — a rede é feita de lojas ATIVAS", async () => {
    const { user, invalidadas } = montar();
    await user.click(screen.getByTestId("editar-loja-loja-2"));
    await user.click(screen.getByRole("switch", { name: "Loja ativa" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(espioes.salvarLoja).toHaveBeenCalled();

    /**
     * VERMELHO ANTES:
     * `expected [ [ '/api/admin/lojas' ] ] to deep equally contain [ '/api/admin/consolidado' ]`
     *
     * Desativar não apaga, mas tira a linha do consolidado do mesmo jeito
     * (`api-server/src/routes/admin.ts:699` filtra por `ativo = true`).
     */
    expect(invalidadas).toContainEqual(getGetConsolidadoQueryKey());
  });
});
