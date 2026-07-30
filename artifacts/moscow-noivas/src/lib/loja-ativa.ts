/**
 * Quem manda na loja ativa: a URL.
 *
 * D1 (rodada 6) — dois `useEffect` escreviam o MESMO `activeLojaId` a partir
 * de fontes opostas (a sessão, em `use-auth.tsx`; a URL, em `app-layout.tsx`),
 * ambos com `activeLojaId` nas dependências. Com a loja da URL diferente da
 * loja da sessão, cada `set` reativava o outro até o React abortar com
 * "Maximum update depth exceeded" — a aba a 100% de CPU e a tela em branco,
 * reproduzido no navegador antes do conserto.
 *
 * A decisão de produto que o conserto exigia, em uma frase: **a URL ganha**.
 * Não é preferência de estilo — o servidor não deixa alternativa. O
 * `requireSessaoComLoja` (api-server/src/middlewares/auth.ts) responde **403**
 * a toda request cujo `:lojaId` do path difira do `lojaAtivaId` da SESSÃO. Um
 * bookmark para `/loja/B` com a sessão em A não tem como funcionar sem que
 * alguém diga ao servidor "agora é B". Então a divergência deixa de ser uma
 * corrida entre efeitos e vira uma AÇÃO explícita: `selecionarLoja(B)`.
 *
 * Este módulo é a decisão sozinha — função pura, sem React e sem rede, para
 * que ela possa ser lida e testada como regra e não como efeito colateral.
 */

export type DecisaoDeLoja =
  /** URL e sessão concordam: renderiza a loja. */
  | { tipo: "seguir"; lojaId: string }
  /**
   * URL ≠ sessão e a loja da URL é da pessoa: pede a troca ao servidor
   * (o bookmark / deep-link). Acontece no máximo uma vez por loja de URL.
   */
  | { tipo: "reivindicar"; lojaId: string }
  /**
   * URL ≠ sessão DEPOIS de esta aba já ter reivindicado a loja da URL — ou
   * seja, quem mudou a sessão foi OUTRA aba. Reivindicar de novo seria um
   * pingue-pongue pela rede entre as duas abas, cada uma puxando a sessão de
   * volta para a sua loja. Esta aba segue a sessão, com redirect explícito.
   */
  | { tipo: "seguir-a-sessao"; lojaId: string }
  /** A loja da URL não é da pessoa (ou não há sessão de loja): quem escolhe é ela. */
  | { tipo: "escolher" };

export function decidirLojaDaUrl(entrada: {
  /** `:lojaId` da rota `/loja/:lojaId/…`. */
  urlLojaId: string | undefined;
  /** `lojaAtivaId` da sessão do SERVIDOR (o que o guard da API compara). */
  lojaAtivaId: string | null | undefined;
  /** As lojas que a pessoa pode acessar (`/auth/me`); superadmin recebe todas. */
  lojas: readonly { id: string }[] | undefined;
  /** A loja que ESTA aba já pediu ao servidor nesta montagem, se alguma. */
  jaReivindicada: string | null;
}): DecisaoDeLoja {
  const { urlLojaId, lojaAtivaId, lojas, jaReivindicada } = entrada;

  if (!urlLojaId) return { tipo: "escolher" };
  if (urlLojaId === lojaAtivaId) return { tipo: "seguir", lojaId: urlLojaId };

  // Loja que não é da pessoa: o servidor recusaria de qualquer forma, e um
  // 403 em toda query é uma tela quebrada sem explicação. A escolha é dela.
  const podeAcessar = (lojas ?? []).some((l) => l.id === urlLojaId);
  if (!podeAcessar) return { tipo: "escolher" };

  if (jaReivindicada === urlLojaId) {
    // Já pedimos esta loja e a sessão está em outra: outra aba trocou.
    return lojaAtivaId ? { tipo: "seguir-a-sessao", lojaId: lojaAtivaId } : { tipo: "escolher" };
  }

  return { tipo: "reivindicar", lojaId: urlLojaId };
}
