import type { Parcela } from "@workspace/api-client-react";
import { centavos, reais } from "./dinheiro";
import { diaDeNegocio, diasEntre, hojeLocal } from "./datas";

/**
 * Cobrança/inadimplência: aging por faixa de atraso, agrupado por noiva.
 * `vencimento` é data de negócio; o atraso conta em dias-calendário contra
 * hoje no fuso da loja (não em horas — uma parcela não vence "às 14h").
 */

export type Faixa = "ate30" | "d31a60" | "mais60";

export const ROTULO_FAIXA: Record<Faixa, string> = {
  ate30: "Até 30 dias",
  d31a60: "31 a 60 dias",
  mais60: "Mais de 60 dias",
};

/** Classifica dias de atraso (≥1) em faixa. Vencendo hoje (0) não é atraso. */
export function faixaDeAtraso(diasDeAtraso: number): Faixa {
  if (diasDeAtraso <= 30) return "ate30";
  if (diasDeAtraso <= 60) return "d31a60";
  return "mais60";
}

// O deep-link wa.me virou módulo neutro quando a agenda passou a usá-lo (E8);
// re-export mantém os consumidores do financeiro sem mexer.
export { linkWhatsApp } from "../whatsapp";

// ── Registro de contato (o histórico por noiva) ──

export const CANAIS = ["WHATSAPP", "TELEFONE", "PRESENCIAL", "OUTRO"] as const;
export type Canal = (typeof CANAIS)[number];

export const ROTULO_CANAL: Record<Canal, string> = {
  WHATSAPP: "WhatsApp",
  TELEFONE: "Telefone",
  PRESENCIAL: "Presencial",
  OUTRO: "Outro",
};

const formatadorContato = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * `data` do registro é um INSTANTE — o momento em que se falou com a noiva.
 * A hora importa aqui ("liguei hoje de manhã"), então mostramos dia E hora no
 * fuso da loja; lido em UTC, um contato das 21h apareceria no dia seguinte.
 */
export function rotuloContato(instante: Date | string): string {
  return formatadorContato.format(new Date(instante)).replace(", ", " às ");
}

export type NoivaInadimplente = {
  leadId: string;
  noivaNome: string | null;
  whatsapp: string | null;
  contratoId: string;
  totalVencido: number;
  qtdParcelas: number;
  diasMaisAntigo: number;
  faixaMaisAntiga: Faixa;
};
export type FaixaResumo = { total: number; qtdNoivas: number };
export type Aging = {
  faixas: Record<Faixa, FaixaResumo>;
  /** Mais atrasada primeiro — a fila de quem ligar antes. */
  noivas: NoivaInadimplente[];
};

/** Dados que a parcela precisa carregar para virar linha de cobrança. */
export type ParcelaComNoiva = Parcela & {
  contrato?: {
    leadId?: string;
    lead?: { noivaNome?: string; whatsapp?: string | null } | null;
  } | null;
};

/** Parcelas PREVISTAS já vencidas, por faixa de atraso e por noiva. */
export function agingDeParcelas(
  parcelas: readonly ParcelaComNoiva[],
  hoje: string = hojeLocal(),
): Aging {
  const faixaTotC: Record<Faixa, number> = { ate30: 0, d31a60: 0, mais60: 0 };
  const faixaNoivas: Record<Faixa, Set<string>> = { ate30: new Set(), d31a60: new Set(), mais60: new Set() };
  const porNoiva = new Map<
    string,
    { noivaNome: string | null; whatsapp: string | null; contratoId: string; totalC: number; qtd: number; vencMaisAntigo: string }
  >();

  for (const p of parcelas) {
    if (p.status !== "PREVISTA") continue;
    const venc = diaDeNegocio(p.vencimento);
    const dias = diasEntre(venc, hoje);
    if (dias < 1) continue; // vence hoje ou no futuro: não é atraso

    const leadId = p.contrato?.leadId;
    if (!leadId) continue; // sem noiva não há quem cobrar
    const f = faixaDeAtraso(dias);
    const valorC = centavos(p.valorPrevisto);
    faixaTotC[f] += valorC;
    faixaNoivas[f].add(leadId);

    let n = porNoiva.get(leadId);
    if (!n) {
      n = {
        noivaNome: p.contrato?.lead?.noivaNome ?? null,
        whatsapp: p.contrato?.lead?.whatsapp ?? null,
        contratoId: p.contratoId,
        totalC: 0,
        qtd: 0,
        vencMaisAntigo: venc,
      };
      porNoiva.set(leadId, n);
    }
    n.totalC += valorC;
    n.qtd += 1;
    if (venc < n.vencMaisAntigo) n.vencMaisAntigo = venc;
  }

  const noivas: NoivaInadimplente[] = [...porNoiva.entries()]
    .map(([leadId, n]) => {
      const diasMaisAntigo = diasEntre(n.vencMaisAntigo, hoje);
      return {
        leadId,
        noivaNome: n.noivaNome,
        whatsapp: n.whatsapp,
        contratoId: n.contratoId,
        totalVencido: reais(n.totalC),
        qtdParcelas: n.qtd,
        diasMaisAntigo,
        faixaMaisAntiga: faixaDeAtraso(diasMaisAntigo),
      };
    })
    .sort((a, b) => b.diasMaisAntigo - a.diasMaisAntigo);

  const resumo = (f: Faixa): FaixaResumo => ({ total: reais(faixaTotC[f]), qtdNoivas: faixaNoivas[f].size });
  return {
    faixas: { ate30: resumo("ate30"), d31a60: resumo("d31a60"), mais60: resumo("mais60") },
    noivas,
  };
}
