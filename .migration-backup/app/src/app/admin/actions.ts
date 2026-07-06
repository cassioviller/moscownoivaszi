"use server";

import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { criarLoja, criarAdmin } from "@/lib/admin/usuarios";

// Defesa em profundidade: toda action revalida o papel server-side (não confia na UI).
async function exigirSuperAdmin() {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (!sessao.usuario.isSuperAdmin) redirect("/");
  return sessao;
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : "Erro inesperado";
}

export async function criarLojaAction(formData: FormData): Promise<void> {
  await exigirSuperAdmin();
  const nome = String(formData.get("nome") ?? "");
  try {
    await criarLoja(nome);
  } catch (e) {
    redirect(`/admin?erro=${encodeURIComponent(mensagem(e))}`);
  }
  redirect("/admin?ok=loja");
}

export async function criarAdminAction(formData: FormData): Promise<void> {
  await exigirSuperAdmin();
  const nome = String(formData.get("nome") ?? "");
  const email = String(formData.get("email") ?? "");
  const senha = String(formData.get("senha") ?? "");
  const lojaIds = formData.getAll("lojaIds").map(String);
  try {
    await criarAdmin({ nome, email, senha, lojaIds });
  } catch (e) {
    redirect(`/admin?erro=${encodeURIComponent(mensagem(e))}`);
  }
  redirect("/admin?ok=admin");
}
