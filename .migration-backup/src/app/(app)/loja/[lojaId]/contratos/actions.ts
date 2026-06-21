// src/app/(app)/loja/[lojaId]/contratos/actions.ts
// Contratos — Server Actions via acaoAutorizada. Gerar = leads:criar; editar/cancelar =
// leads:editar. Contrato nasce pré-preenchido (do orçamento aprovado ou da noiva); volta por
// query-param. PDF é GET por id (route à parte).
"use server";

import { redirect } from "next/navigation";
import {
  criarContratoDeOrcamento,
  criarContratoDaNoiva,
  editarContrato,
  cancelarContrato,
} from "@/lib/contratos/contratos";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str } from "@/lib/server/form";

function detalhe(lojaId: string, id: string) {
  return `/loja/${lojaId}/contratos/${id}`;
}

export const gerarContratoDeOrcamentoAction = acaoAutorizada("leads", "criar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const orcamentoId = str(formData, "orcamentoId");
  const voltar = `/loja/${lojaId}/orcamentos/${orcamentoId}`;
  const r = await criarContratoDeOrcamento(lojaId, orcamentoId);
  redirect(r.ok ? detalhe(lojaId, r.contratoId) : `${voltar}?erro=${r.motivo}`);
});

export const gerarContratoDaNoivaAction = acaoAutorizada("leads", "criar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const leadId = str(formData, "leadId");
  const voltar = `/loja/${lojaId}/noivas/${leadId}`;
  const r = await criarContratoDaNoiva(lojaId, leadId, sc.usuario.id);
  redirect(r.ok ? detalhe(lojaId, r.contratoId) : `${voltar}?erro=${r.motivo}`);
});

export const editarContratoAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const id = str(formData, "contratoId");
  const r = await editarContrato(lojaId, id, {
    cpf: str(formData, "cpf"),
    vestidoDescricao: str(formData, "vestidoDescricao"),
    valorTotal: str(formData, "valorTotal"),
    formaPagamento: str(formData, "formaPagamento"),
    dataCasamento: str(formData, "dataCasamento"),
    dataRetirada: str(formData, "dataRetirada"),
    dataDevolucao: str(formData, "dataDevolucao"),
    observacoes: str(formData, "observacoes"),
  });
  redirect(r.ok ? `${detalhe(lojaId, id)}?ok=salvo` : `${detalhe(lojaId, id)}?erro=${r.motivo}`);
});

export const cancelarContratoAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const id = str(formData, "contratoId");
  const destinoPago = str(formData, "destinoPago") === "estornar" ? "estornar" : "manter";
  const r = await cancelarContrato(lojaId, id, { destinoPago, motivo: str(formData, "motivo") });
  redirect(r.ok ? `${detalhe(lojaId, id)}?ok=cancelado` : `${detalhe(lojaId, id)}?erro=${r.motivo}`);
});
