import { useEffect } from "react";

/**
 * D14/E97 — sair de um formulário com coisa digitada passa a avisar.
 *
 * Agendar um atendimento e cadastrar uma noiva são formulários longos, e
 * fechar ou recarregar a aba descartava tudo sem uma palavra. A pessoa refazia,
 * ou não refazia: o atendimento não era marcado.
 *
 * **O que este hook NÃO faz, e por quê.** O backlog pedia
 * `useConfirmarSaida(isDirty)` "sobre o `useBlocker` do react-router 7", que
 * cobriria também a navegação DENTRO do app — clicar na sidebar, voltar no
 * navegador. Escrevi assim, e a suíte E2E derrubou quatro specs de uma vez: o
 * app monta as rotas com `<BrowserRouter>` (`App.tsx:160`), e `useBlocker` só
 * existe em data router (`createBrowserRouter` + `RouterProvider`). Fora dele
 * ele lança, e as três telas onde o hook entrou paravam de renderizar.
 *
 * Migrar o roteador é mudança estrutural em todas as rotas do app — grande
 * demais para caber num item 🟡 de um épico que já é G. Fica registrado como
 * sobra, e este hook entrega a metade que funciona sem ela.
 *
 * A metade que fica é real: o `beforeunload` cobre fechar a aba, recarregar e
 * o voltar que sai do app. O navegador mostra o texto DELE, não o nosso — a
 * mensagem customizada é ignorada por padrão desde 2016, e isso é decisão dos
 * fabricantes, não limitação daqui.
 *
 * **Cuidado (c) do épico:** o formulário continua sujo depois do submit
 * bem-sucedido, até o `reset()`. Quem navega ao salvar precisa passar
 * `sujo && !salvou` — ver `noiva-form.tsx`.
 */
export function useConfirmarSaida(sujo: boolean): void {
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
}
