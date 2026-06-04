// src/lib/atelier/provas.ts
//
// Provas — registro OPERACIONAL dentro de uma reserva (BloqueioVestido do tipo
// RESERVA_CASAMENTO). NÃO alimentam o motor de disponibilidade: a peça já está
// presa à reserva pelo bloco contínuo, então registrar/remarcar/faltar uma prova
// não move a janela nem libera o vestido para outra noiva.
// Decisão: docs/superpowers/specs/2026-06-01-provas-ajustes-design.md.
//
// Tudo escopado por loja via tenantPrisma. Datas viajam como "YYYY-MM-DD" na borda
// e como DateTime (meia-noite UTC) no banco — mesma convenção de reservas.ts.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { diaValido } from "@/lib/disponibilidade/datas";
import { meiaNoiteUTC, hojeUTC } from "@/lib/tempo";
import type {
  ProvaTipo,
  ProvaComparecimento,
  AjusteStatus,
} from "@/generated/prisma/client";

const COMPARECIMENTOS_VALIDOS = new Set<ProvaComparecimento>([
  "AGENDADA",
  "COMPARECEU",
  "FALTOU",
  "REMARCADA",
]);

export type AjusteDaProva = {
  id: string;
  descricao: string;
  status: AjusteStatus;
  checklist: { id: string; descricao: string; feito: boolean; ordem: number }[];
};

export type ProvaDaReserva = {
  id: string;
  dataReal: Date;
  tipo: ProvaTipo;
  comparecimento: ProvaComparecimento;
  observacao: string | null;
  responsavel: string | null;
  ajustes: AjusteDaProva[];
};

/** Provas de uma reserva (da mais antiga à mais recente), com ajustes e checklist. */
export async function listarProvasDaReserva(
  lojaId: string,
  bloqueioId: string,
): Promise<ProvaDaReserva[]> {
  const rows = await tenantPrisma(prisma, lojaId).prova.findMany({
    where: { bloqueioId },
    orderBy: { dataReal: "asc" },
    include: {
      ajustes: {
        orderBy: { createdAt: "asc" },
        include: { checklist: { orderBy: { ordem: "asc" } } },
      },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    dataReal: p.dataReal,
    tipo: p.tipo,
    comparecimento: p.comparecimento,
    observacao: p.observacao,
    responsavel: p.responsavel,
    ajustes: p.ajustes.map((a) => ({
      id: a.id,
      descricao: a.descricao,
      status: a.status,
      checklist: a.checklist.map((c) => ({
        id: c.id,
        descricao: c.descricao,
        feito: c.feito,
        ordem: c.ordem,
      })),
    })),
  }));
}


export type ProvaDaLoja = {
  id: string;
  dataReal: Date;
  tipo: ProvaTipo;
  comparecimento: ProvaComparecimento;
  bloqueioId: string; // reserva (deep-link)
  leadId: string | null;
  noivaNome: string | null;
  vestidoCodigo: string;
  vestidoNome: string;
  casamentoData: Date | null;
};

/**
 * Agenda de provas da loja, com noiva e vestido. Padrão: próximas (dataReal ≥ hoje,
 * ascendente); `passadas` traz o histórico (dataReal < hoje, descendente). É o
 * data-layer da tela dedicada de Provas — o registro/edição segue no detalhe da reserva.
 */
export async function listarProvasDaLoja(
  lojaId: string,
  opts: { passadas?: boolean } = {},
): Promise<ProvaDaLoja[]> {
  const hoje = hojeUTC();
  const rows = await tenantPrisma(prisma, lojaId).prova.findMany({
    where: { dataReal: opts.passadas ? { lt: hoje } : { gte: hoje } },
    orderBy: { dataReal: opts.passadas ? "desc" : "asc" },
    include: {
      bloqueio: {
        include: {
          lead: { select: { id: true, noivaNome: true } },
          vestido: { select: { codigo: true, nome: true } },
        },
      },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    dataReal: p.dataReal,
    tipo: p.tipo,
    comparecimento: p.comparecimento,
    bloqueioId: p.bloqueioId,
    leadId: p.bloqueio.leadId,
    noivaNome: p.bloqueio.lead?.noivaNome ?? null,
    vestidoCodigo: p.bloqueio.vestido.codigo,
    vestidoNome: p.bloqueio.vestido.nome,
    casamentoData: p.bloqueio.casamentoData,
  }));
}

