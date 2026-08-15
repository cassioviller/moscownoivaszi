// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter, type RouteObject } from "react-router";
import { rotas } from "./App";

/**
 * S13 — a migração para data router não pode perder uma rota, e nada mais
 * olhava para isso.
 *
 * O E97 não usou `useBlocker` porque o app montava as rotas com
 * `<BrowserRouter>`; a sobra estimou a migração como "toca todas as rotas do
 * app". Ela toca ZERO: `createRoutesFromElements` come a árvore JSX como está.
 * Mas "come como está" é uma afirmação, e afirmação sem régua envelhece — uma
 * rota apagada por engano na migração só apareceria no E2E, e só se algum spec
 * abrisse justamente aquela URL.
 *
 * Este teste conta a árvore DEPOIS da conversão, que é o que o roteador de
 * verdade recebe. Ele não sobe navegador nem toca banco.
 */

/** Achata a árvore em caminhos completos, como o roteador os casa. */
function caminhos(nos: RouteObject[], prefixo = ""): string[] {
  return nos.flatMap((no) => {
    const proprio = no.path
      ? no.path.startsWith("/")
        ? no.path
        : `${prefixo.replace(/\/$/, "")}/${no.path}`
      : prefixo;
    const aqui = no.index ? [`${proprio || "/"} (index)`] : no.path ? [proprio] : [];
    return [...aqui, ...caminhos(no.children ?? [], proprio)];
  });
}

describe("S13 — a árvore de rotas sobrevive ao data router", () => {
  const todos = caminhos(rotas);

  it("o limite de Suspense é rota-layout SEM path, e é a raiz única", () => {
    // Rota sem path não casa URL nenhuma: ela existe só para pendurar o
    // `<Suspense>` acima de todas. Se ela ganhasse um path, TODA URL do app
    // mudaria de uma vez.
    expect(rotas).toHaveLength(1);
    expect(rotas[0].path).toBeUndefined();
    expect(rotas[0].children).toBeDefined();
  });

  it("as 59 rotas da migração seguem lá — mais a ficha do trabalho (S-A17)", () => {
    // 59 é a contagem do `App.tsx` antes da migração — o número que a sobra
    // dizia que "toca todas". A 60ª é `/ajustes/:ajusteId`, criada DEPOIS
    // (S-A17): rota nova de propósito passa por aqui, rota perdida também.
    expect(todos).toHaveLength(61);
    expect(todos).toContain("/loja/:lojaId/ajustes/:ajusteId");
  });

  it("as rotas públicas, as de loja e as de admin continuam casando", () => {
    // Uma amostra por família: pública sem sessão, escopo de loja (o aninhado,
    // que é onde um erro de achatamento apareceria), e o console fora do
    // AppLayout.
    expect(todos).toContain("/login");
    expect(todos).toContain("/noiva/:token");
    expect(todos).toContain("/loja/:lojaId/dashboard");
    expect(todos).toContain("/loja/:lojaId/noivas/:leadId/interesses");
    expect(todos).toContain("/loja/:lojaId/financeiro/conciliacao");
    expect(todos).toContain("/loja/:lojaId/*");
    expect(todos).toContain("/admin/perfis");
    // O catch-all da raiz é o `LegacyRedirect`: /dashboard antigo vira
    // /loja/:id/dashboard. Perdê-lo quebraria todo deep-link velho de uma vez.
    expect(todos).toContain("/*");
  });

  it("`vestidos/estoque` continua ANTES de `vestidos/:id`", () => {
    // E154: invertido, "estoque" vira um id e a tela de estoque some. O
    // ranking do data router é por especificidade e não dependeria da ordem,
    // mas a ordem do arquivo é o que documenta a intenção — e foi ela que o
    // E154 consertou.
    expect(todos.indexOf("/loja/:lojaId/vestidos/estoque")).toBeLessThan(
      todos.indexOf("/loja/:lojaId/vestidos/:id"),
    );
  });

  it("nenhuma rota ganhou `loader` ou `action`", () => {
    // A razão pela qual a migração custou meia dúzia de linhas: não havia
    // nada para migrar. Se alguém acrescentar um, é decisão de arquitetura e
    // passa por aqui de propósito.
    const comData = (nos: RouteObject[]): RouteObject[] =>
      nos.flatMap((no) => [
        ...(no.loader || no.action ? [no] : []),
        ...comData(no.children ?? []),
      ]);
    expect(comData(rotas)).toEqual([]);
  });

  /**
   * O data router captura erro de render e traz uma tela padrão PRÓPRIA, que o
   * `<BrowserRouter>` não tinha. Sem `errorElement`, a vendedora passaria a ler
   * *"Unexpected Application Error!"* com a pilha do `Error` num `<pre>` — a
   * mesma classe do "HTTP 404 Not Found" que o E92 matou e do texto de
   * protocolo que o `<Erro>` do E99 nasceu consertando.
   */
  it("erro de render mostra frase de gente, e a pilha só no console", () => {
    const noConsole = vi.spyOn(console, "error").mockImplementation(() => {});
    function Explode(): never {
      throw new Error("estourei no render");
    }
    // A rota-raiz do app — o MESMO `element` e o MESMO `errorElement` que o
    // `App.tsx` registra — com um filho que estoura.
    const raiz = rotas[0];
    const r = createMemoryRouter(
      [
        {
          element: raiz.element,
          errorElement: raiz.errorElement,
          children: [{ path: "/", element: <Explode /> }],
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={r} />);

    expect(screen.getByText("Esta tela quebrou")).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument();
    expect(screen.queryByText(/estourei no render/)).not.toBeInTheDocument();
    // E o suporte não perde o erro: ele vai para o console.
    expect(noConsole).toHaveBeenCalledWith("Erro de rota:", expect.any(Error));
    noConsole.mockRestore();
  });
});
