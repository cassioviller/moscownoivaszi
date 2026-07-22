import { centavos } from "./dinheiro";

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
    const valor = Number(trnamt.replace(",", "."));
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

/** Valor pt-BR ("1.234,56", "-100,00") ou com ponto decimal ("‑100.00"). */
function valorDeCSV(cru: string): number | null {
  const t = cru.trim().replace(/^"|"$/g, "").replace(/^R\$\s*/i, "");
  if (!t) return null;
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalizado);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/**
 * CSV de extrato: cada linha vira transação quando UMA célula parece data e
 * OUTRA parece valor — cabeçalhos e rodapés de total falham o teste e caem
 * fora sozinhos, sem exigir um layout fixo de banco.
 */
export function parseExtratoCSV(texto: string): TransacaoExtrato[] {
  const transacoes: TransacaoExtrato[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const celulas = linha.split(linha.includes(";") ? ";" : ",");
    let data: string | null = null;
    let valor: number | null = null;
    const resto: string[] = [];
    for (const celula of celulas) {
      const comoDia = diaDeCSV(celula);
      if (comoDia && data === null) {
        data = comoDia;
        continue;
      }
      const comoValor = valorDeCSV(celula);
      if (comoValor !== null) {
        // O valor do movimento é a PRIMEIRA célula numérica; as seguintes
        // (saldo acumulado) são descartadas — saldo não é movimento nem
        // descrição.
        if (valor === null) valor = comoValor;
        continue;
      }
      resto.push(celula.trim().replace(/^"|"$/g, ""));
    }
    if (data && valor !== null) {
      transacoes.push({ data, descricao: resto.filter(Boolean).join(" ").trim(), valor });
    }
  }
  return transacoes;
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
