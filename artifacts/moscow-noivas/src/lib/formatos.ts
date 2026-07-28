/** Helpers de formatação/negócio compartilhados pelas páginas. */

// Interno desde o E88: todo consumidor passa por `etapaLabel`.
const ETAPA_LABELS: Record<string, string> = {
  NOVO: "Novo",
  INTERESSES_PREENCHIDOS: "Interesses preenchidos",
  ATENDIMENTO_AGENDADO: "Atendimento agendado",
  EM_ATENDIMENTO: "Em atendimento",
  ORCAMENTO_ABERTO: "Orçamento aberto",
  CONTRATO_FECHADO: "Contrato fechado",
  EM_PROVAS: "Em provas",
  RETIRADO: "Retirado",
  CASAMENTO_REALIZADO: "Casamento realizado",
  DEVOLVIDO: "Devolvido",
  PERDIDO: "Perdido",
};

/**
 * Sobe só a PRIMEIRA letra da frase (E92/E15). O `capitalize` do CSS sobe a
 * inicial de toda palavra — em inglês isso é Title Case, em português é texto
 * de máquina: "Julho De 2026 — O Que Seria Pago Se Fechasse Agora."
 */
export function capitalizar(frase: string): string {
  return frase.charAt(0).toLocaleUpperCase("pt-BR") + frase.slice(1);
}

export function etapaLabel(etapa: string): string {
  return ETAPA_LABELS[etapa] ?? etapa;
}

// Status em linguagem de gente. Fallback devolve o valor cru: um status novo
// no backend aparece feio, mas aparece — nunca some.
const STATUS_ORCAMENTO_LABELS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
};

export function statusOrcamentoLabel(status: string): string {
  return STATUS_ORCAMENTO_LABELS[status] ?? status;
}

const STATUS_CONTRATO_LABELS: Record<string, string> = {
  ATIVO: "Ativo",
  CANCELADO: "Cancelado",
};

export function statusContratoLabel(status: string): string {
  return STATUS_CONTRATO_LABELS[status] ?? status;
}

const TIPO_ATRIBUTO_LABELS: Record<string, string> = {
  ESCALA: "escala",
  OPCAO_UNICA: "opção única",
};

export function tipoAtributoLabel(tipo: string): string {
  return TIPO_ATRIBUTO_LABELS[tipo] ?? tipo;
}

// Por que a noiva não fechou — espelha o enum lead_perdida_motivo do backend.
export const PERDIDA_MOTIVO_LABELS: Record<string, string> = {
  PRECO: "Preço",
  DATA_INDISPONIVEL: "Data indisponível",
  CONCORRENTE: "Fechou com concorrente",
  DESISTENCIA: "Desistiu do aluguel",
  SEM_RETORNO: "Parou de responder",
  OUTRO: "Outro",
};

export function perdidaMotivoLabel(motivo: string): string {
  return PERDIDA_MOTIVO_LABELS[motivo] ?? motivo;
}

// De onde a noiva veio — espelha o enum lead_origem do backend (E19).
export const ROTULO_ORIGEM: Record<string, string> = {
  LOJA: "Loja",
  WHATSAPP: "WhatsApp",
  SITE: "Site",
  INSTAGRAM: "Instagram",
};

export function origemLabel(origem: string): string {
  return ROTULO_ORIGEM[origem] ?? origem;
}

const dataDiaFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

/**
 * Formata uma data de NEGÓCIO (casamento, vencimento) sem deixar o fuso
 * empurrar o dia: `toLocaleDateString("pt-BR")` sem timeZone lê meia-noite UTC
 * no fuso local e mostra a véspera. Date-only ("2026-11-20") é normalizado ao
 * meio-dia UTC antes de formatar.
 */
export function dataDia(iso: string): string {
  const soDia = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return dataDiaFmt.format(new Date(soDia ? `${iso}T12:00:00Z` : iso));
}

/**
 * O ÚNICO jeito de escrever dinheiro na tela. Devolve o valor JÁ com o `R$`.
 *
 * E92/E5+E7: antes ela devolvia só o número e cada tela escrevia `R$ {brl(x)}`
 * à mão — 98 vezes. Duas consequências: (a) o espaço entre `R$` e o número era
 * um espaço COMUM, e em 390px o navegador quebrava linha ali, partindo o card
 * "A receber" em `R$` em cima e `13.500,00` embaixo; (b) o dashboard, a tela
 * mais lida do sistema, era a única que esquecia o prefixo, e mostrava
 * `700,00` ao lado de `143` noivas sem dizer qual dos dois é dinheiro.
 *
 * `style: "currency"` resolve os dois de uma vez: o separador que o ICU põe em
 * pt-BR é U+00A0 (espaço rígido, onde o navegador não quebra), e o símbolo
 * passa a sair de uma régua só. De quebra, negativo vira `-R$ 500,00` em vez
 * de `R$ -500,00`. Mesma escolha que `lib/whatsapp.ts` já fazia.
 *
 * maximumFractionDigits continua explícito: sem ele, um valor com mais de 2
 * casas (rateio de parcela, base de desconto) renderizava "R$ 1.234,567".
 */
