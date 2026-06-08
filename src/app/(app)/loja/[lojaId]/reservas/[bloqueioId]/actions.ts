// src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/actions.ts
// Provas e ajustes a partir do detalhe da reserva. As ações de prova/ajuste têm permissão
// fixa no módulo "ajustes" → usam acaoAutorizada. As de MOVIMENTAÇÃO (retirada/devolução)
// exigem leads:editar OU ajustes:editar (a costureira que entrega/recebe também registra) —
// gate de OR que o seam de permissão única não modela, então mantêm guardMovimentacao local.
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { registrarProva, editarProva, removerProva } from "@/lib/atelier/provas";
import { definirMovimentacaoReserva } from "@/lib/disponibilidade/reservas";
import {
  adicionarAjuste,
  alternarStatusAjuste,
  removerAjuste,
  adicionarItemChecklist,
  alternarItemChecklist,
  removerItemChecklist,
} from "@/lib/atelier/ajustes";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso } from "@/lib/server/form";
import type { ProvaTipo, ProvaComparecimento } from "@/generated/prisma/client";

const baseReserva = (lojaId: string, bloqueioId: string) => `/loja/${lojaId}/reservas/${bloqueioId}`;

// Movimentação avança a JORNADA, mas a costureira também precisa registrar → leads:editar
// OU ajustes:editar. Gate de OR (fora do acaoAutorizada de permissão única).
async function guardMovimentacao(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const bloqueioId = str(formData, "bloqueioId");
  const base = baseReserva(sc.loja.id, bloqueioId);
  const [podeLeads, podeAjustes] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "editar"),
  ]);
  if (!podeLeads && !podeAjustes) redirect(base);
  return { lojaId: sc.loja.id, bloqueioId, base };
}

export const registrarProvaAction = acaoAutorizada("ajustes", "criar", async (sc, formData) => {
  const bloqueioId = str(formData, "bloqueioId");
  const base = baseReserva(sc.loja.id, bloqueioId);
  const r = await registrarProva(sc.loja.id, {
    bloqueioId,
    dataReal: str(formData, "dataReal"),
    tipo: str(formData, "tipo") as ProvaTipo,
    comparecimento: (str(formData, "comparecimento") || "AGENDADA") as ProvaComparecimento,
    responsavel: str(formData, "responsavel") || null,
    observacao: str(formData, "observacao") || null,
  });
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "prova" : r.motivo));
});

export const editarProvaAction = acaoAutorizada("ajustes", "editar", async (sc, formData) => {
  const base = baseReserva(sc.loja.id, str(formData, "bloqueioId"));
  const r = await editarProva(sc.loja.id, str(formData, "provaId"), {
    dataReal: str(formData, "dataReal"),
    tipo: str(formData, "tipo") as ProvaTipo,
    comparecimento: str(formData, "comparecimento") as ProvaComparecimento,
    responsavel: str(formData, "responsavel"),
    observacao: str(formData, "observacao"),
  });
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "prova" : r.motivo));
});

export const removerProvaAction = acaoAutorizada("ajustes", "editar", async (sc, formData) => {
  const base = baseReserva(sc.loja.id, str(formData, "bloqueioId"));
  await removerProva(sc.loja.id, str(formData, "provaId"));
  redirect(comAviso(base, "ok", "prova_removida"));
});

export const adicionarAjusteAction = acaoAutorizada("ajustes", "criar", async (sc, formData) => {
  const base = baseReserva(sc.loja.id, str(formData, "bloqueioId"));
  const r = await adicionarAjuste(sc.loja.id, {
    provaId: str(formData, "provaId"),
    descricao: str(formData, "descricao"),
  });
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "ajuste" : r.motivo));
});

export const alternarAjusteAction = acaoAutorizada("ajustes", "editar", async (sc, formData) => {
  const base = baseReserva(sc.loja.id, str(formData, "bloqueioId"));
  const r = await alternarStatusAjuste(sc.loja.id, str(formData, "ajusteId"));
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "ajuste" : r.motivo));
});

export const removerAjusteAction = acaoAutorizada("ajustes", "editar", async (sc, formData) => {
  const base = baseReserva(sc.loja.id, str(formData, "bloqueioId"));
  const r = await removerAjuste(sc.loja.id, str(formData, "ajusteId"));
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "ajuste_removido" : r.motivo));
});

export const adicionarItemAction = acaoAutorizada("ajustes", "criar", async (sc, formData) => {
  const base = baseReserva(sc.loja.id, str(formData, "bloqueioId"));
  const r = await adicionarItemChecklist(sc.loja.id, str(formData, "ajusteId"), str(formData, "descricao"));
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "item" : r.motivo));
});

export const alternarItemAction = acaoAutorizada("ajustes", "editar", async (sc, formData) => {
  const base = baseReserva(sc.loja.id, str(formData, "bloqueioId"));
  const r = await alternarItemChecklist(sc.loja.id, str(formData, "itemId"));
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "item" : r.motivo));
});

export const removerItemAction = acaoAutorizada("ajustes", "editar", async (sc, formData) => {
  const base = baseReserva(sc.loja.id, str(formData, "bloqueioId"));
  const r = await removerItemChecklist(sc.loja.id, str(formData, "itemId"));
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "item" : r.motivo));
});

// — Movimentação do vestido (retirada/devolução) — gate de OR, guardMovimentacao —

export async function registrarRetiradaAction(formData: FormData) {
  const { lojaId, bloqueioId, base } = await guardMovimentacao(formData);
  const r = await definirMovimentacaoReserva(lojaId, bloqueioId, { retiradaDataReal: str(formData, "data") });
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "movimentacao" : r.motivo));
}

export async function registrarDevolucaoAction(formData: FormData) {
  const { lojaId, bloqueioId, base } = await guardMovimentacao(formData);
  const r = await definirMovimentacaoReserva(lojaId, bloqueioId, { devolucaoDataReal: str(formData, "data") });
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "movimentacao" : r.motivo));
}

export async function desfazerRetiradaAction(formData: FormData) {
  const { lojaId, bloqueioId, base } = await guardMovimentacao(formData);
  const r = await definirMovimentacaoReserva(lojaId, bloqueioId, { retiradaDataReal: null });
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "movimentacao_desfeita" : r.motivo));
}

export async function desfazerDevolucaoAction(formData: FormData) {
  const { lojaId, bloqueioId, base } = await guardMovimentacao(formData);
  const r = await definirMovimentacaoReserva(lojaId, bloqueioId, { devolucaoDataReal: null });
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "movimentacao_desfeita" : r.motivo));
}
