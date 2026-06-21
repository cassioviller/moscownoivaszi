// src/app/(app)/loja/[lojaId]/noivas/[leadId]/interesses/actions.ts
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { salvarInteresse, type InteresseInput } from "@/lib/leads/interesses";
import { escolhasDoForm, listarCatalogo, validarSelecoes } from "@/lib/catalogo/catalogo";

export type InteresseFormState = { erro: string | null };

async function extrair(lojaId: string, formData: FormData): Promise<InteresseInput> {
  // Volume/brilho/cauda/fenda agora vêm do catálogo (não mais campos fixos).
  const catalogo = await listarCatalogo(lojaId);
  return {
    algoAMais: String(formData.get("algoAMais") ?? ""),
    naoQuerUsar: String(formData.get("naoQuerUsar") ?? ""),
    tetoOrcamento: String(formData.get("tetoOrcamento") ?? ""),
    atributos: validarSelecoes(catalogo, escolhasDoForm(catalogo, formData)),
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
    await salvarInteresse(sc.loja.id, leadId, await extrair(sc.loja.id, formData));
  } catch (e) {
    return { erro: mensagem(e) };
  }
  redirect(`/loja/${sc.loja.id}/noivas/${leadId}/interesses?ok=1`);
}
