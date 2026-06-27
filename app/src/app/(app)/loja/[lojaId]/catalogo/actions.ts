// src/app/(app)/loja/[lojaId]/catalogo/actions.ts
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import {
  criarAtributo,
  editarAtributo,
  type EdicaoAtributo,
  type NovoAtributo,
} from "@/lib/catalogo/catalogo";

export type AtributoFormState = { erro: string | null };

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : "Erro inesperado";
}

function extrairNovo(formData: FormData): NovoAtributo {
  return {
    nome: String(formData.get("nome") ?? ""),
    tipo: String(formData.get("tipo") ?? ""),
    opcoes: String(formData.get("novasOpcoes") ?? ""),
  };
}

function extrairEdicao(formData: FormData): EdicaoAtributo {
  const ids = formData.getAll("opcaoIds").map(String);
  return {
    nome: String(formData.get("nome") ?? ""),
    tipo: String(formData.get("tipo") ?? ""),
    ativo: formData.get("ativo") === "on",
    opcoesExistentes: ids.map((id) => ({
      id,
      valor: String(formData.get(`opcao-${id}`) ?? ""),
      ativo: formData.get(`opcaoAtivo-${id}`) === "on",
    })),
    novasOpcoes: String(formData.get("novasOpcoes") ?? ""),
  };
}

export async function criarAtributoAction(
  _prev: AtributoFormState,
  formData: FormData,
): Promise<AtributoFormState> {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "config", "criar"))) {
    redirect(`/loja/${sc.loja.id}/catalogo`);
  }
  try {
    await criarAtributo(sc.loja.id, extrairNovo(formData));
  } catch (e) {
    return { erro: mensagem(e) };
  }
  redirect(`/loja/${sc.loja.id}/catalogo?ok=1`);
}

export async function editarAtributoAction(
  _prev: AtributoFormState,
  formData: FormData,
): Promise<AtributoFormState> {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "config", "editar"))) {
    redirect(`/loja/${sc.loja.id}/catalogo`);
  }
  const atributoId = String(formData.get("atributoId") ?? "");
  try {
    await editarAtributo(sc.loja.id, atributoId, extrairEdicao(formData));
  } catch (e) {
    return { erro: mensagem(e) };
  }
  redirect(`/loja/${sc.loja.id}/catalogo?ok=1`);
}
