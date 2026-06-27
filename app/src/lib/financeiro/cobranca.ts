// src/lib/financeiro/cobranca.ts
// Cobrança/inadimplência: aging por faixa de atraso + histórico de cobranças por noiva.
// faixaDeAtraso e linkWhatsApp são PUROS (testáveis). As demais funções leem/escrevem.

import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC } from "@/lib/tempo";
import { deCentavos, decParaCentavos } from "@/lib/dinheiro";
import type { CobrancaCanal } from "@/generated/prisma/client";

const DIA_MS = 86_400_000;

export type Faixa = "ate30" | "d31a60" | "mais60";

/** Classifica dias de atraso (≥1) em faixa. Vencendo hoje (0) não é atraso e não chega aqui. */
export function faixaDeAtraso(diasDeAtraso: number): Faixa {
  if (diasDeAtraso <= 30) return "ate30";
  if (diasDeAtraso <= 60) return "d31a60";
  return "mais60";
}

/** Deep-link wa.me com a mensagem encodada. Prefixa o DDI 55 só se o número for nacional
 *  (10–11 dígitos); mantém se já vier com DDI (12–13 começando em 55). null se ausente/implausível. */
export function linkWhatsApp(whatsapp: string | null, mensagem: string): string | null {
  if (!whatsapp) return null;
  let digitos = whatsapp.replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) {
    digitos = `55${digitos}`; // nacional (DDD + 8/9 dígitos) → acrescenta DDI Brasil
  } else if (!(digitos.length >= 12 && digitos.length <= 13 && digitos.startsWith("55"))) {
    return null; // vazio, curto ou formato implausível
  }
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`;
}

export type NoivaInadimplente = {
  leadId: string;
  noivaNome: string | null;
  whatsapp: string | null;
  totalVencido: string;
  qtdParcelas: number;
  diasMaisAntigo: number;
  faixaMaisAntiga: Faixa;
};
export type FaixaResumo = { total: string; qtdNoivas: number };
export type Aging = {
  faixas: { ate30: FaixaResumo; d31a60: FaixaResumo; mais60: FaixaResumo };
  noivas: NoivaInadimplente[];
};

/** Inadimplência da loja: parcelas PREVISTA vencidas, por faixa de atraso e por noiva. */
export async function agingDaLoja(lojaId: string): Promise<Aging> {
  const hoje = hojeUTC();
  const rows = await tenantPrisma(prisma, lojaId).parcela.findMany({
    where: { status: "PREVISTA", vencimento: { lt: hoje } },
    include: { contrato: { select: { leadId: true, lead: { select: { noivaNome: true, whatsapp: true } } } } },
  });

  const faixaTotC: Record<Faixa, number> = { ate30: 0, d31a60: 0, mais60: 0 };
  const faixaNoivas: Record<Faixa, Set<string>> = { ate30: new Set(), d31a60: new Set(), mais60: new Set() };
  const porNoiva = new Map<string, { noivaNome: string | null; whatsapp: string | null; totalC: number; qtd: number; minVenc: number }>();

  for (const p of rows) {
    const dias = Math.floor((hoje.getTime() - p.vencimento.getTime()) / DIA_MS);
    const f = faixaDeAtraso(dias);
    const valorC = decParaCentavos(p.valorPrevisto);
    const leadId = p.contrato.leadId;
    faixaTotC[f] += valorC;
    faixaNoivas[f].add(leadId);
    let n = porNoiva.get(leadId);
    if (!n) {
      n = { noivaNome: p.contrato.lead?.noivaNome ?? null, whatsapp: p.contrato.lead?.whatsapp ?? null, totalC: 0, qtd: 0, minVenc: p.vencimento.getTime() };
      porNoiva.set(leadId, n);
    }
    n.totalC += valorC;
    n.qtd += 1;
    if (p.vencimento.getTime() < n.minVenc) n.minVenc = p.vencimento.getTime();
  }

  const noivas: NoivaInadimplente[] = [...porNoiva.entries()]
    .map(([leadId, n]) => {
      const diasMaisAntigo = Math.floor((hoje.getTime() - n.minVenc) / DIA_MS);
      return {
        leadId,
        noivaNome: n.noivaNome,
        whatsapp: n.whatsapp,
        totalVencido: deCentavos(n.totalC),
        qtdParcelas: n.qtd,
        diasMaisAntigo,
        faixaMaisAntiga: faixaDeAtraso(diasMaisAntigo),
      };
    })
    .sort((a, b) => b.diasMaisAntigo - a.diasMaisAntigo);

  const fr = (f: Faixa): FaixaResumo => ({ total: deCentavos(faixaTotC[f]), qtdNoivas: faixaNoivas[f].size });
  return { faixas: { ate30: fr("ate30"), d31a60: fr("d31a60"), mais60: fr("mais60") }, noivas };
}

export type CobrancaView = { id: string; data: Date; canal: CobrancaCanal; observacao: string | null };

/** Histórico de cobranças de uma noiva, recente primeiro. */
export async function historicoCobranca(lojaId: string, leadId: string): Promise<CobrancaView[]> {
  const rows = await tenantPrisma(prisma, lojaId).registroCobranca.findMany({
    where: { leadId },
    orderBy: [{ data: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((r) => ({ id: r.id, data: r.data, canal: r.canal, observacao: r.observacao }));
}

const CANAIS: CobrancaCanal[] = ["WHATSAPP", "TELEFONE", "PRESENCIAL", "OUTRO"];
export type ResultadoCobranca = { ok: true } | { ok: false; motivo: "lead_invalido" | "canal_invalido" };

/** Registra uma cobrança feita a uma noiva (data = hoje). */
export async function registrarCobranca(
  lojaId: string,
  input: { leadId: string; canal: string; observacao?: string },
): Promise<ResultadoCobranca> {
  const db = tenantPrisma(prisma, lojaId);
  const lead = await db.lead.findUnique({ where: { id: input.leadId }, select: { id: true } });
  if (!lead) return { ok: false, motivo: "lead_invalido" };
  if (!CANAIS.includes(input.canal as CobrancaCanal)) return { ok: false, motivo: "canal_invalido" };
  await db.registroCobranca.create({
    data: { leadId: input.leadId, data: hojeUTC(), canal: input.canal as CobrancaCanal, observacao: input.observacao?.trim() || null } as never,
  });
  return { ok: true };
}
