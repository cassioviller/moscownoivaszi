/**
 * E124/B4 — a busca do balcão: a noiva na sua frente quer pagar, e a linha
 * dela precisa aparecer PELO NOME, mesmo vencendo fora da janela em vista.
 *
 * Duas decisões puras, testadas sem tela:
 *
 * 1. `casaComBusca` — o casamento nome × busca, insensível a caixa e acento
 *    ("joao" acha "João"): no balcão ninguém digita acento no caixa.
 * 2. `recorteDaConsulta` — QUAL recorte pedir ao servidor. Com busca, a janela
 *    não se aplica: a régua é a mesma do F29/E98 em "Atrasadas" ("atraso não
 *    tem janela") — aqui, "a pessoa na sua frente não tem janela". Pede as
 *    ABERTAS da loja inteira e filtra o nome no cliente (o dado do nome já
 *    desce em cada parcela desde o E3/E98).
 */

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** True se o nome contém a busca, ignorando caixa e acentos. Busca vazia não casa. */
export function casaComBusca(nome: string | null | undefined, busca: string): boolean {
  const alvo = normalizar(busca);
  if (!alvo) return false;
  return normalizar(nome ?? "").includes(alvo);
}

export type RecorteParcelas =
  | { status: "abertas" }
  | { de: string; ate: string };

/**
 * O recorte que a tela de Receber pede ao servidor.
 * Busca ativa OU filtro "atrasadas" → abertas sem janela; senão, a janela.
 */
export function recorteDaConsulta(opts: {
  buscando: boolean;
  semJanela: boolean;
  iniYMD: string;
  fimYMD: string;
}): RecorteParcelas {
  if (opts.buscando || opts.semJanela) return { status: "abertas" };
  return { de: opts.iniYMD, ate: opts.fimYMD };
}
