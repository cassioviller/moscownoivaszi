/**
 * E157 — qual preço a peça cobra NESTA saída.
 *
 * O ateliê precifica pela vez em que a peça sai: o caderno anota `1º Aluguel`,
 * `2º Aluguel`, `Realuguel` — 7 vezes em 14 semanas —, e o sistema tinha um
 * preço só. A contagem já existia (`GET /vestidos/utilizacao`, da vida inteira
 * quando não se passa recorte); faltava alguém lê-la na hora de montar o item.
 *
 * **Sugere, não impõe.** É a mesma família do aviso do E154: a vendedora vê o
 * número e o motivo, e digita outro se a conversa pedir. Preço é conversa —
 * travar o campo trocaria uma régua útil por um atrito na frente da noiva.
 *
 * Núcleo puro: quem busca é a tela.
 */
export interface PecaComPreco {
  precoBase: number;
  /** Nulo = a peça não tem preço de segunda saída. */
  precoRealuguel?: number | null;
}

export interface PrecoSugerido {
  valor: number;
  /** Por que este preço — a frase que a tela mostra ao lado do campo. */
  motivo: string;
  /** True quando o preço veio da régua de realuguel, e não do base. */
  ehRealuguel: boolean;
}

/**
 * O preço a sugerir para uma peça que já saiu `locacoes` vezes.
 *
 * `locacoes` é quantos contratos ATIVOS já venderam esta peça — o passado, não
 * a venda que está sendo montada. Zero (ou peça sem preço de realuguel) devolve
 * o `precoBase`, que é o comportamento de sempre.
 */
export function precoDaSaida(peca: PecaComPreco, locacoes: number): PrecoSugerido {
  const realuguel = peca.precoRealuguel;
  if (locacoes < 1 || realuguel == null) {
    return {
      valor: peca.precoBase,
      motivo: locacoes < 1 ? "1ª saída desta peça" : "preço de tabela",
      ehRealuguel: false,
    };
  }
  // "2ª saída" na segunda vez, "3ª" na terceira: a noiva da vez é a próxima,
  // não a última registrada.
  return {
    valor: realuguel,
    motivo: `${locacoes + 1}ª saída desta peça — preço de realuguel`,
    ehRealuguel: true,
  };
}
