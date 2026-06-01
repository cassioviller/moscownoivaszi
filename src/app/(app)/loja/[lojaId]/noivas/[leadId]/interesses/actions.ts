// src/app/(app)/loja/[lojaId]/noivas/[leadId]/interesses/actions.ts
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { salvarInteresse, type InteresseInput } from "@/lib/leads/interesses";

export type InteresseFormState = { erro: string | null };

function extrair(formData: FormData): InteresseInput {
  return {
    volumeSaia: String(formData.get("volumeSaia") ?? ""),
    brilho: String(formData.get("brilho") ?? ""),
    cauda: String(formData.get("cauda") ?? ""),
    fenda: String(formData.get("fenda") ?? ""),
    algoAMais: String(formData.get("algoAMais") ?? ""),
    naoQuerUsar: String(formData.get("naoQuerUsar") ?? ""),
    tetoOrcamento: String(formData.get("tetoOrcamento") ?? ""),
  };
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : "Erro inesperado";
}

export async function salvarInteresseAction(
  _prev: InteresseFormState,
  formData: FormData,
): Promise<InteresseFormState> {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const leadId = String(formData.get("leadId") ?? "");

  // Salvar exige criar OU editar. Read-only (só "ver") nunca chega a fazer upsert.
  const [podeCriar, podeEditar] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "interesses", "criar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "interesses", "editar"),
  ]);
  if (!podeCriar && !podeEditar) {
    redirect(`/loja/${sc.loja.id}/noivas/${leadId}/interesses`);
  }

  try {
    await salvarInteresse(sc.loja.id, leadId, extrair(formData));
  } catch (e) {
    return { erro: mensagem(e) };
  }
  redirect(`/loja/${sc.loja.id}/noivas/${leadId}/interesses?ok=1`);
}
