// src/lib/atelier/ajustes.ts
//
// Ajustes de costura — nascem de uma Prova e carregam lojaId (entram no
// tenantPrisma), o que deixa a fila global da costureira ser uma consulta direta
// e isolada. O checklist de costura (AjusteChecklistItem) é filha PURA (sem
// lojaId): só a tocamos depois de confirmar o Ajuste pai pela loja (padrão fotos.ts).
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";

export type ResultadoAjuste =
  | { ok: true; ajusteId: string }
  | { ok: false; motivo: "sem_descricao" | "prova_invalida" };

/** Adiciona um ajuste a uma prova da loja. Valida o pai (Prova) via tenantPrisma. */
export async function adicionarAjuste(
  lojaId: string,
  input: { provaId: string; descricao: string },
): Promise<ResultadoAjuste> {
  const descricao = input.descricao?.trim();
  if (!descricao) return { ok: false, motivo: "sem_descricao" };

  const db = tenantPrisma(prisma, lojaId);
  const prova = await db.prova.findUnique({ where: { id: input.provaId }, select: { id: true } });
  if (!prova) return { ok: false, motivo: "prova_invalida" };

  const criado = await db.ajuste.create({
    // tenantPrisma carimba lojaId; cast pela mesma razão dos outros creates de tenant.
    data: { provaId: input.provaId, descricao } as never,
  });
  return { ok: true, ajusteId: criado.id };
}

/**
 * Alterna o status de um ajuste (PENDENTE ↔ FEITO). Usado tanto no detalhe da
 * reserva quanto na fila global ("marcar feito"). Escopo de loja: lê o atual e
 * grava o oposto; ajuste de outra loja não é encontrado (findUnique → null).
 */
export async function alternarStatusAjuste(lojaId: string, ajusteId: string): Promise<void> {
  const db = tenantPrisma(prisma, lojaId);
  const atual = await db.ajuste.findUnique({ where: { id: ajusteId }, select: { status: true } });
  if (!atual) return; // outra loja / inexistente → no-op (falha fechada)
  await db.ajuste.update({
    where: { id: ajusteId },
    data: { status: atual.status === "PENDENTE" ? "FEITO" : "PENDENTE" },
  });
}

/** Remove um ajuste (e seu checklist por cascade). Escopo de loja. */
export async function removerAjuste(lojaId: string, ajusteId: string): Promise<void> {
  await tenantPrisma(prisma, lojaId).ajuste.deleteMany({ where: { id: ajusteId } });
}

// ── Checklist de costura (filha pura: confirmar o Ajuste pai antes de tocar) ──

// Confirma que o ajuste é da loja antes de mexer na filha sem lojaId (falha fechada).
async function exigirAjusteDaLoja(lojaId: string, ajusteId: string): Promise<boolean> {
  const dono = await tenantPrisma(prisma, lojaId).ajuste.findUnique({
    where: { id: ajusteId },
    select: { id: true },
  });
  return dono != null;
}

/** Adiciona um item ao checklist de um ajuste da loja. Item entra no fim da ordem. */
export async function adicionarItemChecklist(
  lojaId: string,
  ajusteId: string,
  descricao: string,
): Promise<void> {
  const texto = descricao?.trim();
  if (!texto) return;
  if (!(await exigirAjusteDaLoja(lojaId, ajusteId))) return;
  const qtd = await prisma.ajusteChecklistItem.count({ where: { ajusteId } });
  await prisma.ajusteChecklistItem.create({
    data: { ajusteId, descricao: texto, ordem: qtd },
  });
}

/** Marca/desmarca um item do checklist. Confirma a loja pelo Ajuste pai do item. */
export async function alternarItemChecklist(lojaId: string, itemId: string): Promise<void> {
  const item = await prisma.ajusteChecklistItem.findUnique({
    where: { id: itemId },
    select: { feito: true, ajuste: { select: { lojaId: true } } },
  });
  if (!item || item.ajuste.lojaId !== lojaId) return; // falha fechada
  await prisma.ajusteChecklistItem.update({
    where: { id: itemId },
    data: { feito: !item.feito },
  });
}

/** Remove um item do checklist. Confirma a loja pelo Ajuste pai do item. */
export async function removerItemChecklist(lojaId: string, itemId: string): Promise<void> {
  const item = await prisma.ajusteChecklistItem.findUnique({
    where: { id: itemId },
    select: { ajuste: { select: { lojaId: true } } },
  });
  if (!item || item.ajuste.lojaId !== lojaId) return; // falha fechada
  await prisma.ajusteChecklistItem.delete({ where: { id: itemId } });
}

// ── Fila global da costureira ────────────────────────────────────────────────

export type AjustePendente = {
  id: string;
  descricao: string;
  // contexto pra costureira saber de quem é e qual a urgência
  provaDataReal: Date;
  noivaNome: string | null;
  leadId: string | null;
  bloqueioId: string;
  vestidoId: string;
  vestidoCodigo: string;
  vestidoNome: string;
  casamentoData: Date | null;
  // contagem do checklist (feitos/total) pra um microindicador na lista
  checklistFeitos: number;
  checklistTotal: number;
};

/**
 * Fila de ajustes PENDENTES da loja, do casamento mais próximo ao mais distante
 * (urgência primeiro; sem data ao fim). Consulta direta em `ajuste` graças ao
 * lojaId + tenantPrisma — junta prova → reserva → noiva/vestido para o contexto.
 */
export async function listarAjustesPendentes(lojaId: string): Promise<AjustePendente[]> {
  const rows = await tenantPrisma(prisma, lojaId).ajuste.findMany({
    where: { status: "PENDENTE" },
    include: {
      checklist: { select: { feito: true } },
      prova: {
        include: {
          bloqueio: {
            include: {
              lead: { select: { id: true, noivaNome: true } },
              vestido: { select: { id: true, codigo: true, nome: true } },
            },
          },
        },
      },
    },
  });

  return rows
    .map((a) => ({
      id: a.id,
      descricao: a.descricao,
      provaDataReal: a.prova.dataReal,
      noivaNome: a.prova.bloqueio.lead?.noivaNome ?? null,
      leadId: a.prova.bloqueio.leadId,
      bloqueioId: a.prova.bloqueioId,
      vestidoId: a.prova.bloqueio.vestido.id,
      vestidoCodigo: a.prova.bloqueio.vestido.codigo,
      vestidoNome: a.prova.bloqueio.vestido.nome,
      casamentoData: a.prova.bloqueio.casamentoData,
      checklistFeitos: a.checklist.filter((c) => c.feito).length,
      checklistTotal: a.checklist.length,
    }))
    .sort((x, y) => {
      // casamento mais próximo primeiro; sem data vai pro fim.
      const tx = x.casamentoData?.getTime() ?? Number.POSITIVE_INFINITY;
      const ty = y.casamentoData?.getTime() ?? Number.POSITIVE_INFINITY;
      return tx - ty;
    });
}
