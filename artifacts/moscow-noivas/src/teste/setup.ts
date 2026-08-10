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
