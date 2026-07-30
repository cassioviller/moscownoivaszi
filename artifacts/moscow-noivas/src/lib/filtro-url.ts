/**
 * E129 (D5) — o filtro mora na URL, e a URL fica LIMPA no padrão.
 *
 * Filtro em `useState` não morre só no F5 — morre no unmount: filtrar a fila,
 * abrir uma noiva e voltar zerava tudo, 3 gestos de novo a cada ida-e-volta.
 * E o link não viajava: a dona filtrava e mandava a URL, a colega abria a
 * fila padrão. A convenção já era da casa em 13 telas (`ini`/`fim`, `recorte`,
 * `dia`…); este módulo é a gramática de ESCRITA que faltava para as 6 que
 * ficaram no lado errado:
 *
 * - **default fora da URL**: quando tudo é padrão, a URL é a rota nua — o
 *   bookmark antigo continua significando "a tela padrão".
 * - **vazio é ausência**: busca apagada remove `q`, não deixa `q=`.
 * - **o resto da URL é dos outros**: `?quando=historico`, `?vista=funil` e
 *   qualquer param que a tela não esteja escrevendo atravessam intactos.
 *
 * Função pura sobre URLSearchParams — a tela só faz
 * `setSearchParams((p) => comFiltros(p, {...}), { replace: true })` (replace:
 * digitação de busca não pode poluir o histórico do navegador).
 */
export function comFiltros(
  atual: URLSearchParams,
  mudancas: Record<string, string | number | null | undefined>,
  defaults: Record<string, string> = {},
): URLSearchParams {
  const params = new URLSearchParams(atual);
  for (const [nome, valor] of Object.entries(mudancas)) {
    const texto = valor === null || valor === undefined ? "" : String(valor);
    if (texto === "" || texto === defaults[nome]) params.delete(nome);
    else params.set(nome, texto);
  }
  return params;
}

/** A página lida da URL: inteiro ≥ 1, e qualquer lixo volta para 1. */
export function paginaDaUrl(params: URLSearchParams): number {
  const n = Number(params.get("pagina"));
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * O filtro por atributo de vestido (E41) é um mapa atributoId → opcaoId; na
 * URL ele vira UM param legível (`atributos=id:op,id:op`) em vez de um param
 * por UUID. Codec com ida e volta testadas — entrada malformada é descartada
 * em silêncio (URL editada à mão não pode derrubar a tela).
 */
export function atributosParaParam(filtros: Record<string, string>): string {
  return Object.entries(filtros)
    .map(([atributoId, opcaoId]) => `${atributoId}:${opcaoId}`)
    .join(",");
}

export function atributosDoParam(texto: string | null): Record<string, string> {
  const filtros: Record<string, string> = {};
  if (!texto) return filtros;
  for (const par of texto.split(",")) {
    const [atributoId, opcaoId] = par.split(":");
    if (atributoId && opcaoId) filtros[atributoId] = opcaoId;
  }
  return filtros;
}
