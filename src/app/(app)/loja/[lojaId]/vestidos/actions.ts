// src/app/(app)/loja/[lojaId]/vestidos/actions.ts
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { criarVestido, editarVestido, type NovoVestido } from "@/lib/vestidos/vestidos";

export type VestidoFormState = { erro: string | null };

function extrair(formData: FormData): NovoVestido {
  return {
    codigo: String(formData.get("codigo") ?? ""),
    nome: String(formData.get("nome") ?? ""),
    precoBase: String(formData.get("precoBase") ?? ""),
    tamanho: String(formData.get("tamanho") ?? ""),
    cor: String(formData.get("cor") ?? ""),
    categoria: String(formData.get("categoria") ?? ""),
    observacoes: String(formData.get("observacoes") ?? ""),
  };
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : "Erro inesperado";
}

export async function criarVestidoAction(
  _prev: VestidoFormState,
  formData: FormData,
): Promise<VestidoFormState> {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "criar"))) {
    redirect(`/loja/${sc.loja.id}/vestidos`);
  }
  try {
    await criarVestido(sc.loja.id, extrair(formData));
  } catch (e) {
    return { erro: mensagem(e) };
  }
  redirect(`/loja/${sc.loja.id}/vestidos?ok=1`);
}

export async function editarVestidoAction(
  _prev: VestidoFormState,
  formData: FormData,
): Promise<VestidoFormState> {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) {
    redirect(`/loja/${sc.loja.id}/vestidos`);
  }
  const vestidoId = String(formData.get("vestidoId") ?? "");
  try {
    await editarVestido(sc.loja.id, vestidoId, extrair(formData));
  } catch (e) {
    return { erro: mensagem(e) };
  }
  redirect(`/loja/${sc.loja.id}/vestidos?ok=1`);
}
