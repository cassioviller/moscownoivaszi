// src/lib/atendimentos/atendimentos.ts
// Agendamento de atendimentos: grade do dia, criar (com validações + sem
// sobreposição de cabine/vendedora), listar próximos e cancelar. tenantPrisma.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { gradeDeSlots, type Slot } from "./slots";
import { obterHorarioLoja } from "./cabines";
import { meiaNoiteUTC, hojeUTC } from "@/lib/tempo";
import type { AtendimentoSituacao, AtendimentoDesfecho, AtendimentoTipo } from "@/generated/prisma/client";

function ehErroP2002(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

// "YYYY-MM-DD" + hora → Date (wall-clock em UTC).
function instante(dataYMD: string, hora: number): Date {
  return new Date(`${dataYMD}T${String(hora).padStart(2, "0")}:00:00.000Z`);
}
function fimDoDia(dataYMD: string): Date {
  const d = meiaNoiteUTC(dataYMD);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// Horas ocupadas no dia para a cabine OU a vendedora dadas.
async function horasOcupadas(
  lojaId: string,
  dataYMD: string,
  cabineId: string,
  vendedoraId: string,
): Promise<number[]> {
  const rows = await tenantPrisma(prisma, lojaId).atendimento.findMany({
    where: {
      inicio: { gte: meiaNoiteUTC(dataYMD), lt: fimDoDia(dataYMD) },
      OR: [{ cabineId }, { vendedoraId }],
    },
    select: { inicio: true },
  });
  return rows.map((r) => r.inicio.getUTCHours());
}

export async function gradeDoDia(
  lojaId: string,
  args: { dataYMD: string; cabineId: string; vendedoraId: string },
): Promise<Slot[]> {
  const [{ abertura, fechamento }, ocupadas] = await Promise.all([
    obterHorarioLoja(lojaId),
    horasOcupadas(lojaId, args.dataYMD, args.cabineId, args.vendedoraId),
  ]);
  return gradeDeSlots(abertura, fechamento, ocupadas);
}

export type ResultadoAgendar =
  | { ok: true; atendimentoId: string }
  | { ok: false; motivo: "lead_invalido" | "cabine_invalida" | "vendedora_invalida" | "sem_horario" | "fora_funcionamento" | "indisponivel" | "tipo_invalido" | "reserva_invalida" | "reserva_nao_e_da_noiva" };

const TIPOS_AGENDAMENTO = new Set<AtendimentoTipo>(["ATENDIMENTO", "PROVA"]);

export async function agendarAtendimento(
  lojaId: string,
  input: {
    leadId: string;
    cabineId: string;
    vendedoraId: string;
    dataYMD: string;
    hora: number;
    observacao?: string | null;
    tipo?: AtendimentoTipo;
    bloqueioId?: string | null;
  },
): Promise<ResultadoAgendar> {
  const { leadId, cabineId, vendedoraId, dataYMD, hora, observacao } = input;
  const tipo: AtendimentoTipo = input.tipo ?? "ATENDIMENTO";
  if (!TIPOS_AGENDAMENTO.has(tipo)) return { ok: false, motivo: "tipo_invalido" };
  if (!dataYMD || !Number.isInteger(hora)) return { ok: false, motivo: "sem_horario" };

  const db = tenantPrisma(prisma, lojaId);
  const [lead, cab, vinc, { abertura, fechamento }] = await Promise.all([
    db.lead.findUnique({ where: { id: leadId }, select: { id: true } }),
    db.cabine.findUnique({ where: { id: cabineId }, select: { ativo: true } }),
    // vendedora = membro da loja (UsuarioLoja é exceção do guard → prisma direto por usuarioId+lojaId).
    prisma.usuarioLoja.findUnique({ where: { usuarioId_lojaId: { usuarioId: vendedoraId, lojaId } }, select: { usuarioId: true } }),
    obterHorarioLoja(lojaId),
  ]);
  if (!lead) return { ok: false, motivo: "lead_invalido" };
  if (!cab || !cab.ativo) return { ok: false, motivo: "cabine_invalida" };
  if (!vinc) return { ok: false, motivo: "vendedora_invalida" };
  if (hora < abertura || hora >= fechamento) return { ok: false, motivo: "fora_funcionamento" };

  // Prova exige uma reserva de casamento da própria noiva.
  let bloqueioId: string | null = null;
  if (tipo === "PROVA") {
    if (!input.bloqueioId) return { ok: false, motivo: "reserva_invalida" };
    const reserva = await db.bloqueioVestido.findUnique({
      where: { id: input.bloqueioId },
      select: { tipo: true, leadId: true },
    });
    if (!reserva || reserva.tipo !== "RESERVA_CASAMENTO") return { ok: false, motivo: "reserva_invalida" };
    if (reserva.leadId !== leadId) return { ok: false, motivo: "reserva_nao_e_da_noiva" };
    bloqueioId = input.bloqueioId;
  }

  // Revalida sobreposição (cabine OU vendedora na mesma hora).
  const ocupadas = await horasOcupadas(lojaId, dataYMD, cabineId, vendedoraId);
  if (ocupadas.includes(hora)) return { ok: false, motivo: "indisponivel" };

  const obs = observacao?.trim();
  try {
    const criado = await db.atendimento.create({
      data: { leadId, cabineId, vendedoraId, tipo, bloqueioId, inicio: instante(dataYMD, hora), observacao: obs ? obs : null } as never,
    });
    return { ok: true, atendimentoId: criado.id };
  } catch (e) {
    // Corrida perdeu para a constraint de slot (cabine OU vendedora já ocupada na hora).
    if (ehErroP2002(e)) return { ok: false, motivo: "indisponivel" };
    throw e;
  }
}

export type AtendimentoItem = {
  id: string;
  inicio: Date;
  noivaNome: string | null;
  leadId: string;
  cabineNome: string;
  vendedoraNome: string;
};

export async function listarProximosAtendimentos(lojaId: string): Promise<AtendimentoItem[]> {
  const rows = await tenantPrisma(prisma, lojaId).atendimento.findMany({
    // Só os ABERTOS: um já CONCLUIDO/FALTOU com data futura não é "próximo" (B2).
    where: { inicio: { gte: hojeUTC() }, tipo: "ATENDIMENTO", situacao: { in: ["AGENDADO", "EM_ATENDIMENTO"] } },
    orderBy: { inicio: "asc" },
    include: { lead: { select: { noivaNome: true } }, cabine: { select: { nome: true } }, vendedora: { select: { nome: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    noivaNome: a.lead?.noivaNome ?? null,
    leadId: a.leadId,
    cabineNome: a.cabine.nome,
    vendedoraNome: a.vendedora.nome,
  }));
}

export async function cancelarAtendimento(lojaId: string, id: string): Promise<void> {
  await tenantPrisma(prisma, lojaId).atendimento.deleteMany({ where: { id } });
}

// — O ato de "atender": ciclo de vida do atendimento (S1) —

export type AtendimentoFila = {
  id: string;
  inicio: Date;
  situacao: AtendimentoSituacao;
  desfecho: AtendimentoDesfecho | null;
  atendidoEm: Date | null;
  noivaNome: string | null;
  leadId: string;
  cabineNome: string;
  vendedoraNome: string;
};

/**
 * Atendimentos da loja com situação/desfecho. Padrão: os ABERTOS (AGENDADO ou
 * EM_ATENDIMENTO), por data asc — a fila de trabalho, que NÃO some quando a data passa
 * (um agendado vencido continua acionável). `finalizados` traz o histórico (CONCLUIDO
 * ou FALTOU), por data desc. Particiona por SITUAÇÃO, não por data. Escopo de loja.
 */
export async function listarAtendimentos(
  lojaId: string,
  opts: { finalizados?: boolean } = {},
): Promise<AtendimentoFila[]> {
  const abertos: AtendimentoSituacao[] = ["AGENDADO", "EM_ATENDIMENTO"];
  const fechados: AtendimentoSituacao[] = ["CONCLUIDO", "FALTOU"];
  const rows = await tenantPrisma(prisma, lojaId).atendimento.findMany({
    where: { situacao: { in: opts.finalizados ? fechados : abertos }, tipo: "ATENDIMENTO" },
    orderBy: { inicio: opts.finalizados ? "desc" : "asc" },
    include: {
      lead: { select: { noivaNome: true } },
      cabine: { select: { nome: true } },
      vendedora: { select: { nome: true } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    situacao: a.situacao,
    desfecho: a.desfecho,
    atendidoEm: a.atendidoEm,
    noivaNome: a.lead?.noivaNome ?? null,
    leadId: a.leadId,
    cabineNome: a.cabine.nome,
    vendedoraNome: a.vendedora.nome,
  }));
}

export type ResultadoSituacao =
  | { ok: true }
  | { ok: false; motivo: "atendimento_invalido" | "transicao_invalida" | "desfecho_invalido" | "nao_e_prova" };

const DESFECHOS_VALIDOS = new Set<AtendimentoDesfecho>(["RESERVOU", "VAI_PENSAR", "NAO_SERVIU"]);

/** AGENDADO → EM_ATENDIMENTO (carimba atendidoEm). Só da loja. */
export async function iniciarAtendimento(lojaId: string, id: string): Promise<ResultadoSituacao> {
  const db = tenantPrisma(prisma, lojaId);
  const at = await db.atendimento.findUnique({ where: { id }, select: { situacao: true } });
  if (!at) return { ok: false, motivo: "atendimento_invalido" };
  if (at.situacao !== "AGENDADO") return { ok: false, motivo: "transicao_invalida" };
  await db.atendimento.update({
    where: { id },
    data: { situacao: "EM_ATENDIMENTO", atendidoEm: new Date() },
  });
  return { ok: true };
}

/**
 * AGENDADO | EM_ATENDIMENTO → CONCLUIDO, com desfecho. Concluir direto de AGENDADO é
 * permitido (vendedora esqueceu de "iniciar") — carimba atendidoEm se ainda nulo.
 */
export async function concluirAtendimento(
  lojaId: string,
  id: string,
  desfecho: AtendimentoDesfecho,
): Promise<ResultadoSituacao> {
  if (!DESFECHOS_VALIDOS.has(desfecho)) return { ok: false, motivo: "desfecho_invalido" };
  const db = tenantPrisma(prisma, lojaId);
  const at = await db.atendimento.findUnique({ where: { id }, select: { situacao: true, atendidoEm: true } });
  if (!at) return { ok: false, motivo: "atendimento_invalido" };
  if (at.situacao !== "AGENDADO" && at.situacao !== "EM_ATENDIMENTO") {
    return { ok: false, motivo: "transicao_invalida" };
  }
  await db.atendimento.update({
    where: { id },
    data: { situacao: "CONCLUIDO", desfecho, atendidoEm: at.atendidoEm ?? new Date() },
  });
  return { ok: true };
}

/** AGENDADO → FALTOU (não compareceu). Só da loja. */
export async function marcarFalta(lojaId: string, id: string): Promise<ResultadoSituacao> {
  const db = tenantPrisma(prisma, lojaId);
  const at = await db.atendimento.findUnique({ where: { id }, select: { situacao: true } });
  if (!at) return { ok: false, motivo: "atendimento_invalido" };
  if (at.situacao !== "AGENDADO") return { ok: false, motivo: "transicao_invalida" };
  await db.atendimento.update({ where: { id }, data: { situacao: "FALTOU" } });
  return { ok: true };
}

/** Conclui uma PROVA (sem desfecho). AGENDADO|EM_ATENDIMENTO → CONCLUIDO. */
export async function concluirProva(lojaId: string, id: string): Promise<ResultadoSituacao> {
  const db = tenantPrisma(prisma, lojaId);
  const at = await db.atendimento.findUnique({ where: { id }, select: { situacao: true, tipo: true, atendidoEm: true } });
  if (!at) return { ok: false, motivo: "atendimento_invalido" };
  if (at.tipo !== "PROVA") return { ok: false, motivo: "nao_e_prova" };
  if (at.situacao !== "AGENDADO" && at.situacao !== "EM_ATENDIMENTO") return { ok: false, motivo: "transicao_invalida" };
  await db.atendimento.update({ where: { id }, data: { situacao: "CONCLUIDO", atendidoEm: at.atendidoEm ?? new Date() } });
  return { ok: true };
}

export type ProvaAberta = {
  id: string;
  inicio: Date;
  situacao: AtendimentoSituacao;
  leadId: string;
  noivaNome: string | null;
  cabineNome: string | null;
  vendedoraNome: string | null;
  bloqueioId: string | null;
  vestidoCodigo: string | null;
  vestidoNome: string | null;
  casamentoData: Date | null;
  ajustes: { id: string; descricao: string; status: import("@/generated/prisma/client").AjusteStatus; checklistFeitos: number; checklistTotal: number }[];
};

/** Provas ABERTAS (AGENDADO/EM_ATENDIMENTO) da loja, por horário — a fila de trabalho da aba Provas & ajustes. */
export async function listarProvasAbertas(lojaId: string): Promise<ProvaAberta[]> {
  const rows = await tenantPrisma(prisma, lojaId).atendimento.findMany({
    where: { tipo: "PROVA", situacao: { in: ["AGENDADO", "EM_ATENDIMENTO"] } },
    orderBy: { inicio: "asc" },
    include: {
      lead: { select: { noivaNome: true } },
      cabine: { select: { nome: true } },
      vendedora: { select: { nome: true } },
      bloqueio: { include: { vestido: { select: { codigo: true, nome: true } } } },
      ajustes: { orderBy: { createdAt: "asc" }, include: { checklist: { select: { feito: true } } } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    situacao: a.situacao,
    leadId: a.leadId,
    noivaNome: a.lead?.noivaNome ?? null,
    cabineNome: a.cabine?.nome ?? null,
    vendedoraNome: a.vendedora?.nome ?? null,
    bloqueioId: a.bloqueioId,
    vestidoCodigo: a.bloqueio?.vestido.codigo ?? null,
    vestidoNome: a.bloqueio?.vestido.nome ?? null,
    casamentoData: a.bloqueio?.casamentoData ?? null,
    ajustes: a.ajustes.map((aj) => ({
      id: aj.id,
      descricao: aj.descricao,
      status: aj.status,
      checklistFeitos: aj.checklist.filter((c) => c.feito).length,
      checklistTotal: aj.checklist.length,
    })),
  }));
}