const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function brl(valor: number): string {
  return brlFmt.format(valor);
}

/**
 * Converte "YYYY-MM-DD" (input type=date) para ISO ancorado ao meio-dia de
 * São Paulo — evita que a data escorregue de dia ao ser coagida em UTC.
 */
export function diaParaISO(dia: string): string {
  return new Date(`${dia}T12:00:00-03:00`).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// D15/E99 — as datas na tela saem de uma régua só, e o fuso é sempre explícito.
//
// Havia **36** `new Intl.DateTimeFormat` escritos à mão nas telas, e **17 deles
// eram cópias** de oito formas idênticas — a mesma "dd/MM/aaaa HH:mm" repetida
// em quatro arquivos. Sete omitiam `timeZone`, e três desses formatam um
// INSTANTE: a hora do atendimento era desenhada no relógio de QUEM ABRE, não no
// da loja. É o irmão de código do E1 (E92), onde o Chromium em inglês desenhava
// a data invertida — só que este não depende do idioma do navegador, e sim de
// onde ele está.
//
// A distinção que os nomes daqui existem para tornar impossível de errar:
//
//   • **INSTANTE** — um momento no tempo (`inicio`, `criadoEm`, `recebidoEm`).
//     Vale o relógio da LOJA: `America/Sao_Paulo`. Um atendimento das 14h é às
//     14h em Recife, em Lisboa e no servidor.
//   • **DIA DE NEGÓCIO** — uma data sem hora (vencimento, casamento,
//     competência). Vale `UTC` com âncora ao meio-dia, senão o fuso empurra o
//     dia para a véspera — o defeito que a `dataDia` acima já documentava.
// ─────────────────────────────────────────────────────────────────────────────

const FUSO_LOJA = "America/Sao_Paulo";

/** Normaliza "YYYY-MM-DD" ao meio-dia UTC; instante ISO passa direto. */
function comoData(valor: Date | string): Date {
  if (valor instanceof Date) return valor;
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T12:00:00Z` : valor);
}

// ── Instantes: o relógio da loja ──

const instanteCurtoFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_LOJA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
/** "28/07/2026 14:30" — trilha de auditoria, atividade da equipe, backups. */
export function instanteCurto(valor: Date | string): string {
  return instanteCurtoFmt.format(comoData(valor));
}

const instanteHoraFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_LOJA,
  hour: "2-digit",
  minute: "2-digit",
});
/** "14:30" — a hora do atendimento, no relógio da loja. */
export function instanteHora(valor: Date | string): string {
  return instanteHoraFmt.format(comoData(valor));
}

const instanteDiaMesFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_LOJA,
  day: "2-digit",
  month: "2-digit",
});
/** "28/07" — sino, conciliação, cards curtos. */
export function instanteDiaMes(valor: Date | string): string {
  return instanteDiaMesFmt.format(comoData(valor));
}

const instanteLongoFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_LOJA,
  dateStyle: "long",
});
/** "28 de julho de 2026" — as telas públicas (portal, orçamento). */
export function instanteLongo(valor: Date | string): string {
  return instanteLongoFmt.format(comoData(valor));
}

// ── Dias de negócio: UTC, ancorado ao meio-dia ──

const diaMesAnoFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
/** "28/07/2026" — vencimento, competência fechada. */
export function diaMesAno(valor: Date | string): string {
  return diaMesAnoFmt.format(comoData(valor));
}

const diaMesAbrevAnoFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
/** "28 de jul. de 2026" — fluxo de caixa, listas de noivas. */
export function diaMesAbrevAno(valor: Date | string): string {
  return diaMesAbrevAnoFmt.format(comoData(valor));
}

const mesAnoLongoFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
/** "julho de 2026" — competências. Minúsculo, como o E92 fixou. */
export function mesAnoLongo(valor: Date | string): string {
  return mesAnoLongoFmt.format(comoData(valor));
}
