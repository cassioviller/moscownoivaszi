import { useParams } from "react-router";

/**
 * Caminho dentro da loja atual. As rotas reais vivem sob `/loja/:lojaId/…`; um
 * link absoluto tipo `/contratos/x` só chega lá pelo catch-all LegacyRedirect,
 * que é compatibilidade transitória para deep-links antigos — e uma ida e volta
 * de navegação a cada clique. Mesma montagem da sidebar.
 *
 * A9/E99 — ele morava em `pages/financeiro/helpers.tsx`, e não é do financeiro:
 * é de qualquer tela que precise montar um link. Enquanto esteve lá, um
 * componente compartilhado que quisesse usá-lo (o `<SemWhatsApp>` do E98/F3) teria
 * de importar uma página — então ele reimplementou a montagem com `useParams`,
 * que é como uma régua vira duas.
 */
export function useCaminhoDaLoja(): (caminho: string) => string {
  const { lojaId } = useParams();
  return (caminho) => `/loja/${lojaId}${caminho}`;
}
