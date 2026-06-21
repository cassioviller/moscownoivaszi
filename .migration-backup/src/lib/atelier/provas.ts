// src/lib/atelier/provas.ts
// Leituras de PROVA. Prova é um Atendimento{tipo:PROVA} preso a uma reserva
// (bloqueioId). Agendamento e ciclo vivem em @/lib/atendimentos/atendimentos.
// Aqui só leitura, para a tela de Reservas e a página /provas.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC } from "@/lib/tempo";
import { paginar } from "@/lib/paginacao";
import type { AtendimentoSituacao, AjusteStatus } from "@/generated/prisma/client";

export type AjusteDaProva = {
  id: string;
  descricao: string;
  status: AjusteStatus;
  checklist: { id: string; descricao: string; feito: boolean; ordem: number }[];
};

export type ProvaDaReserva = {
  id: string;
  inicio: Date;
  situacao: AtendimentoSituacao;
  observacao: string | null;
  cabineNome: string | null;
  vendedoraNome: string | null;
  ajustes: AjusteDaProva[];
};

/** Provas de uma reserva (mais antiga → recente), com ajustes e checklist. */
export async function listarProvasDaReserva(lojaId: string, bloqueioId: string): Promise<ProvaDaReserva[]> {
  const rows = await tenantPrisma(prisma, lojaId).atendimento.findMany({
    where: { tipo: "PROVA", bloqueioId },
    orderBy: { inicio: "asc" },
    include: {
      cabine: { select: { nome: true } },
      vendedora: { select: { nome: true } },
      ajustes: { orderBy: { createdAt: "asc" }, include: { checklist: { orderBy: { ordem: "asc" } } } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    inicio: p.inicio,
    situacao: p.situacao,
    observacao: p.observacao,
    cabineNome: p.cabine?.nome ?? null,
    vendedoraNome: p.vendedora?.nome ?? null,
    ajustes: p.ajustes.map((a) => ({
      id: a.id,
      descricao: a.descricao,
      status: a.status,
      checklist: a.checklist.map((c) => ({ id: c.id, descricao: c.descricao, feito: c.feito, ordem: c.ordem })),
    })),
  }));
}

export type ProvaDaLoja = {
  id: string;
  inicio: Date;
  situacao: AtendimentoSituacao;
  bloqueioId: string | null;
  leadId: string;
  noivaNome: string | null;
  vestidoCodigo: string | null;
  vestidoNome: string | null;
  casamentoData: Date | null;
};

/** Agenda de provas da loja. Padrão: futuras (inicio ≥ hoje, asc); `passadas` = histórico
 *  (desc); `intervalo` (gte/lt) tem precedência e filtra inicio na janela, asc. */
export async function listarProvasDaLoja(
  lojaId: string,
  opts: { passadas?: boolean; pagina?: number | string; tamanho?: number; intervalo?: { gte: Date; lt: Date } } = {},
): Promise<{ itens: ProvaDaLoja[]; total: number }> {
  const inicioFiltro = opts.intervalo
    ? { gte: opts.intervalo.gte, lt: opts.intervalo.lt }
    : opts.passadas
      ? { lt: hojeUTC() }
      : { gte: hojeUTC() };
  const where = { tipo: "PROVA" as const, inicio: inicioFiltro };
  const ascendente = opts.intervalo ? true : !opts.passadas;
  const { skip, take } = paginar(opts.pagina, opts.tamanho);
  const db = tenantPrisma(prisma, lojaId);
  const [rows, total] = await Promise.all([
    db.atendimento.findMany({
      where,
      orderBy: { inicio: ascendente ? "asc" : "desc" },
      skip,
      take,
      include: {
        lead: { select: { noivaNome: true } },
        bloqueio: { include: { vestido: { select: { codigo: true, nome: true } } } },
      },
    }),
    db.atendimento.count({ where }),
  ]);
  const itens = rows.map((p) => ({
    id: p.id,
    inicio: p.inicio,
    situacao: p.situacao,
    bloqueioId: p.bloqueioId,
    leadId: p.leadId,
    noivaNome: p.lead?.noivaNome ?? null,
    vestidoCodigo: p.bloqueio?.vestido.codigo ?? null,
    vestidoNome: p.bloqueio?.vestido.nome ?? null,
    casamentoData: p.bloqueio?.casamentoData ?? null,
  }));
  return { itens, total };
}
