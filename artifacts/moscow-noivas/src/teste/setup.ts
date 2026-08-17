import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * S15 — o mínimo para um componente ser montado num teste.
 *
 * `jest-dom/vitest` traz os matchers de DOM (`toBeInTheDocument`), e o
 * `cleanup` desmonta a árvore entre casos: sem ele, o segundo `render` do mesmo
 * arquivo acha DOIS botões com o mesmo nome e o teste falha por um motivo que
 * não tem nada a ver com o que ele pergunta.
 */
afterEach(cleanup);

/**
 * **S-R7 — o `ResizeObserver` que o jsdom não tem.**
 *
 * Todo componente do Radix que mede a si mesmo (`Checkbox`, `AlertDialog`,
 * `Popover`, `Select`) chama `new ResizeObserver` num efeito de layout, e o
 * jsdom não implementa a API. Sem este trecho, montar QUALQUER tela do app cai
 * em `ReferenceError: ResizeObserver is not defined` — o teste da S-R7 morria
 * no `render` antes de perguntar o que quer que fosse, e a mensagem não tinha
 * nada a ver com a pergunta.
 *
 * Observar de mentira é o suficiente: nenhum teste daqui pergunta tamanho de
 * elemento, porque o jsdom não faz layout — ele reporta 0 para tudo.
 */
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}
