/**
 * Datas do financeiro. Há DOIS tipos de data neste módulo e confundi-los é a
 * origem clássica de erro de um dia:
 *
 * - **Data de negócio** (`vencimento`, `casamentoData`): nasce ancorada ao
 *   meio-dia de São Paulo (`diaParaISO` em lib/formatos.ts), então o dia UTC
 *   já É o dia de negócio → use `diaDeNegocio`.
 * - **Instante** (`recebidoEm`, `pagamento.data`): é o momento real em que o
 *   dinheiro se moveu. O dia dele só existe num fuso → use `diaLocal`. Ler um
 *   instante em UTC joga todo movimento entre 21h e meia-noite para o dia
 *   seguinte, e o caixa do dia fecha errado.
 *
 * Fuso da loja: America/Sao_Paulo (offset fixo -03:00, sem DST desde 2019 —
 * mesma premissa de lib/disponibilidade.ts no servidor).
 */

const FUSO_LOJA = "America/Sao_Paulo";

// en-CA formata como "YYYY-MM-DD".
const formatadorDiaLocal = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_LOJA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia (YYYY-MM-DD) em que um INSTANTE caiu no fuso da loja. */
export function diaLocal(instante: Date | string): string {
  return formatadorDiaLocal.format(new Date(instante));
}

/** Dia (YYYY-MM-DD) de uma DATA DE NEGÓCIO (ancorada ao meio-dia SP). */
export function diaDeNegocio(data: Date | string): string {
  return new Date(data).toISOString().slice(0, 10);
}

/**
 * O mesmo dia de negócio escrito como a noiva lê: DD/MM/AAAA.
 *
 * Nasce aqui, e não na rota, porque a régua de formatadores (S30) diz onde
 * formatador pode nascer — e porque a inversão não precisa de `Intl` nenhum:
 * `diaDeNegocio` já resolveu a parte difícil, que é qual dia é. Duas rotas
 * declararam `new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" })` para
 * imprimir a mesma frase de validade vencida; a varredura reprovou as duas.
 */
export function diaBR(data: Date | string): string {
  const [ano, mes, dia] = diaDeNegocio(data).split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Instante em que o dia local começa em São Paulo. */
export function inicioDoDia(dia: string): Date {
  return new Date(`${dia}T00:00:00-03:00`);
}

/** Hoje (YYYY-MM-DD) no fuso da loja. */
export function hojeLocal(): string {
  return diaLocal(new Date());
}

// ── Competência "YYYY-MM" ──

export function competenciaValida(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** Competência do mês corrente no fuso da loja. */
export function competenciaAtual(): string {
  return hojeLocal().slice(0, 7);
}

/** Primeiro dia (YYYY-MM-DD) do mês de um dia de referência. */
export function primeiroDiaDoMes(refYMD: string): string {
  return `${refYMD.slice(0, 7)}-01`;
}

/** Último dia (YYYY-MM-DD) do mês de um dia de referência (lida com 28/29/30/31). */
export function ultimoDiaDoMes(refYMD: string): string {
  const ano = Number(refYMD.slice(0, 4));
  const mes = Number(refYMD.slice(5, 7)); // 1..12
  // Dia 0 do mês seguinte = último dia deste.
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

/** Soma `n` dias a um dia YYYY-MM-DD. Aritmética em UTC-meio-dia, imune a DST. */
export function addDias(dia: string, n: number): string {
  const [ano, mes, diaMes] = dia.split("-").map(Number);
  const instante = new Date(Date.UTC(ano, mes - 1, diaMes, 12) + n * 86_400_000);
  return instante.toISOString().slice(0, 10);
}

/**
 * Soma `n` meses a um dia YYYY-MM-DD, grampeando ao último dia do mês curto.
 *
 * Um carnê combinado para o dia 31 não existe em fevereiro, e "31/02" viraria
 * 03/03 na aritmética do `Date` — a parcela de fevereiro venceria em março,
 * calada. Mesmo grampo de `vencimentoDaCompetencia` no servidor.
 *
 * O grampo NÃO é pegajoso, e isso é de propósito: cada parcela é contada a
 * partir da âncora original, então 31/01 → 28/02 → **31/03**. Se cada uma
 * partisse da anterior, o carnê inteiro desceria para o dia 28 depois de um
 * único fevereiro.
 */
export function addMeses(dia: string, n: number): string {
  const [ano, mes, diaMes] = dia.split("-").map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + n, 1));
  const ultimoDiaDoAlvo = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${alvo.getUTCFullYear()}-${pad(alvo.getUTCMonth() + 1)}-${pad(Math.min(diaMes, ultimoDiaDoAlvo))}`;
}

/**
 * O INSTANTE de uma data de negócio: meio-dia de São Paulo.
 *
 * A âncora ao meio-dia é a que faz `diaDeNegocio` devolver o mesmo dia em
 * qualquer fuso de leitura. Mesma convenção de `diaParaISO` no frontend e de
 * `vencimentoDaCompetencia` no servidor — que agora é esta função.
 */
export function ancoraDeNegocio(dia: string): Date {
  return new Date(`${dia}T12:00:00-03:00`);
}

/** Dias inteiros entre dois dias YYYY-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  const dia = (s: string) => {
    const [ano, mes, d] = s.split("-").map(Number);
    return Date.UTC(ano, mes - 1, d);
  };
  return Math.round((dia(b) - dia(a)) / 86_400_000);
}

/** Lista de competências terminando em `ate`, da mais antiga à mais recente. */
export function ultimasCompetencias(ate: string, meses: number): string[] {
  const ano = Number(ate.slice(0, 4));
  const mes = Number(ate.slice(5, 7)); // 1..12
  const out: string[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// ── Intervalo de visualização (?ini=&fim=) ──

export type Intervalo = {
  /** Dia inicial, inclusivo. */
  iniYMD: string;
  /** Dia final, INCLUSIVO. */
  fimYMD: string;
};

const diaValido = (s: string | undefined | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime());

/**
 * Resolve o intervalo a partir dos params crus. Ausentes/inválidos caem no
 * 1º/último dia do mês de hoje; `ini > fim` troca para um intervalo coerente.
 */
export function resolverIntervalo(
  iniRaw: string | undefined | null,
  fimRaw: string | undefined | null,
  hoje: string = hojeLocal(),
): Intervalo {
  let ini = diaValido(iniRaw) ? iniRaw : primeiroDiaDoMes(hoje);
  let fim = diaValido(fimRaw) ? fimRaw : ultimoDiaDoMes(hoje);
  // Comparação lexicográfica vale para YYYY-MM-DD.
  if (ini > fim) [ini, fim] = [fim, ini];
  return { iniYMD: ini, fimYMD: fim };
}

/** O intervalo de uma competência "YYYY-MM", com fim inclusivo. */
export function intervaloDaCompetencia(competencia: string): Intervalo {
  const primeiro = `${competencia}-01`;
  return { iniYMD: primeiro, fimYMD: ultimoDiaDoMes(primeiro) };
}

/** True se o dia local de um INSTANTE cai dentro do intervalo (pontas inclusivas). */
export function instanteNoIntervalo(instante: Date | string, { iniYMD, fimYMD }: Intervalo): boolean {
  const dia = diaLocal(instante);
  return dia >= iniYMD && dia <= fimYMD;
}

/** True se uma DATA DE NEGÓCIO cai dentro do intervalo (pontas inclusivas). */
export function negocioNoIntervalo(data: Date | string, { iniYMD, fimYMD }: Intervalo): boolean {
  const dia = diaDeNegocio(data);
  return dia >= iniYMD && dia <= fimYMD;
}
