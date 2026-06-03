// src/app/(app)/loja/[lojaId]/orcamentos/actions.ts
// Orçamentos — Server Actions com <form> nativo. Ver = leads:ver; mutar = leads:editar.
// Volta por query-param (?ok / ?erro). criarOrcamento pode nascer de um atendimento
// (herda a vendedora que negociou) ou do perfil da noiva (vendedora = usuário atual).
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import {
  criarOrcamento,
  adicionarItem,
  editarItem,
  removerItem,
  definirDesconto,
  mudarStatus,
} from "@/lib/orcamentos/orcamentos";
import type { OrcamentoItemTipo, OrcamentoStatus, DescontoTipo } from "@/generated/prisma/client";

async function sessao() {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  return sc;
}
async function exigeEditar(lojaId: string, usuarioId: string, voltarSe: string) {
  if (!(await podeNoModulo(usuarioId, lojaId, "leads", "editar"))) redirect(voltarSe);
}
function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}
function detalhe(lojaId: string, id: string) {
  return `/loja/${lojaId}/orcamentos/${id}`;
}

/**
 * Abre um orçamento. Se vier atendimentoId, herda leadId + vendedora do atendimento
 * (a vendedora que negociou). Senão, usa leadId do form e o usuário atual como vendedora.
 */
export async function criarOrcamentoAction(formData: FormData) {
  const sc = await sessao();
  const lojaId = sc.loja.id;
  const voltar = `/loja/${lojaId}/noivas`;
  await exigeEditar(lojaId, sc.usuario.id, voltar);

  const atendimentoId = str(formData, "atendimentoId") || null;
  let leadId = str(formData, "leadId");
  let vendedoraId = sc.usuario.id;

  if (atendimentoId) {
    const at = await tenantPrisma(prisma, lojaId).atendimento.findUnique({
      where: { id: atendimentoId },
      select: { leadId: true, vendedoraId: true },
    });
    if (!at) redirect(`/loja/${lojaId}/atendimentos?erro=atendimento_invalido`);
    leadId = at.leadId;
    vendedoraId = at.vendedoraId;
  }

  const r = await criarOrcamento(lojaId, { leadId, atendimentoId, vendedoraId });
  if (!r.ok) {
    const base = atendimentoId ? `/loja/${lojaId}/atendimentos` : `/loja/${lojaId}/noivas/${leadId}`;
    redirect(`${base}?erro=${r.motivo}`);
  }
  redirect(detalhe(lojaId, r.orcamentoId));
}

export async function adicionarItemAction(formData: FormData) {
  const sc = await sessao();
  const lojaId = sc.loja.id;
  const id = str(formData, "orcamentoId");
  await exigeEditar(lojaId, sc.usuario.id, detalhe(lojaId, id));
  const r = await adicionarItem(lojaId, id, {
    tipo: str(formData, "tipo") as OrcamentoItemTipo,
    vestidoId: str(formData, "vestidoId") || null,
    descricao: str(formData, "descricao"),
    valorUnitario: str(formData, "valorUnitario"),
    quantidade: Number(str(formData, "quantidade") || "1"),
  });
  redirect(r.ok ? `${detalhe(lojaId, id)}?ok=item` : `${detalhe(lojaId, id)}?erro=${r.motivo}`);
}

export async function editarItemAction(formData: FormData) {
  const sc = await sessao();
  const lojaId = sc.loja.id;
  const id = str(formData, "orcamentoId");
  await exigeEditar(lojaId, sc.usuario.id, detalhe(lojaId, id));
  const r = await editarItem(lojaId, str(formData, "itemId"), {
    descricao: str(formData, "descricao"),
    valorUnitario: str(formData, "valorUnitario"),
    quantidade: Number(str(formData, "quantidade") || "1"),
  });
  redirect(r.ok ? `${detalhe(lojaId, id)}?ok=item` : `${detalhe(lojaId, id)}?erro=${r.motivo}`);
}

export async function removerItemAction(formData: FormData) {
  const sc = await sessao();
  const lojaId = sc.loja.id;
  const id = str(formData, "orcamentoId");
  await exigeEditar(lojaId, sc.usuario.id, detalhe(lojaId, id));
  await removerItem(lojaId, str(formData, "itemId"));
  redirect(`${detalhe(lojaId, id)}?ok=item_removido`);
}

export async function definirDescontoAction(formData: FormData) {
  const sc = await sessao();
  const lojaId = sc.loja.id;
  const id = str(formData, "orcamentoId");
  await exigeEditar(lojaId, sc.usuario.id, detalhe(lojaId, id));
  const tipo = str(formData, "tipo");
  const valor = str(formData, "valor");
  const r = !tipo || !valor
    ? await definirDesconto(lojaId, id, null) // limpar
    : await definirDesconto(lojaId, id, { tipo: tipo as DescontoTipo, valor });
  redirect(r.ok ? `${detalhe(lojaId, id)}?ok=desconto` : `${detalhe(lojaId, id)}?erro=${r.motivo}`);
}

export async function mudarStatusAction(formData: FormData) {
  const sc = await sessao();
  const lojaId = sc.loja.id;
  const id = str(formData, "orcamentoId");
  await exigeEditar(lojaId, sc.usuario.id, detalhe(lojaId, id));
  const r = await mudarStatus(lojaId, id, str(formData, "status") as OrcamentoStatus);
  redirect(r.ok ? `${detalhe(lojaId, id)}?ok=status` : `${detalhe(lojaId, id)}?erro=${r.motivo}`);
}
