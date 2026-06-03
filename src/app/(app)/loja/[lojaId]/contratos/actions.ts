// src/app/(app)/loja/[lojaId]/contratos/actions.ts
// Contratos — Server Actions. Gerar = leads:criar (mesmo gate do contrato antigo);
// editar/cancelar = leads:editar. Contrato nasce pré-preenchido (do orçamento aprovado
// ou da noiva); volta por query-param. PDF é GET por id (route à parte).
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import {
  criarContratoDeOrcamento,
  criarContratoDaNoiva,
  editarContrato,
  cancelarContrato,
} from "@/lib/contratos/contratos";

async function guard() {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  return sc;
}
function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}
function detalhe(lojaId: string, id: string) {
  return `/loja/${lojaId}/contratos/${id}`;
}

export async function gerarContratoDeOrcamentoAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const orcamentoId = str(formData, "orcamentoId");
  const voltar = `/loja/${lojaId}/orcamentos/${orcamentoId}`;
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "leads", "criar"))) redirect(voltar);
  const r = await criarContratoDeOrcamento(lojaId, orcamentoId);
  redirect(r.ok ? detalhe(lojaId, r.contratoId) : `${voltar}?erro=${r.motivo}`);
}

export async function gerarContratoDaNoivaAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const leadId = str(formData, "leadId");
  const voltar = `/loja/${lojaId}/noivas/${leadId}`;
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "leads", "criar"))) redirect(voltar);
  const r = await criarContratoDaNoiva(lojaId, leadId, sc.usuario.id);
  redirect(r.ok ? detalhe(lojaId, r.contratoId) : `${voltar}?erro=${r.motivo}`);
}

export async function editarContratoAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const id = str(formData, "contratoId");
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "leads", "editar"))) redirect(detalhe(lojaId, id));
  const r = await editarContrato(lojaId, id, {
    cpf: str(formData, "cpf"),
    vestidoDescricao: str(formData, "vestidoDescricao"),
    valorTotal: str(formData, "valorTotal"),
    entrada: str(formData, "entrada"),
    formaPagamento: str(formData, "formaPagamento"),
    dataCasamento: str(formData, "dataCasamento"),
    dataRetirada: str(formData, "dataRetirada"),
    dataDevolucao: str(formData, "dataDevolucao"),
    observacoes: str(formData, "observacoes"),
  });
  redirect(r.ok ? `${detalhe(lojaId, id)}?ok=salvo` : `${detalhe(lojaId, id)}?erro=${r.motivo}`);
}

export async function cancelarContratoAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const id = str(formData, "contratoId");
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "leads", "editar"))) redirect(detalhe(lojaId, id));
  const r = await cancelarContrato(lojaId, id);
  redirect(r.ok ? `${detalhe(lojaId, id)}?ok=cancelado` : `${detalhe(lojaId, id)}?erro=${r.motivo}`);
}
