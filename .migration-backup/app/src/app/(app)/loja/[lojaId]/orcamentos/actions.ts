// src/app/(app)/loja/[lojaId]/orcamentos/actions.ts
// Orçamentos — Server Actions via acaoAutorizada(leads, editar). Volta por query-param
// (?ok / ?erro). criarOrcamento pode nascer de um atendimento (herda a vendedora que
// negociou) ou do perfil da noiva (vendedora = usuário atual).
"use server";

import { redirect } from "next/navigation";
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
import { fecharContratoDeOrcamento } from "@/lib/contratos/contratos";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str } from "@/lib/server/form";
import type { OrcamentoItemTipo, OrcamentoStatus, DescontoTipo } from "@/generated/prisma/client";

function detalhe(lojaId: string, id: string) {
  return `/loja/${lojaId}/orcamentos/${id}`;
}

/**
 * Abre um orçamento. Se vier atendimentoId, herda leadId + vendedora do atendimento
 * (a vendedora que negociou). Senão, usa leadId do form e o usuário atual como vendedora.
 */
export const criarOrcamentoAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
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
});

export const adicionarItemAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const id = str(formData, "orcamentoId");
  const r = await adicionarItem(lojaId, id, {
    tipo: str(formData, "tipo") as OrcamentoItemTipo,
    vestidoId: str(formData, "vestidoId") || null,
    descricao: str(formData, "descricao"),
    valorUnitario: str(formData, "valorUnitario"),
    quantidade: Number(str(formData, "quantidade") || "1"),
  });
  redirect(r.ok ? `${detalhe(lojaId, id)}?ok=item` : `${detalhe(lojaId, id)}?erro=${r.motivo}`);
});

export const editarItemAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const id = str(formData, "orcamentoId");
  const r = await editarItem(lojaId, str(formData, "itemId"), {
    descricao: str(formData, "descricao"),
    valorUnitario: str(formData, "valorUnitario"),
    quantidade: Number(str(formData, "quantidade") || "1"),
  });
  redirect(r.ok ? `${detalhe(lojaId, id)}?ok=item` : `${detalhe(lojaId, id)}?erro=${r.motivo}`);
});

export const removerItemAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const id = str(formData, "orcamentoId");
  await removerItem(lojaId, str(formData, "itemId"));
  redirect(`${detalhe(lojaId, id)}?ok=item_removido`);
});

export const definirDescontoAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const id = str(formData, "orcamentoId");
  const tipo = str(formData, "tipo");
  const valor = str(formData, "valor");
  const r = !tipo || !valor
    ? await definirDesconto(lojaId, id, null) // limpar
    : await definirDesconto(lojaId, id, { tipo: tipo as DescontoTipo, valor });
  redirect(r.ok ? `${detalhe(lojaId, id)}?ok=desconto` : `${detalhe(lojaId, id)}?erro=${r.motivo}`);
});

export const mudarStatusAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const id = str(formData, "orcamentoId");
  const r = await mudarStatus(lojaId, id, str(formData, "status") as OrcamentoStatus);
  redirect(r.ok ? `${detalhe(lojaId, id)}?ok=status` : `${detalhe(lojaId, id)}?erro=${r.motivo}`);
});

export const fecharContratoAction = acaoAutorizada("leads", "criar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const id = str(formData, "orcamentoId");
  const r = await fecharContratoDeOrcamento(lojaId, id, {
    cpf: str(formData, "cpf"),
    formaPagamento: str(formData, "formaPagamento"),
    entrada: str(formData, "entrada"),
    numParcelas: Number(str(formData, "numParcelas") || "1"),
    primeiroVencimento: str(formData, "primeiroVencimento"),
  });
  if (!r.ok) redirect(`${detalhe(lojaId, id)}?erro=${r.motivo}`);
  redirect(`/loja/${lojaId}/contratos/${r.contratoId}?ok=fechado`);
});