const TIPOS_VALIDOS = new Set<ProvaTipo>(["PRIMEIRA", "INTERMEDIARIA", "FINAL"]);

export type ResultadoProva =
  | { ok: true; provaId: string }
  | { ok: false; motivo: "sem_data" | "data_invalida" | "tipo_invalido" | "comparecimento_invalido" | "reserva_invalida" };

/**
 * Registra uma prova numa reserva. Valida que o bloqueio é uma RESERVA_CASAMENTO
 * da loja (não manutenção, não de outra loja). Falha fechada via tenantPrisma.
 */
export async function registrarProva(
  lojaId: string,
  input: {
    bloqueioId: string;
    dataReal: string;
    tipo: ProvaTipo;
    comparecimento?: ProvaComparecimento;
    observacao?: string | null;
    responsavel?: string | null;
  },
): Promise<ResultadoProva> {
  const { bloqueioId, dataReal, tipo, comparecimento, observacao, responsavel } = input;
  if (!dataReal) return { ok: false, motivo: "sem_data" };
  if (!TIPOS_VALIDOS.has(tipo)) return { ok: false, motivo: "tipo_invalido" };
  if (!diaValido(dataReal)) return { ok: false, motivo: "data_invalida" };
  if (comparecimento !== undefined && !COMPARECIMENTOS_VALIDOS.has(comparecimento)) {
    return { ok: false, motivo: "comparecimento_invalido" };
  }

  const db = tenantPrisma(prisma, lojaId);
  const reserva = await db.bloqueioVestido.findUnique({ where: { id: bloqueioId } });
  if (!reserva || reserva.tipo !== "RESERVA_CASAMENTO") {
    return { ok: false, motivo: "reserva_invalida" };
  }

  const obs = observacao?.trim();
  const resp = responsavel?.trim();
  const criada = await db.prova.create({
    // tenantPrisma carimba lojaId em runtime; cast pela mesma razão de reservarVestido.
    data: {
      bloqueioId,
      dataReal: meiaNoiteUTC(dataReal),
      tipo,
      comparecimento: comparecimento ?? "AGENDADA",
      observacao: obs ? obs : null,
      responsavel: resp ? resp : null,
    } as never,
  });
  return { ok: true, provaId: criada.id };
}

export type ResultadoEdicaoProva =
  | { ok: true }
  | { ok: false; motivo: "prova_invalida" | "sem_data" | "data_invalida" | "tipo_invalido" | "comparecimento_invalido" };

/**
 * Edita os campos operacionais de uma prova (comparecimento, data, tipo, notas).
 * Só toca provas da loja (where escopado → P2025 vira "prova_invalida").
 */
export async function editarProva(
  lojaId: string,
  provaId: string,
  patch: {
    dataReal?: string;
    tipo?: ProvaTipo;
    comparecimento?: ProvaComparecimento;
    observacao?: string | null;
    responsavel?: string | null;
  },
): Promise<ResultadoEdicaoProva> {
  if (patch.dataReal !== undefined && !patch.dataReal) return { ok: false, motivo: "sem_data" };
  if (patch.dataReal && !diaValido(patch.dataReal)) return { ok: false, motivo: "data_invalida" };
  if (patch.tipo !== undefined && !TIPOS_VALIDOS.has(patch.tipo)) return { ok: false, motivo: "tipo_invalido" };
  if (patch.comparecimento !== undefined && !COMPARECIMENTOS_VALIDOS.has(patch.comparecimento)) {
    return { ok: false, motivo: "comparecimento_invalido" };
  }
  const data: Record<string, unknown> = {};
  if (patch.dataReal) data.dataReal = meiaNoiteUTC(patch.dataReal);
  if (patch.tipo) data.tipo = patch.tipo;
  if (patch.comparecimento) data.comparecimento = patch.comparecimento;
  if (patch.observacao !== undefined) data.observacao = patch.observacao?.trim() || null;
  if (patch.responsavel !== undefined) data.responsavel = patch.responsavel?.trim() || null;

  try {
    await tenantPrisma(prisma, lojaId).prova.update({ where: { id: provaId }, data });
    return { ok: true };
  } catch {
    return { ok: false, motivo: "prova_invalida" };
  }
}

/** Remove uma prova (e, por cascade, seus ajustes/checklist). Escopo de loja. */
export async function removerProva(lojaId: string, provaId: string): Promise<void> {
  await tenantPrisma(prisma, lojaId).prova.deleteMany({ where: { id: provaId } });
}
