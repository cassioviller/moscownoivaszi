import { centavos, parseValor } from "./dinheiro";

/**
 * E70 — conciliação por importação de extrato, sem tocar a rede.
 *
 * Sem gateway bancário, a conciliação era planilha: exportar o extrato do
 * banco, exportar o sistema, casar na mão. Aqui o usuário SOBE o arquivo que
 * o banco dele exporta (OFX ou CSV) e o pareamento acontece localmente:
 * parser e casamento são puros, testáveis, e nenhum byte sai da máquina.
 *
 * O casamento é por VALOR EXATO (centavos) com tolerância de data — valor é o
 * que o banco não erra; a data escorrega (compensação, fim de semana).
 */

export type TransacaoExtrato = {
  /** Dia do movimento no banco, "YYYY-MM-DD". */
  data: string;
  descricao: string;
  /** Reais, com sinal: entrada positiva, saída negativa. */
  valor: number;
};

export type ExtratoParseado =
  | { ok: true; formato: "ofx" | "csv"; transacoes: TransacaoExtrato[] }
  | { ok: false; erro: string };

// ───────────────────────────── OFX ─────────────────────────────

/** "20260715120000[-3:BRT]" → "2026-07-15". */
function diaDeDTPOSTED(cru: string): string | null {
  const m = cru.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Campo SGML: OFX de banco raramente fecha as tags — lê até quebra ou próxima tag. */
function campoOFX(bloco: string, tag: string): string | null {
  const m = bloco.match(new RegExp(`<${tag}>([^\\r\\n<]+)`, "i"));
  return m ? m[1].trim() : null;
}

export function parseExtratoOFX(texto: string): TransacaoExtrato[] {
  const transacoes: TransacaoExtrato[] = [];
  const blocos = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  for (const bloco of blocos) {
    const dtposted = campoOFX(bloco, "DTPOSTED");
    const trnamt = campoOFX(bloco, "TRNAMT");
    if (!dtposted || !trnamt) continue;
    const data = diaDeDTPOSTED(dtposted);
    // OFX fala decimal com PONTO; alguns bancos brasileiros mandam vírgula.
    // S-M23 (achado 1#3): "1.500,00" virava NaN — o replace de UMA vírgula
    // produzia "1.500.00", e a transação sumia do extrato EM SILÊNCIO: o PIX
    // de R$ 1.500,00 já lançado caía em "só no sistema" e o relançamento
    // contava R$ 1.500,00 duas vezes. O banco que manda vírgula decimal é o
    // mesmo que escreve ponto de milhar acima de mil — com vírgula presente,
    // a grafia é a pt-BR (pontos são milhar); sem vírgula, vale o spec OFX.
    const valor = trnamt.includes(",")
      ? Number(trnamt.replace(/\./g, "").replace(",", "."))
      : Number(trnamt);
    if (!data || !Number.isFinite(valor) || valor === 0) continue;
    const descricao = campoOFX(bloco, "MEMO") ?? campoOFX(bloco, "NAME") ?? "";
    transacoes.push({ data, descricao, valor });
  }
  return transacoes;
}

// ───────────────────────────── CSV ─────────────────────────────

/** "15/07/2026" ou "2026-07-15" → "YYYY-MM-DD"; outra coisa → null. */
function diaDeCSV(cru: string): string | null {
  const t = cru.trim().replace(/^"|"$/g, "");
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  return null;
}

/**
 * Uma célula numérica do CSV, e se ela está escrita como DINHEIRO.
 *
 * `monetario` é o que separa a quantia do número de documento: valor de
 * extrato vem com as duas casas (`1.500,00`, `-230.50`) ou com `R$` na frente;
 * documento vem inteiro, e quase sempre com zeros à esquerda (`000123`).
 *
 * A leitura pt-BR é a mesma régua do `parseValor` — `1.500` sem casas é mil e
 * quinhentos, não um e meio, e o parser antigo lia isso mil vezes menor.
 */
function valorDeCSV(cru: string): { valor: number; monetario: boolean } | null {
  const bruto = cru.trim().replace(/^"|"$/g, "");
  const semMoeda = bruto.replace(/^R\$\s*/i, "").trim();
  if (!semMoeda) return null;
  const n = parseValor(semMoeda);
  if (n === null || !Number.isFinite(n) || n === 0) return null;
  const monetario = /[.,]\d{2}$/.test(semMoeda) || /^R\$/i.test(bruto);
  return { valor: n, monetario };
}

/**
 * CSV de extrato: cada linha vira transação quando UMA célula parece data e
 * OUTRA parece valor — cabeçalhos e rodapés de total falham o teste e caem
 * fora sozinhos, sem exigir um layout fixo de banco.
 *
 * **O valor é a primeira célula escrita como DINHEIRO, não a primeira célula
 * numérica.** No layout `Data;Documento;Histórico;Valor;Saldo` — comum em
 * banco brasileiro — a regra antiga tomava o documento: a linha
 * `15/07/2026;000123;PIX RECEBIDO MARIA;1.500,00;12.345,67` saía valendo
 * R$ 123,00 no lugar de R$ 1.500,00. Como a conciliação casa por valor EXATO
 * em centavos, o recebimento verdadeiro caía em `soSistema`, um fantasma de
 * R$ 123,00 caía em `soExtrato`, e com toda linha do arquivo sofrendo o mesmo
 * a tela declarava o mês inteiro divergente — devolvendo à mão exatamente o
 * trabalho que o E70 existe para eliminar.
 *
 * As demais numéricas (o saldo acumulado, o documento) são descartadas: não
 * são o movimento e também não são descrição.
 *
 * **S-M5 — o delimitador é do ARQUIVO, e se decide uma vez.** A regra antiga
 * (`linha.includes(";") ? ";" : ","`) decidia linha a linha: num arquivo de
 * vírgulas, a linha `15/07/2026,TED JOAO; REF 50,1.500.00` era fatiada pelo
 * `;`, a célula de data deixava de existir e o lançamento SUMIA sem erro — a
 * conciliação então punha o recebimento verdadeiro em `soSistema` e mandava
 * lançar de novo: R$ 1.500,00 contados duas vezes. Aqui o texto inteiro é
 * lido com cada candidato e fica o que produz mais transações; no empate
 * ganha o `;`, que é o padrão de banco brasileiro (a vírgula é o decimal — um
 * arquivo DE vírgulas com valores de vírgula decimal nem existe). O arquivo
 * de `;` lido por `,` racha as quantias no decimal e não produz quase nada,
 * então a disputa não é apertada: é a contagem dizendo qual régua é a do
 * arquivo.
 */
function parseCSVComDelimitador(texto: string, delimitador: ";" | ","): TransacaoExtrato[] {
  const transacoes: TransacaoExtrato[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const celulas = linha.split(delimitador);
    let data: string | null = null;
    let monetario: number | null = null;
    let qualquerNumero: number | null = null;
    const resto: string[] = [];
    for (const celula of celulas) {
      const comoDia = diaDeCSV(celula);
      if (comoDia && data === null) {
        data = comoDia;
        continue;
      }
      const comoValor = valorDeCSV(celula);
      if (comoValor !== null) {
        if (comoValor.monetario && monetario === null) monetario = comoValor.valor;
        if (qualquerNumero === null) qualquerNumero = comoValor.valor;
        continue;
      }
      resto.push(celula.trim().replace(/^"|"$/g, ""));
    }
    // Sem nenhuma célula escrita como dinheiro (extrato sem centavos), a
    // primeira numérica volta a ser a aposta — é tudo o que a linha oferece.
    const valor = monetario ?? qualquerNumero;
    if (data && valor !== null) {
      transacoes.push({ data, descricao: resto.filter(Boolean).join(" ").trim(), valor });
    }
  }
  return transacoes;
}

export function parseExtratoCSV(texto: string): TransacaoExtrato[] {
  const porPontoEVirgula = parseCSVComDelimitador(texto, ";");
  const porVirgula = parseCSVComDelimitador(texto, ",");
  return porPontoEVirgula.length >= porVirgula.length ? porPontoEVirgula : porVirgula;
}

export function parseExtrato(texto: string): ExtratoParseado {
  if (/<OFX>|<STMTTRN>/i.test(texto)) {
    const transacoes = parseExtratoOFX(texto);
    return transacoes.length > 0
      ? { ok: true, formato: "ofx", transacoes }
      : { ok: false, erro: "O arquivo parece OFX mas não tem transações legíveis." };
  }
  const transacoes = parseExtratoCSV(texto);
  return transacoes.length > 0
    ? { ok: true, formato: "csv", transacoes }
    : {
        ok: false,
        erro:
          "Nenhuma transação reconhecida. O arquivo precisa ser um OFX ou um CSV com colunas de data e valor.",
      };
}

// ───────────────────────── Conciliação ─────────────────────────

export type MovimentoSistema = {
  id: string;
  /** "YYYY-MM-DD" do movimento no sistema. */
  data: string;
  descricao: string;
  /** Reais, sempre positivo. */
  valor: number;
  tipo: "recebimento" | "pagamento";
};

export type ParConciliado = { transacao: TransacaoExtrato; movimento: MovimentoSistema };

export type Conciliacao = {
  casadas: ParConciliado[];
  soExtrato: TransacaoExtrato[];
  soSistema: MovimentoSistema[];
};

const MS_DIA = 86_400_000;

function diasDeDistancia(a: string, b: string): number {
  return Math.abs(
    (new Date(`${a}T12:00:00-03:00`).getTime() - new Date(`${b}T12:00:00-03:00`).getTime()) /
      MS_DIA,
  );
}

/**
 * Casa cada transação do extrato com no máximo UM movimento do sistema:
 * mesmo sentido (entrada↔recebimento, saída↔pagamento), mesmo valor em
 * centavos, e a data mais próxima dentro da tolerância. Ambíguo (dois
 * candidatos ao mesmo valor) resolve pelo mais próximo em data — determinista.
 */
export function conciliarExtrato(
  transacoes: readonly TransacaoExtrato[],
  movimentos: readonly MovimentoSistema[],
  opcoes: { toleranciaDias?: number } = {},
): Conciliacao {
  const tolerancia = opcoes.toleranciaDias ?? 2;
  const casadas: ParConciliado[] = [];
  const usados = new Set<string>();

  const soExtrato: TransacaoExtrato[] = [];
  for (const transacao of transacoes) {
    const sentido: MovimentoSistema["tipo"] = transacao.valor > 0 ? "recebimento" : "pagamento";
    const alvoC = centavos(Math.abs(transacao.valor));
    let melhor: MovimentoSistema | null = null;
    let melhorDist = Infinity;
    for (const movimento of movimentos) {
      if (usados.has(movimento.id) || movimento.tipo !== sentido) continue;
      if (centavos(movimento.valor) !== alvoC) continue;
      const dist = diasDeDistancia(transacao.data, movimento.data);
      if (dist <= tolerancia && dist < melhorDist) {
        melhor = movimento;
        melhorDist = dist;
      }
    }
    if (melhor) {
      usados.add(melhor.id);
      casadas.push({ transacao, movimento: melhor });
    } else {
      soExtrato.push(transacao);
    }
  }

  const soSistema = movimentos.filter((m) => !usados.has(m.id));
  return { casadas, soExtrato, soSistema };
}
