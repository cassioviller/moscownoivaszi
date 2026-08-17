// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router";

/**
 * **S-R7 — apagar a segunda opção apagava a terceira.**
 *
 * A tela nasceu na S-O131 (as portas do superadmin e do catálogo ganham gesto)
 * e já foi consertada uma vez, na S-O146 (ela caía ao abrir). O que ficou é
 * mais silencioso: o alvo do "apagar opção" era resolvido pela POSIÇÃO
 * (`opcoesOrdenadas[index]`), e as duas listas que essa posição indexa mudam
 * em ritmos diferentes.
 *
 * `fields` vem do `useFieldArray` e é congelado no mount — a `key` do
 * formulário é o id do ATRIBUTO, que não muda quando uma opção sai, e não há
 * `reset()` nem `remove()`. `opcoesOrdenadas` vem da prop e ENCOLHE no refetch
 * que a invalidação dispara. Depois do primeiro apagar os dois índices deixam
 * de ser o mesmo índice.
 *
 * O `e2e/64` cobre esta tela e não pega isto: ele apaga UMA opção e em seguida
 * o atributo inteiro. O defeito só existe a partir do SEGUNDO clique.
 *
 * Este arquivo monta a tela de verdade — o defeito mora em QUANDO a lista de
 * linhas é decidida, e nenhuma função pura enxerga isso (regra 25).
 */

const OPCOES_INICIAIS = [
  { id: "o1", valor: "Branco", ordem: 0, ativo: true },
  { id: "o2", valor: "Champagne", ordem: 1, ativo: true },
  { id: "o3", valor: "Marfim", ordem: 2, ativo: true },
];

/**
 * Um servidor de mentira com o comportamento que importa: apagar tira a opção
 * da lista, e quem estiver montado é avisado — que é o que a invalidação de
 * `getListAtributosQueryKey` faz na tela real.
 */
const servidor = vi.hoisted(() => {
  let opcoes: { id: string; valor: string; ordem: number; ativo: boolean }[] = [];
  const ouvintes = new Set<() => void>();
  return {
    reiniciar(iniciais: typeof opcoes) {
      opcoes = [...iniciais];
      ouvintes.clear();
    },
    lista: () => opcoes,
    apagar(id: string) {
      opcoes = opcoes.filter((o) => o.id !== id);
      for (const f of [...ouvintes]) f();
    },
    inscrever(f: () => void) {
      ouvintes.add(f);
      return () => {
        ouvintes.delete(f);
      };
    },
  };
});

const apagarOpcao = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ activeLojaId: "l1" }) }));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const inerte = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    ...real,
    useListAtributos: () => {
      const [, forcar] = useState(0);
      useEffect(() => servidor.inscrever(() => forcar((v) => v + 1)), []);
      return {
        data: [
          { id: "a1", lojaId: "l1", nome: "Cor", tipo: "OPCAO_UNICA", ativo: true, ordem: 0, opcoes: servidor.lista() },
        ],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    },
    useUpdateAtributo: inerte,
    useCreateAtributoOpcao: inerte,
    useUpdateAtributoOpcao: inerte,
    useDeleteAtributo: inerte,
    useDeleteAtributoOpcao: () => ({ mutateAsync: apagarOpcao, isPending: false }),
  };
});

const { default: EditarAtributo } = await import("./editar");

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const roteador = createMemoryRouter(
    [
      { path: "/loja/:lojaId/catalogo/:atributoId/editar", element: <EditarAtributo /> },
      { path: "/loja/:lojaId/catalogo", element: <p>catálogo</p> },
    ],
    { initialEntries: ["/loja/l1/catalogo/a1/editar"] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>,
  );
  // O Radix desliga `pointer-events` do body enquanto o diálogo está aberto.
  return userEvent.setup({ pointerEventsCheck: 0 });
}

/**
 * Clica no X da linha rotulada com o valor e confirma no diálogo. Devolve o
 * texto do diálogo — ou `""` se o clique não abriu diálogo nenhum, que é o
 * no-op silencioso que este arquivo persegue.
 */
async function apagarPelaLinha(user: ReturnType<typeof userEvent.setup>, valor: string) {
  await user.click(screen.getByRole("button", { name: `Apagar opção ${valor}` }));
  const dialogo = screen.queryByRole("alertdialog");
  if (!dialogo) return "";
  const texto = dialogo.textContent ?? "";
  await user.click(screen.getByTestId("confirmar-apagar-opcao"));
  return texto;
}

