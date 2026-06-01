// src/lib/disponibilidade/reservas.ts
// Ponte entre o Prisma e o Motor de Disponibilidade (puro). ÚNICO ponto que liga
// BloqueioVestido/RegraDisponibilidade ao motor — tudo escopado por loja via
// tenantPrisma (vazamento cross-loja impossível). Datas viajam como DateTime no
// banco (meia-noite UTC) e como "YYYY-MM-DD" no motor; a conversão mora aqui.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import type { BloqueioVestido } from "@/generated/prisma/client";
import type { Bloqueio, Conflito, ErroBloqueio, Regras } from "./tipos";
import { vestidoDisponivel } from "./motor";

// Defaults espelham os @default do model RegraDisponibilidade — usados quando a
// loja ainda não personalizou suas regras (linha ausente).
const REGRAS_PADRAO: Regras = {
  provaDiasAntes: 14,
  provaDuracao: 2,
  usoDiasAntes: 3,
  usoDiasDepois: 2,
  lavagemDiasDepois: 7,
};

// DateTime (meia-noite UTC) → "YYYY-MM-DD". null permanece null.
function ymd(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

// "YYYY-MM-DD" → DateTime em meia-noite UTC (mesma convenção do resto do sistema).
function meiaNoiteUTC(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

// BloqueioVestido (Prisma) → Bloqueio (motor). Tipo do enum vira a união minúscula.
// Exportado: a Agenda reusa a mesma conversão (datas.ts ↔ motor num só lugar).
export function toBloqueio(b: BloqueioVestido): Bloqueio {
  return {
    id: b.id,
    vestidoId: b.vestidoId,
    tipo: b.tipo === "RESERVA_CASAMENTO" ? "reserva_casamento" : "manutencao",
    casamentoData: ymd(b.casamentoData),
    provaDataReal: ymd(b.provaDataReal),
    retiradaDataReal: ymd(b.retiradaDataReal),
    devolucaoDataReal: ymd(b.devolucaoDataReal),
  };
}

/** Regras de disponibilidade da loja (ou os defaults, se ainda não personalizadas). */
export async function obterRegras(lojaId: string): Promise<Regras> {
  const r = await tenantPrisma(prisma, lojaId).regraDisponibilidade.findUnique({
    where: { lojaId },
  });
  if (!r) return REGRAS_PADRAO;
  return {
    provaDiasAntes: r.provaDiasAntes,
    provaDuracao: r.provaDuracao,
    usoDiasAntes: r.usoDiasAntes,
    usoDiasDepois: r.usoDiasDepois,
    lavagemDiasDepois: r.lavagemDiasDepois,
  };
}

export type ResultadoReserva =
  | { ok: true; bloqueioId: string }
  | {
      ok: false;
      motivo: "sem_data" | "lead_invalido" | "vestido_invalido" | "indisponivel";
      conflitos?: Conflito[];
      erros?: ErroBloqueio[];
      // Datas ("YYYY-MM-DD") dos casamentos que já ocupam a peça — para a UI dizer
      // "já reservada para 12/09" em vez de um erro genérico.
      conflitaComDatas?: string[];
    };

/**
 * Reserva um vestido para o casamento de uma noiva. Consulta o motor ANTES de
 * gravar: se a data conflita com prova/uso/lavagem de outra reserva da mesma peça,
 * recusa (falha fechada). Valida que vestido e noiva são da loja.
 */
export async function reservarVestido(
  lojaId: string,
  input: { vestidoId: string; leadId: string; casamentoData: string },
): Promise<ResultadoReserva> {
  const db = tenantPrisma(prisma, lojaId);
  const { vestidoId, leadId, casamentoData } = input;

  if (!casamentoData) return { ok: false, motivo: "sem_data" };

  const [vestido, lead] = await Promise.all([
    db.vestido.findUnique({ where: { id: vestidoId } }),
    db.lead.findUnique({ where: { id: leadId } }),
  ]);
  if (!vestido) return { ok: false, motivo: "vestido_invalido" };
  if (!lead) return { ok: false, motivo: "lead_invalido" };

  const [regras, existentes] = await Promise.all([
    obterRegras(lojaId),
    db.bloqueioVestido.findMany({ where: { vestidoId } }),
  ]);

  const veredito = vestidoDisponivel({
    vestidoId,
    casamentoDataCandidata: casamentoData,
    regras,
    bloqueiosExistentes: existentes.map(toBloqueio),
  });
  if (!veredito.disponivel) {
    // Datas dos casamentos conflitantes (a partir dos bloqueios que colidiram).
    const idsConflitantes = new Set(veredito.conflitos.map((c) => c.bloqueioId));
    const conflitaComDatas = [
      ...new Set(
        existentes
          .filter((b) => idsConflitantes.has(b.id) && b.casamentoData)
          .map((b) => ymd(b.casamentoData)!)
          .sort(),
      ),
    ];
    return {
      ok: false,
      motivo: "indisponivel",
      conflitos: veredito.conflitos,
      erros: veredito.errosBloqueio,
      conflitaComDatas,
    };
  }

  const criado = await db.bloqueioVestido.create({
    // O guard tenantPrisma carimba lojaId em runtime; o tipo do create exige lojaId,
    // por isso o cast (mesma convenção de criarVestido/criarLead).
    data: {
      vestidoId,
      leadId,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: meiaNoiteUTC(casamentoData),
    } as never,
  });
  return { ok: true, bloqueioId: criado.id };
}

/** Cancela (remove) uma reserva OU manutenção. Escopo de loja via tenantPrisma. */
export async function cancelarReserva(lojaId: string, bloqueioId: string): Promise<void> {
  // delete por id é carimbado com lojaId (extendedWhereUnique) → P2025 se for de
  // outra loja. deleteMany evita o throw e simplesmente não apaga o que não é da loja.
  await tenantPrisma(prisma, lojaId).bloqueioVestido.deleteMany({ where: { id: bloqueioId } });
}

export type ResultadoManutencao =
  | { ok: true; id: string }
  | { ok: false; motivo: "sem_data" | "datas_invertidas" | "vestido_invalido" };

/**
 * Envia um vestido para manutenção (fora do acervo por um período). Início = data
 * de retirada; fim opcional (em aberto = fora por tempo indeterminado, igual ao
 * comportamento do motor). Bloqueia reservas no período automaticamente, porque o
 * motor já considera bloqueios de manutenção nas projeções.
 */
export async function criarManutencao(
  lojaId: string,
  input: { vestidoId: string; inicio: string; fim?: string | null; motivo?: string | null },
): Promise<ResultadoManutencao> {
  const { vestidoId, inicio, fim, motivo } = input;
  if (!inicio) return { ok: false, motivo: "sem_data" };
  if (fim && fim < inicio) return { ok: false, motivo: "datas_invertidas" };

  const db = tenantPrisma(prisma, lojaId);
  const vestido = await db.vestido.findUnique({ where: { id: vestidoId } });
  if (!vestido) return { ok: false, motivo: "vestido_invalido" };

  const obs = motivo?.trim();
  const criado = await db.bloqueioVestido.create({
    // tenantPrisma carimba lojaId; cast pela mesma razão de criarVestido/reservar.
    data: {
      vestidoId,
      tipo: "MANUTENCAO",
      retiradaDataReal: meiaNoiteUTC(inicio),
      devolucaoDataReal: fim ? meiaNoiteUTC(fim) : null,
      observacao: obs ? obs : null, // motivo do cuidado (bainha, mancha, ajuste…)
    } as never,
  });
  return { ok: true, id: criado.id };
}

export type ManutencaoVestido = {
  id: string;
  inicio: Date | null;
  fim: Date | null;
  motivo: string | null;
};

/** Manutenções de um vestido, da mais próxima à mais distante. */
export async function listarManutencoesDoVestido(
  lojaId: string,
  vestidoId: string,
): Promise<ManutencaoVestido[]> {
  const rows = await tenantPrisma(prisma, lojaId).bloqueioVestido.findMany({
    where: { vestidoId, tipo: "MANUTENCAO" },
    orderBy: { retiradaDataReal: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    inicio: r.retiradaDataReal,
    fim: r.devolucaoDataReal,
    motivo: r.observacao,
  }));
}

export type ReservaDoVestido = {
  id: string;
  casamentoData: Date | null;
  noivaNome: string | null;
  leadId: string | null;
};

/** Reservas (casamento) de um vestido, da mais próxima à mais distante, com a noiva. */
export async function listarReservasDoVestido(
  lojaId: string,
  vestidoId: string,
): Promise<ReservaDoVestido[]> {
  const rows = await tenantPrisma(prisma, lojaId).bloqueioVestido.findMany({
    where: { vestidoId, tipo: "RESERVA_CASAMENTO" },
    orderBy: { casamentoData: "asc" },
    include: { lead: { select: { noivaNome: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    casamentoData: r.casamentoData,
    noivaNome: r.lead?.noivaNome ?? null,
    leadId: r.leadId,
  }));
}

export type ReservaDaLoja = {
  id: string;
  casamentoData: Date | null;
  noivaNome: string | null;
  leadId: string | null;
  vestidoId: string;
  codigo: string;
  nome: string;
};

// Hoje como meia-noite UTC do dia-calendário em São Paulo (convenção do sistema).
function hojeUTC(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

/**
 * Livro de reservas da loja: todas as reservas de casamento ainda por vir
 * (casamento ≥ hoje), da mais próxima à mais distante, com noiva e vestido.
 */
export async function listarReservasDaLoja(lojaId: string): Promise<ReservaDaLoja[]> {
  const rows = await tenantPrisma(prisma, lojaId).bloqueioVestido.findMany({
    where: { tipo: "RESERVA_CASAMENTO", casamentoData: { gte: hojeUTC() } },
    orderBy: { casamentoData: "asc" },
    include: {
      lead: { select: { noivaNome: true } },
      vestido: { select: { id: true, codigo: true, nome: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    casamentoData: r.casamentoData,
    noivaNome: r.lead?.noivaNome ?? null,
    leadId: r.leadId,
    vestidoId: r.vestidoId,
    codigo: r.vestido.codigo,
    nome: r.vestido.nome,
  }));
}

export type ReservaDaNoiva = {
  id: string;
  casamentoData: Date | null;
  vestidoId: string;
  codigo: string;
  nome: string;
};

/** Reservas (casamento) de uma noiva, com o vestido reservado. */
export async function listarReservasDaNoiva(
  lojaId: string,
  leadId: string,
): Promise<ReservaDaNoiva[]> {
  const rows = await tenantPrisma(prisma, lojaId).bloqueioVestido.findMany({
    where: { leadId, tipo: "RESERVA_CASAMENTO" },
    orderBy: { casamentoData: "asc" },
    include: { vestido: { select: { id: true, codigo: true, nome: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    casamentoData: r.casamentoData,
    vestidoId: r.vestidoId,
    codigo: r.vestido.codigo,
    nome: r.vestido.nome,
  }));
}

export type VestidoLivre = { id: string; codigo: string; nome: string; precoBase: string };

/**
 * Vestidos ativos do acervo que estão LIVRES para uma data de casamento — cada um
 * avaliado pelo motor contra seus próprios bloqueios. Acervo é pequeno, então a
 * checagem em memória é barata.
 */
export async function vestidosLivresPara(
  lojaId: string,
  casamentoData: string,
): Promise<VestidoLivre[]> {
  const db = tenantPrisma(prisma, lojaId);
  const [regras, vestidos, bloqueios] = await Promise.all([
    obterRegras(lojaId),
    db.vestido.findMany({ where: { status: "ativo" }, orderBy: { nome: "asc" } }),
    db.bloqueioVestido.findMany({}),
  ]);

  const porVestido = new Map<string, Bloqueio[]>();
  for (const b of bloqueios) {
    const lista = porVestido.get(b.vestidoId) ?? [];
    lista.push(toBloqueio(b));
    porVestido.set(b.vestidoId, lista);
  }

  return vestidos
    .filter(
      (v) =>
        vestidoDisponivel({
          vestidoId: v.id,
          casamentoDataCandidata: casamentoData,
          regras,
          bloqueiosExistentes: porVestido.get(v.id) ?? [],
        }).disponivel,
    )
    .map((v) => ({ id: v.id, codigo: v.codigo, nome: v.nome, precoBase: v.precoBase.toString() }));
}

/**
 * Versão alvo: dentre `vestidoIds`, quais estão livres para a data. Consulta só os
 * bloqueios desses vestidos (não varre o acervo inteiro) — barato para checar um
 * punhado de sugestões a cada carregamento. Retorna o subconjunto livre.
 */
export async function vestidosLivresEntre(
  lojaId: string,
  casamentoData: string,
  vestidoIds: string[],
): Promise<string[]> {
  if (vestidoIds.length === 0) return [];
  const db = tenantPrisma(prisma, lojaId);
  const [regras, bloqueios] = await Promise.all([
    obterRegras(lojaId),
    db.bloqueioVestido.findMany({ where: { vestidoId: { in: vestidoIds } } }),
  ]);

  const porVestido = new Map<string, Bloqueio[]>();
  for (const b of bloqueios) {
    const lista = porVestido.get(b.vestidoId) ?? [];
    lista.push(toBloqueio(b));
    porVestido.set(b.vestidoId, lista);
  }

  return vestidoIds.filter(
    (id) =>
      vestidoDisponivel({
        vestidoId: id,
        casamentoDataCandidata: casamentoData,
        regras,
        bloqueiosExistentes: porVestido.get(id) ?? [],
      }).disponivel,
  );
}
