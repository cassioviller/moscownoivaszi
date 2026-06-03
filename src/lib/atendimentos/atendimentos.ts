// src/lib/atendimentos/atendimentos.ts
// Agendamento de atendimentos: grade do dia, criar (com validações + sem
// sobreposição de cabine/vendedora), listar próximos e cancelar. tenantPrisma.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { gradeDeSlots, type Slot } from "./slots";
import { obterHorarioLoja } from "./cabines";
import type { AtendimentoSituacao, AtendimentoDesfecho } from "@/generated/prisma/client";

// "YYYY-MM-DD" + hora → Date (wall-clock em UTC).
function instante(dataYMD: string, hora: number): Date {
  return new Date(`${dataYMD}T${String(hora).padStart(2, "0")}:00:00.000Z`);
}
function inicioDoDia(dataYMD: string): Date {
  return new Date(`${dataYMD}T00:00:00.000Z`);
}
function fimDoDia(dataYMD: string): Date {
  const d = inicioDoDia(dataYMD);
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
      inicio: { gte: inicioDoDia(dataYMD), lt: fimDoDia(dataYMD) },
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
  | { ok: false; motivo: "lead_invalido" | "cabine_invalida" | "vendedora_invalida" | "sem_horario" | "fora_funcionamento" | "indisponivel" };

export async function agendarAtendimento(
  lojaId: string,
  input: { leadId: string; cabineId: string; vendedoraId: string; dataYMD: string; hora: number; observacao?: string | null },
): Promise<ResultadoAgendar> {
  const { leadId, cabineId, vendedoraId, dataYMD, hora, observacao } = input;
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

  // Revalida sobreposição (cabine OU vendedora na mesma hora).
  const ocupadas = await horasOcupadas(lojaId, dataYMD, cabineId, vendedoraId);
  if (ocupadas.includes(hora)) return { ok: false, motivo: "indisponivel" };

  const obs = observacao?.trim();
  const criado = await db.atendimento.create({
    data: { leadId, cabineId, vendedoraId, inicio: instante(dataYMD, hora), observacao: obs ? obs : null } as never,
  });
  return { ok: true, atendimentoId: criado.id };
}

export type AtendimentoItem = {
  id: string;
  inicio: Date;
  noivaNome: string | null;
  leadId: string;
  cabineNome: string;
  vendedoraNome: string;
};

// Hoje (meia-noite UTC do dia em SP) — mesma convenção do resto do sistema.
function inicioDeHojeUTC(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

export async function listarProximosAtendimentos(lojaId: string): Promise<AtendimentoItem[]> {
  const rows = await tenantPrisma(prisma, lojaId).atendimento.findMany({
    where: { inicio: { gte: inicioDeHojeUTC() } },
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
    where: { situacao: { in: opts.finalizados ? fechados : abertos } },
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
  | { ok: false; motivo: "atendimento_invalido" | "transicao_invalida" | "desfecho_invalido" };

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
