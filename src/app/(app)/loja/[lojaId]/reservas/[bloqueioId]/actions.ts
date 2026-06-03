// src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/actions.ts
// Provas e ajustes a partir do detalhe da reserva. Server Actions com <form> nativo
// (sem client component): cada uma revalida sessão + permissão e volta por
// query-param (?ok / ?erro). Mutar provas/ajustes é gateado no módulo "ajustes".
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo, type Acao } from "@/lib/permissoes/modulos";
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
import type { ProvaTipo, ProvaComparecimento } from "@/generated/prisma/client";

// Sessão + gate no módulo "ajustes". Devolve { lojaId, base } para o redirect, ou
// já redireciona em falha (sessão/permissão). bloqueioId vem do form (hidden).
async function guard(formData: FormData, acao: Acao) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const bloqueioId = String(formData.get("bloqueioId") ?? "");
  const base = `/loja/${sc.loja.id}/reservas/${bloqueioId}`;
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", acao))) redirect(base);
  return { lojaId: sc.loja.id, bloqueioId, base };
}

// Movimentação (retirada/devolução) avança a JORNADA, mas a costureira que entrega/
// recebe a peça também precisa registrar → passa com leads:editar OU ajustes:editar.
async function guardMovimentacao(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const bloqueioId = String(formData.get("bloqueioId") ?? "");
  const base = `/loja/${sc.loja.id}/reservas/${bloqueioId}`;
  const [podeLeads, podeAjustes] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "editar"),
  ]);
  if (!podeLeads && !podeAjustes) redirect(base);
  return { lojaId: sc.loja.id, bloqueioId, base };
}

function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

export async function registrarProvaAction(formData: FormData) {
  const { lojaId, bloqueioId, base } = await guard(formData, "criar");
  const r = await registrarProva(lojaId, {
    bloqueioId,
    dataReal: str(formData, "dataReal"),
    tipo: str(formData, "tipo") as ProvaTipo,
    comparecimento: (str(formData, "comparecimento") || "AGENDADA") as ProvaComparecimento,
    responsavel: str(formData, "responsavel") || null,
    observacao: str(formData, "observacao") || null,
  });
  redirect(r.ok ? `${base}?ok=prova` : `${base}?erro=${r.motivo}`);
}

export async function editarProvaAction(formData: FormData) {
  const { lojaId, base } = await guard(formData, "editar");
  const r = await editarProva(lojaId, str(formData, "provaId"), {
    dataReal: str(formData, "dataReal"),
    tipo: str(formData, "tipo") as ProvaTipo,
    comparecimento: str(formData, "comparecimento") as ProvaComparecimento,
    responsavel: str(formData, "responsavel"),
    observacao: str(formData, "observacao"),
  });
  redirect(r.ok ? `${base}?ok=prova` : `${base}?erro=${r.motivo}`);
}

export async function removerProvaAction(formData: FormData) {
  const { lojaId, base } = await guard(formData, "editar");
  await removerProva(lojaId, str(formData, "provaId"));
  redirect(`${base}?ok=prova_removida`);
}

export async function adicionarAjusteAction(formData: FormData) {
  const { lojaId, base } = await guard(formData, "criar");
  const r = await adicionarAjuste(lojaId, {
    provaId: str(formData, "provaId"),
    descricao: str(formData, "descricao"),
  });
  redirect(r.ok ? `${base}?ok=ajuste` : `${base}?erro=${r.motivo}`);
}

export async function alternarAjusteAction(formData: FormData) {
  const { lojaId, base } = await guard(formData, "editar");
  await alternarStatusAjuste(lojaId, str(formData, "ajusteId"));
  redirect(`${base}?ok=ajuste`);
}

export async function removerAjusteAction(formData: FormData) {
  const { lojaId, base } = await guard(formData, "editar");
  await removerAjuste(lojaId, str(formData, "ajusteId"));
  redirect(`${base}?ok=ajuste_removido`);
}

export async function adicionarItemAction(formData: FormData) {
  const { lojaId, base } = await guard(formData, "criar");
  await adicionarItemChecklist(lojaId, str(formData, "ajusteId"), str(formData, "descricao"));
  redirect(`${base}?ok=item`);
}

export async function alternarItemAction(formData: FormData) {
  const { lojaId, base } = await guard(formData, "editar");
  await alternarItemChecklist(lojaId, str(formData, "itemId"));
  redirect(`${base}?ok=item`);
}

export async function removerItemAction(formData: FormData) {
  const { lojaId, base } = await guard(formData, "editar");
  await removerItemChecklist(lojaId, str(formData, "itemId"));
  redirect(`${base}?ok=item`);
}

// — Movimentação do vestido (retirada/devolução) —

export async function registrarRetiradaAction(formData: FormData) {
  const { lojaId, bloqueioId, base } = await guardMovimentacao(formData);
  const r = await definirMovimentacaoReserva(lojaId, bloqueioId, { retiradaDataReal: str(formData, "data") });
  redirect(r.ok ? `${base}?ok=movimentacao` : `${base}?erro=${r.motivo}`);
}

export async function registrarDevolucaoAction(formData: FormData) {
  const { lojaId, bloqueioId, base } = await guardMovimentacao(formData);
  const r = await definirMovimentacaoReserva(lojaId, bloqueioId, { devolucaoDataReal: str(formData, "data") });
  redirect(r.ok ? `${base}?ok=movimentacao` : `${base}?erro=${r.motivo}`);
}

export async function desfazerRetiradaAction(formData: FormData) {
  const { lojaId, bloqueioId, base } = await guardMovimentacao(formData);
  const r = await definirMovimentacaoReserva(lojaId, bloqueioId, { retiradaDataReal: null });
  redirect(r.ok ? `${base}?ok=movimentacao_desfeita` : `${base}?erro=${r.motivo}`);
}

export async function desfazerDevolucaoAction(formData: FormData) {
  const { lojaId, bloqueioId, base } = await guardMovimentacao(formData);
  const r = await definirMovimentacaoReserva(lojaId, bloqueioId, { devolucaoDataReal: null });
  redirect(r.ok ? `${base}?ok=movimentacao_desfeita` : `${base}?erro=${r.motivo}`);
}