const rotulosDasLinhas = () =>
  screen
    .getAllByRole("button", { name: /^Apagar opção/ })
    .map((b) => b.getAttribute("aria-label")?.replace("Apagar opção ", ""));

beforeEach(() => {
  servidor.reiniciar(OPCOES_INICIAIS);
  apagarOpcao.mockReset();
  apagarOpcao.mockImplementation(async ({ opcaoId }: { opcaoId: string }) => {
    servidor.apagar(opcaoId);
  });
  localStorage.clear();
});

describe("S-R7 — a opção que sai é a opção em que se clicou", () => {
  it("a linha apagada some da tela", async () => {
    const user = montar();
    expect(rotulosDasLinhas()).toEqual(["Branco", "Champagne", "Marfim"]);

    await apagarPelaLinha(user, "Branco");
    expect(apagarOpcao).toHaveBeenLastCalledWith({ lojaId: "l1", opcaoId: "o1" });

    /**
     * VERMELHO ANTES:
     * `expected [ 'Branco', 'Champagne', 'Marfim' ] to deeply equal [ 'Champagne', 'Marfim' ]`
     *
     * A linha do "Branco" continuava na tela depois de o servidor confirmar
     * que ela saiu — `fields` é do mount e ninguém o encolhia. Quem clicasse
     * nela de novo tomaria o 404 da porta.
     */
    expect(rotulosDasLinhas()).toEqual(["Champagne", "Marfim"]);
  });

  it("o clique na linha seguinte apaga a linha seguinte, não a de baixo", async () => {
    const user = montar();
    await apagarPelaLinha(user, "Branco");
    apagarOpcao.mockClear();

    /**
     * VERMELHO ANTES:
     * `expected "spy" to be called with arguments: [ { lojaId: 'l1', opcaoId: 'o2' } ]`
     * `Received: { "lojaId": "l1", "opcaoId": "o3" }`
     * e, na frase do diálogo, `expected 'Apagar a opção "Marfim"?…' to contain 'Champagne'`.
     *
     * A linha rotulada "Champagne" estava no índice 1 de `fields` (congelado
     * em três) e `opcoesOrdenadas[1]` já era o **Marfim**: o clique apagava a
     * opção de BAIXO, e o diálogo perguntava por ela enquanto o dedo estava no
     * X do Champagne.
     */
    const dialogo = await apagarPelaLinha(user, "Champagne");
    expect(dialogo).toContain("Champagne");
    expect(apagarOpcao).toHaveBeenCalledWith({ lojaId: "l1", opcaoId: "o2" });
  });

  it("a última linha não é um no-op silencioso", async () => {
    const user = montar();
    await apagarPelaLinha(user, "Branco");
    apagarOpcao.mockClear();

    /**
     * VERMELHO ANTES: `expected "spy" to be called 1 times, but got 0 times`.
     * A última linha caía em `opcoesOrdenadas[2]`, que passou a ser
     * `undefined` — o `if (opcao)` engolia o clique e a tela não dizia nada.
     */
    await apagarPelaLinha(user, "Marfim");
    expect(apagarOpcao).toHaveBeenCalledTimes(1);
    expect(apagarOpcao).toHaveBeenCalledWith({ lojaId: "l1", opcaoId: "o3" });
  });

  it("apagar não deixa o formulário sujo — o aviso de saída é sobre o que foi DIGITADO", async () => {
    const user = montar();
    await apagarPelaLinha(user, "Branco");

    /**
     * O `remove()` do `useFieldArray` resolveria o encolhimento e ligaria
     * `isDirty`: sair da tela passaria a perguntar "você tem coisa digitada
     * que ainda não foi salva" logo depois de um gesto que já foi salvo — o
     * aviso que treina quem usa a ignorar (a lição da S13/E97). No Playwright
     * o `confirm` é auto-dismissado e o `e2e/64` morreria calado no clique
     * seguinte.
     */
    const confirmar = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmar);
    await user.click(screen.getByRole("link", { name: "Cancelar" }));
    expect(confirmar).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("o que foi digitado continua avisando na saída", async () => {
    const user = montar();
    await apagarPelaLinha(user, "Branco");
    await user.clear(screen.getByRole("textbox", { name: "Opção Champagne" }));
    await user.type(screen.getByRole("textbox", { name: "Opção Champagne" }), "Champanhe");

    const confirmar = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmar);
    await user.click(screen.getByRole("link", { name: "Cancelar" }));
    expect(confirmar).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
