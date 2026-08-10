// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, Outlet, RouterProvider, createMemoryRouter } from "react-router";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AVISO_DE_SAIDA, sujoParaConfirmar, useConfirmarSaida } from "./use-confirmar-saida";

/**
 * S13 — o clique na sidebar com o formulário sujo deixa de descartar em
 * silêncio.
 *
 * O E97 tentou isto e a suíte E2E derrubou quatro specs: `useBlocker` só existe
 * em data router, e o app montava `<BrowserRouter>`. A sobra ficou com o
 * diagnóstico certo e o TAMANHO errado — "toca todas as rotas do app" sobre
 * meia dúzia de linhas em um arquivo.
 *
 * O teste roda em `createMemoryRouter`, que é data router como o
 * `createBrowserRouter` do `App.tsx`, e não sobe servidor nem banco.
 */

function Formulario({ sujo }: { sujo: boolean }) {
  useConfirmarSaida(sujo);
  return (
    <div>
      <p>formulário</p>
      <Link to="/vestidos">Vestidos</Link>
      <Link to="/formulario?filtro=hoje">mesmo caminho, outra query</Link>
    </div>
  );
}

function montar(sujo: boolean) {
  const roteador = createMemoryRouter(
    [
      {
        element: <Outlet />,
        children: [
          { path: "/formulario", element: <Formulario sujo={sujo} /> },
          { path: "/vestidos", element: <p>acervo</p> },
        ],
      },
    ],
    { initialEntries: ["/formulario"] },
  );
  render(<RouterProvider router={roteador} />);
  return roteador;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("S13/useConfirmarSaida — a navegação de dentro do app", () => {
  it("formulário sujo: o clique pergunta, e recusar mantém a pessoa na tela", async () => {
    const confirmar = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmar);
    montar(true);

    await userEvent.click(screen.getByRole("link", { name: "Vestidos" }));

    expect(confirmar).toHaveBeenCalledWith(AVISO_DE_SAIDA);
    // Este é o vermelho que o E97 não conseguia produzir: antes da migração o
    // hook nem chegava aqui — `useBlocker` lançava.
    expect(screen.getByText("formulário")).toBeInTheDocument();
    expect(screen.queryByText("acervo")).not.toBeInTheDocument();
  });

  it("formulário sujo: aceitar segue para a tela pedida", async () => {
    const confirmar = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmar);
    montar(true);

    await userEvent.click(screen.getByRole("link", { name: "Vestidos" }));

    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("acervo")).toBeInTheDocument();
  });

  it("formulário limpo: não pergunta nada", async () => {
    const confirmar = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmar);
    montar(false);

    await userEvent.click(screen.getByRole("link", { name: "Vestidos" }));

    expect(confirmar).not.toHaveBeenCalled();
    expect(await screen.findByText("acervo")).toBeInTheDocument();
  });

  it("trocar a query string da MESMA tela não pergunta", async () => {
    // Filtro de lista, aba, ordenação: a pessoa não está saindo de lugar
    // nenhum, e perguntar ali transformaria o aviso em ruído — que é como um
    // aviso deixa de ser lido.
    const confirmar = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmar);
    const roteador = montar(true);

    await userEvent.click(screen.getByRole("link", { name: "mesmo caminho, outra query" }));

    expect(confirmar).not.toHaveBeenCalled();
    expect(roteador.state.location.search).toBe("?filtro=hoje");
  });
});

/**
 * O que os quatro testes acima não alcançavam, e o E2E alcançou.
 *
 * Com o `useBlocker` de pé, `05-leads` e `59-confeccao-vira-peca` caíram: a
 * pessoa salvava e a tela não navegava. Os testes de cima montam o hook com um
 * booleano já decidido, e o defeito mora justamente em QUANDO esse booleano é
 * decidido — durante o salvamento, quando `isDirty` ainda é `true` e
 * `isSubmitSuccessful` ainda não é.
 */
describe("sujoParaConfirmar — a régua que faltava aos 8 sítios", () => {
  const limpo = { isDirty: false, isSubmitting: false, isSubmitSuccessful: false };

  it("durante o salvamento NÃO está sujo, que é a janela em que a tela navega", () => {
    // Este é o defeito que derrubou dois specs do E2E: `isDirty && !isSubmitSuccessful`
    // continua `true` aqui, e o bloqueio cancelava a navegação do próprio save.
    expect(sujoParaConfirmar({ ...limpo, isDirty: true, isSubmitting: true })).toBe(false);
  });

  it("depois do salvamento bem-sucedido não está sujo, mesmo com o form ainda `isDirty`", () => {
    expect(sujoParaConfirmar({ ...limpo, isDirty: true, isSubmitSuccessful: true })).toBe(false);
  });

  it("digitado e parado está sujo — é o caso que o aviso existe para cobrir", () => {
    expect(sujoParaConfirmar({ ...limpo, isDirty: true })).toBe(true);
  });

  it("salvar e FALHAR volta a proteger: é quando perder o que foi digitado dói mais", () => {
    expect(sujoParaConfirmar({ ...limpo, isDirty: true, isSubmitting: false })).toBe(true);
  });

  it("estado fora do formulário conta como sujo, e obedece às mesmas duas guardas", () => {
    expect(sujoParaConfirmar(limpo, true)).toBe(true);
    expect(sujoParaConfirmar({ ...limpo, isSubmitting: true }, true)).toBe(false);
  });
});

describe("a régua de saída é UMA, e a varredura cobra isso", () => {
  it("todo sítio de useConfirmarSaida passa pela régua compartilhada", () => {
    const raiz = path.resolve(import.meta.dirname, "..");
    const arquivos = execFileSync("git", ["ls-files", "-z", "*.tsx"], {
      cwd: path.resolve(raiz, "../../.."),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
      .split("\0")
      .filter((p) => p.startsWith("artifacts/moscow-noivas/src/"))
      .filter((p) => !p.endsWith("use-confirmar-saida.test.tsx"));

    expect(arquivos.length).toBeGreaterThan(50);

    const foraDaRegua: string[] = [];
    let sitios = 0;
    for (const rel of arquivos) {
      const fonte = readFileSync(path.resolve(raiz, "../../..", rel), "utf8");
      for (const m of fonte.matchAll(/useConfirmarSaida\(([\s\S]{0,120}?)\)[;,\s]/g)) {
        sitios += 1;
        const arg = m[1];
        // Ou usa a régua de react-hook-form, ou é a tela que navega à mão e
        // libera a saída pelo `ref` — não há terceira grafia.
        const ok = arg.includes("sujoParaConfirmar") || fonte.includes("liberarSaida()");
        if (!ok) foraDaRegua.push(`${rel}: useConfirmarSaida(${arg.trim().slice(0, 60)}…`);
      }
    }
    // Os 8 sítios de hoje. Se nascer um nono, ele entra na régua ou aparece aqui.
    expect(sitios).toBeGreaterThanOrEqual(8);
    expect(foraDaRegua).toEqual([]);
  });
});
