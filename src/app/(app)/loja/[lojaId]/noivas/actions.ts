// src/app/(app)/loja/[lojaId]/noivas/actions.ts
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { criarLead, editarLead, type NovaNoiva } from "@/lib/leads/leads";

export type NoivaFormState = { erro: string | null };

function extrair(formData: FormData): NovaNoiva {
  return {
    noivaNome: String(formData.get("noivaNome") ?? ""),
    noivoNome: String(formData.get("noivoNome") ?? ""),
    whatsapp: String(formData.get("whatsapp") ?? ""),
    cerimonialista: String(formData.get("cerimonialista") ?? ""),
    casamentoData: String(formData.get("casamentoData") ?? ""),
    casamentoHorario: String(formData.get("casamentoHorario") ?? ""),
    casamentoLocal: String(formData.get("casamentoLocal") ?? ""),
    origem: String(formData.get("origem") ?? ""),
  };
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : "Erro inesperado";
}

export async function criarNoivaAction(
  _prev: NoivaFormState,
  formData: FormData,
): Promise<NoivaFormState> {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  // Permissão usa a chave do módulo "leads" (sem permissão nova "noivas").
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "criar"))) {
    redirect(`/loja/${sc.loja.id}/noivas`);
  }
  try {
    await criarLead(sc.loja.id, extrair(formData));
  } catch (e) {
    return { erro: mensagem(e) };
  }
  redirect(`/loja/${sc.loja.id}/noivas?ok=1`);
}

export async function editarNoivaAction(
  _prev: NoivaFormState,
  formData: FormData,
): Promise<NoivaFormState> {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"))) {
    redirect(`/loja/${sc.loja.id}/noivas`);
  }
  const leadId = String(formData.get("leadId") ?? "");
  try {
    // editarLead vai via tenantPrisma → lead de outra loja lança (P2025), falha fechada.
    await editarLead(sc.loja.id, leadId, extrair(formData));
  } catch (e) {
    return { erro: mensagem(e) };
  }
  redirect(`/loja/${sc.loja.id}/noivas?ok=1`);
}
