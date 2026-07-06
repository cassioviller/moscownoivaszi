// src/lib/url-interna.ts
// Guarda de redirecionamento: só aceita um caminho que pertença DE FATO à loja da sessão
// (fronteira de caminho, sem ".."), evitando que um `voltar` forjado leve a outra loja
// ou escape do prefixo. Senão, devolve o fallback.
export function caminhoInternoSeguro(valor: string, lojaId: string, fallback: string): string {
  const base = `/loja/${lojaId}`;
  const dentro = valor === base || valor.startsWith(`${base}/`) || valor.startsWith(`${base}?`);
  return dentro && !valor.includes("..") ? valor : fallback;
}
