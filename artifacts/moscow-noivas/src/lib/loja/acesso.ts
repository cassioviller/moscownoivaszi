// src/lib/loja/acesso.ts
// Regras de roteamento da loja ativa — puras, sem I/O (testáveis sem cookies()).

export type AcessoLoja = { ok: true } | { ok: false; redirectTo: string };

/**
 * Espelhamento: a URL `/loja/[lojaId]` tem que bater com a loja ativa da sessão.
 * Qualquer divergência (loja alheia, inexistente, lixo) cai na MESMA saída:
 * redirect para a URL canônica da loja ativa. Falha-fechada — nunca renderiza
 * dado de uma loja que não é a ativa.
 */
export function resolverAcessoLoja(lojaIdUrl: string, lojaAtivaId: string): AcessoLoja {
  if (lojaIdUrl !== lojaAtivaId) {
    return { ok: false, redirectTo: `/loja/${lojaAtivaId}` };
  }
  return { ok: true };
}

/** Link "Trocar loja" só faz sentido para quem tem mais de uma loja. */
export function mostrarTrocaLoja(qtdLojas: number): boolean {
  return qtdLojas > 1;
}
