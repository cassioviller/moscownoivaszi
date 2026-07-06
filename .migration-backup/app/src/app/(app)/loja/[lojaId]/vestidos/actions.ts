// src/app/(app)/loja/[lojaId]/vestidos/actions.ts
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { criarVestido, editarVestido, type NovoVestido } from "@/lib/vestidos/vestidos";
import { escolhasDoForm, listarCatalogo, validarSelecoes } from "@/lib/catalogo/catalogo";

export type VestidoFormState = { erro: string | null };

async function extrair(lojaId: string, formData: FormData): Promise<NovoVestido> {
  const catalogo = await listarCatalogo(lojaId);
  return {
    codigo: String(formData.get("codigo") ?? ""),
    nome: String(formData.get("nome") ?? ""),
    precoBase: String(formData.get("precoBase") ?? ""),
    tamanho: String(formData.get("tamanho") ?? ""),
    cor: String(formData.get("cor") ?? ""),
    categoria: String(formData.get("categoria") ?? ""),
    observacoes: String(formData.get("observacoes") ?? ""),
    atributos: validarSelecoes(catalogo, escolhasDoForm(catalogo, formData)),
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
    await criarVestido(sc.loja.id, await extrair(sc.loja.id, formData));
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
    await editarVestido(sc.loja.id, vestidoId, await extrair(sc.loja.id, formData));
  } catch (e) {
    return { erro: mensagem(e) };
  }
  redirect(`/loja/${sc.loja.id}/vestidos?ok=1`);
}
