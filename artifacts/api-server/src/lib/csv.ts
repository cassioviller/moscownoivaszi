/**
 * CSV seguro para exportação contábil — extraído de folha.ts quando pagar e
 * receber ganharam exportação própria (E5). A prova anti-injeção (C5) vive em
 * lote16-folha-unit e vale para todo consumidor daqui.
 */

const ABRE_COMO_FORMULA = /^[=+\-@\t\r]/;
const NUMERO_PURO = /^-?\d+(?:\.\d+)?$/;

/**
 * Escapa um campo para CSV (RFC 4180): só entra entre aspas quando precisa, e
 * aspas internas dobram. Sem isso, uma descrição como `Aluguel "sala 2", jul`
 * quebraria a linha em colunas extras e a contabilidade importaria valores na
 * coluna errada — o tipo de erro que ninguém vê até o fechamento.
 *
 * Também neutraliza INJEÇÃO DE FÓRMULA: um campo que abre com `= + - @` (ou
 * tab/CR) é executado como fórmula ao abrir no Excel/Sheets — um fornecedor
 * chamado `=cmd|'/c calc'!A1` viraria comando. O arquivo vai justo para a
 * contabilidade, aberto sem desconfiança. Prefixar apóstrofo faz a planilha
 * tratar como texto. Um número legítimo — inclusive negativo, como `-50.00` na
 * coluna Valor — é preservado: só o que abre como fórmula E não é número puro
 * vira texto.
 */
export function escaparCsv(campo: string): string {
  const seguro = ABRE_COMO_FORMULA.test(campo) && !NUMERO_PURO.test(campo) ? `'${campo}` : campo;
  if (/[",\r\n]/.test(seguro)) return `"${seguro.replace(/"/g, '""')}"`;
  return seguro;
}

/**
 * Junta cabeçalho+linhas num CSV canônico: vírgula, decimal com ponto, CRLF.
 * O BOM fica a cargo de quem serve (detalhe de transporte, não de conteúdo).
 */
export function montarCsv(linhas: readonly (readonly string[])[]): string {
  return linhas.map((l) => l.map(escaparCsv).join(",")).join("\r\n") + "\r\n";
}

/** O que `responderCsv` precisa de um `Response` — estrutural de propósito,
 * para o teste de unidade provar o envelope sem subir Express. */
export type RespostaCsv = {
  status(code: number): RespostaCsv;
  type(tipo: string): RespostaCsv;
  setHeader(nome: string, valor: string): unknown;
  send(corpo: string): unknown;
};

/**
 * O envelope HTTP de todo CSV que sai do sistema (S35 — estava copiado em
 * quatro rotas): 200, `text/csv; charset=utf-8`, attachment com o nome dado, e
 * o BOM — sem ele o Excel lê UTF-8 como latin-1 e "comissão" vira "comissÃ£o".
 * `nomeArquivo` vai SEM a extensão; o `.csv` é daqui.
 */
export function responderCsv(res: RespostaCsv, nomeArquivo: string, csv: string): void {
  res
    .status(200)
    .type("text/csv; charset=utf-8")
    .setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}.csv"`);
  res.send("\ufeff" + csv);
}
