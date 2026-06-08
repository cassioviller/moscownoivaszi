// src/lib/atelier/ajustes.ts
//
// Ajustes de costura — nascem de uma Prova e carregam lojaId (entram no
// tenantPrisma), o que deixa a fila global da costureira ser uma consulta direta
// e isolada. O checklist de costura (AjusteChecklistItem) é filha PURA (sem
// lojaId): só a tocamos depois de confirmar o Ajuste pai pela loja (padrão fotos.ts).
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { paginar } from "@/lib/paginacao";

export type ResultadoAjuste =
  | { ok: true; ajusteId: string }
  | { ok: false; motivo: "sem_descricao" | "prova_invalida" };

// Mutações que podem cair no caminho falha-fechada (ajuste/item de outra loja ou
// inexistente). Antes retornavam void e a action reportava "feito" mesmo no no-op;
// agora devolvem {ok} para a action distinguir sucesso de "não encontrado".
export type ResultadoMutacaoAjuste = { ok: true } | { ok: false; motivo: "ajuste_invalido" };
export type ResultadoItemChecklist =
  | { ok: true }
  | { ok: false; motivo: "sem_descricao" | "ajuste_invalido" };
export type ResultadoMutacaoItem = { ok: true } | { ok: false; motivo: "item_invalido" };

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
export async function alternarStatusAjuste(lojaId: string, ajusteId: string): Promise<ResultadoMutacaoAjuste> {
  const db = tenantPrisma(prisma, lojaId);
  const atual = await db.ajuste.findUnique({ where: { id: ajusteId }, select: { status: true } });
  if (!atual) return { ok: false, motivo: "ajuste_invalido" }; // outra loja / inexistente (falha fechada)
  await db.ajuste.update({
    where: { id: ajusteId },
    data: { status: atual.status === "PENDENTE" ? "FEITO" : "PENDENTE" },
  });
  return { ok: true };
}

/** Remove um ajuste (e seu checklist por cascade). Escopo de loja. */
export async function removerAjuste(lojaId: string, ajusteId: string): Promise<ResultadoMutacaoAjuste> {
  const { count } = await tenantPrisma(prisma, lojaId).ajuste.deleteMany({ where: { id: ajusteId } });
  return count > 0 ? { ok: true } : { ok: false, motivo: "ajuste_invalido" };
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
): Promise<ResultadoItemChecklist> {
  const texto = descricao?.trim();
  if (!texto) return { ok: false, motivo: "sem_descricao" };
  if (!(await exigirAjusteDaLoja(lojaId, ajusteId))) return { ok: false, motivo: "ajuste_invalido" };
  const qtd = await prisma.ajusteChecklistItem.count({ where: { ajusteId } });
  await prisma.ajusteChecklistItem.create({
    data: { ajusteId, descricao: texto, ordem: qtd },
  });
  return { ok: true };
}

/** Marca/desmarca um item do checklist. Confirma a loja pelo Ajuste pai do item. */
export async function alternarItemChecklist(lojaId: string, itemId: string): Promise<ResultadoMutacaoItem> {
  const item = await prisma.ajusteChecklistItem.findUnique({
    where: { id: itemId },
    select: { feito: true, ajuste: { select: { lojaId: true } } },
  });
  if (!item || item.ajuste.lojaId !== lojaId) return { ok: false, motivo: "item_invalido" }; // falha fechada
  await prisma.ajusteChecklistItem.update({
    where: { id: itemId },
    data: { feito: !item.feito },
  });
  return { ok: true };
}

/** Remove um item do checklist. Confirma a loja pelo Ajuste pai do item. */
export async function removerItemChecklist(lojaId: string, itemId: string): Promise<ResultadoMutacaoItem> {
  const item = await prisma.ajusteChecklistItem.findUnique({
    where: { id: itemId },
    select: { ajuste: { select: { lojaId: true } } },
  });
  if (!item || item.ajuste.lojaId !== lojaId) return { ok: false, motivo: "item_invalido" }; // falha fechada
  await prisma.ajusteChecklistItem.delete({ where: { id: itemId } });
  return { ok: true };
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
export async function listarAjustesPendentes(
  lojaId: string,
  opts: { pagina?: number | string; tamanho?: number } = {},
): Promise<{ itens: AjustePendente[]; total: number }> {
  const db = tenantPrisma(prisma, lojaId);
  const where = { status: "PENDENTE" as const };
  const { skip, take } = paginar(opts.pagina, opts.tamanho);
  // Urgência primeiro (casamento mais próximo); sem data ao fim. A ordenação e a
  // paginação vão para o BANCO via orderBy aninhado por relação (ajuste → prova →
  // bloqueio.casamentoData) — antes a fila inteira era materializada e ordenada em
  // memória a cada página. Chave secundária `id` desempata para paginação estável.
  const [total, rows] = await Promise.all([
    db.ajuste.count({ where }),
    db.ajuste.findMany({
      where,
      orderBy: [
        { prova: { bloqueio: { casamentoData: { sort: "asc", nulls: "last" } } } },
        { id: "asc" },
      ],
      skip,
      take,
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
    }),
  ]);

  const itens: AjustePendente[] = rows.map((a) => ({
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
  }));
  return { itens, total };
}
