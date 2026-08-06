import { useEffect, useRef } from "react";
import { useBlocker } from "react-router";

/**
 * O texto do aviso de saída DENTRO do app. O `beforeunload` não tem texto
 * nosso — o navegador mostra o dele desde 2016 —, mas a navegação interna é
 * nossa, e aqui dá para dizer o que se perde.
 */
export const AVISO_DE_SAIDA =
  "Você tem coisa digitada que ainda não foi salva. Sair desta tela descarta o que está aqui.";

/**
 * D14/E97 + S13 — sair de um formulário com coisa digitada avisa, e agora
 * também quando a saída é um clique na sidebar.
 *
 * Agendar um atendimento e cadastrar uma noiva são formulários longos, e fechar
 * ou recarregar a aba descartava tudo sem uma palavra. A pessoa refazia, ou não
 * refazia: o atendimento não era marcado.
 *
 * **A metade que faltava, e por que ela faltava.** O backlog pedia
 * `useConfirmarSaida(isDirty)` "sobre o `useBlocker` do react-router 7", que
 * cobre também a navegação DENTRO do app. O E97 escreveu assim e a suíte E2E
 * derrubou quatro specs de uma vez: o app montava as rotas com
 * `<BrowserRouter>`, e `useBlocker` só existe em data router — fora dele ele
 * lança, e as telas onde o hook entrou paravam de renderizar. O épico registrou
 * a S13 dizendo que migrar o roteador "toca todas as rotas do app". **Tocou
 * uma:** `App.tsx` virou `createBrowserRouter(createRoutesFromElements(…))` sem
 * mexer em nenhum dos 59 `<Route>`, e o `useBlocker` passou a existir.
 *
 * As duas metades cobrem coisas diferentes e as duas continuam aqui:
 * o `beforeunload` cobre fechar a aba, recarregar e o voltar que sai do app —
 * ali o navegador mostra o texto DELE, não o nosso. O `useBlocker` cobre o que
 * o navegador não vê: clicar na sidebar, no breadcrumb, no botão que navega.
 *
 * **Só bloqueia mudança de `pathname`.** Trocar filtro na query string é a
 * mesma tela, e perguntar ali seria pedir confirmação para não sair de lugar
 * nenhum.
 *
 * **Cuidado (c) do épico:** o formulário continua sujo depois do submit
 * bem-sucedido, até o `reset()`. Quem navega ao salvar precisa passar
 * `sujo && !salvou` — ver `noiva-form.tsx`.
 *
 * **E `sujo && !salvou` NÃO basta, medido pelo E2E.** Com o `useBlocker` de pé,
 * `05-leads` e `59-confeccao-vira-peca` caíram: a pessoa salvava e a tela não
 * navegava. `salvou` e `isSubmitSuccessful` são estado do React, e a navegação
 * do save acontece ANTES do render que os liga — em `noiva-form.tsx` porque
 * quem navega é o pai, dentro do `await onSubmit`; em `interesses.tsx:189-190`
 * porque `setSalvou(true)` e `navigate()` estão no mesmo tick. O bloqueio lia o
 * valor velho e cancelava a navegação do próprio salvamento: no Playwright em
 * silêncio, e para quem vende como "você tem coisa que não foi salva" logo
 * depois de salvar — o aviso que treina quem usa a ignorar.
 *
 * Daí as duas saídas abaixo, que são UMA régua com os dois casos nomeados:
 * `sujoParaConfirmar` para quem usa react-hook-form, e o `liberarSaida` que
 * este hook devolve para quem navega à mão no mesmo tick — ele escreve num
 * `ref`, que vale na hora, e não num estado, que vale no próximo render.
 */
export function useConfirmarSaida(sujo: boolean): { liberarSaida: () => void } {
  // A navegação é síncrona; estado do React não é. O bloqueio precisa ler algo
  // que a linha anterior já mudou, e só o `ref` dá isso.
  const liberado = useRef(false);
  useEffect(() => {
    if (!sujo) return;
    const aoSair = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Compatibilidade: navegadores antigos leem o returnValue.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [sujo]);

  const bloqueio = useBlocker(
    ({ currentLocation, nextLocation }) =>
      sujo && !liberado.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (bloqueio.state !== "blocked") return;
    // O bloqueio fica "blocked" até alguém decidir. Não decidir é o pior dos
    // estados: a tela não navega e ninguém explica por quê.
    if (window.confirm(AVISO_DE_SAIDA)) bloqueio.proceed();
    else bloqueio.reset();
  }, [bloqueio]);

  return {
    liberarSaida: () => {
      liberado.current = true;
    },
  };
}

/** O que este hook precisa saber de um formulário de react-hook-form. */
export type EstadoDeFormulario = {
  isDirty: boolean;
  isSubmitting: boolean;
  isSubmitSuccessful: boolean;
};

/**
 * A régua de "sujo" para todo formulário de react-hook-form que navega ao
 * salvar — uma só, porque havia cinco grafias diferentes para o mesmo problema
 * nos 8 sítios do hook, e três delas não tinham guarda nenhuma.
 *
 * `isSubmitting` é o termo que faltava em todas: ele fica ligado durante o
 * `await` do salvamento, que é exatamente a janela em que a navegação do save
 * acontece. Sem ele, `isDirty && !isSubmitSuccessful` ainda é `true` na hora de
 * navegar, porque o react-hook-form só liga o `isSubmitSuccessful` depois que o
 * handler resolve.
 *
 * `tambemSujo` é para a tela que tem estado fora do formulário — a cabine com
 * nome digitado, os atributos escolhidos na ficha do vestido.
 */
export function sujoParaConfirmar(estado: EstadoDeFormulario, tambemSujo = false): boolean {
  return (estado.isDirty || tambemSujo) && !estado.isSubmitting && !estado.isSubmitSuccessful;
}
