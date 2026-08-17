import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * S-RM17 (E261) — **a janela não alarga sozinha.**
 *
 * O E260 achou o defeito causando-o: dois `fill()` seguidos nos campos De e Até
 * da folha declararam `2024-04-04..2026-08-01` à contabilidade e carimbaram
 * **302 recebimentos** de verdade no `heliumdb`. Duas edições no mesmo frame, e
 * a segunda não continha o que a primeira pôs — `?ini=2024-04-04` virou
 * `?fim=2024-04-04`, sem o `ini`. Sozinho isso seria janela errada; o que o
 * torna dinheiro é o `resolverIntervalo`, que TROCA as pontas quando `ini > fim`
 * (`financeiro-core/src/datas.ts:188`): perdido o `ini`, ele volta ao 1º dia do
 * mês corrente, fica maior que o `fim` recém-digitado, e a troca devolve dois
 * anos e quatro meses sobre um botão de mão única.
 *
 * **O conserto que o diagnóstico prescrevia não conserta, e isso foi medido.**
 * A prescrição era o updater funcional de `setSearchParams`, lido da assinatura
 * de tipos do `react-router@7.18.1`. A implementação diz outra coisa
 * (`react-router/dist/development/chunk-KS7C4IRE.mjs:10851-10860`):
 *
 * ```js
 * let setSearchParams = React.useCallback(
 *   (nextInit, navigateOptions) => {
 *     const newSearchParams = createSearchParams(
 *       typeof nextInit === "function" ? nextInit(new URLSearchParams(searchParams)) : nextInit
 *     );
 *     …
 *   },
 *   [navigate, searchParams]   // ← o `searchParams` da RENDERIZAÇÃO
 * );
 * ```
 *
 * O updater recebe `new URLSearchParams(searchParams)` — o `searchParams` que o
 * `useCallback` capturou naquele render. Ele é tão velho quanto o que o handler
 * leria sozinho. Medido em `lib/escrita-na-url.test.tsx`: a forma funcional
 * perdia o `ini` exatamente como a forma antiga.
 *
 * O que falta é um acumulador do FRAME — a URL que já foi pedida e ainda não
 * assentou. É o que este hook é. Ele **não é global por gosto**: as escritas de
 * uma tela vêm de instâncias diferentes do hook (a tela escreve `etapa` e o
 * `useBuscaNaUrl` escreve `q`, cada um com o seu `useSearchParams`), e um `ref`
 * por componente deixaria essas duas se atropelando. O acumulador vive no módulo
 * porque o roteador do app é UM (`App.tsx:356`, `createBrowserRouter`).
 *
 * E ele se cura sozinho: a cada render, se a URL de verdade difere da última que
 * escrevemos, **a URL ganha** — voltar, um link, ou qualquer navegação de fora
 * reinicia o acumulador. Por isso um valor deixado por outro teste (ou por outro
 * roteador) não sobrevive ao primeiro render.
 */

/** A última URL que ESTE módulo pediu, e o resultado dela. */
let ultimaPedida: string | null = null;
let acumulado: URLSearchParams = new URLSearchParams();

/** Só para os testes: esquece o frame em curso. */
export function esquecerFrameDaUrl() {
  ultimaPedida = null;
  acumulado = new URLSearchParams();
}

type Atualizador = (atual: URLSearchParams) => URLSearchParams;

/**
 * Troca `useSearchParams()` com a MESMA forma de uso — o que muda é que o
 * updater recebe a URL do momento da APLICAÇÃO, e não a da renderização.
 *
 * A grafia é uma só, e o tipo a obriga: o primeiro argumento é sempre uma
 * função. Passar um `URLSearchParams` pronto perde o que outro handler acabou de
 * pôr; passar um objeto literal perde todo parâmetro que a tela não conhece.
 */
export function useEscritaNaUrl(): [
  URLSearchParams,
  (atualizar: Atualizador, opcoes?: { replace?: boolean }) => void,
] {
  const [searchParams, setSearchParams] = useSearchParams();

  // Durante o render, e não num efeito: entre duas escritas do mesmo frame não
  // roda efeito nenhum, e é justamente esse intervalo que o acumulador cobre.
  const daUrl = searchParams.toString();
  if (ultimaPedida !== daUrl) {
    acumulado = new URLSearchParams(daUrl);
    ultimaPedida = daUrl;
  }

  const escrever = useCallback(
    (atualizar: Atualizador, opcoes?: { replace?: boolean }) => {
      const proximo = atualizar(new URLSearchParams(acumulado));
      acumulado = proximo;
      ultimaPedida = proximo.toString();
      setSearchParams(proximo, opcoes);
    },
    [setSearchParams],
  );

  return [searchParams, escrever];
}
