"use server";

import { redirect } from "next/navigation";
import { getSessao, definirLojaAtiva } from "@/lib/auth";

/**
 * Define a loja ativa da sessão a partir do form. Valida o vínculo via
 * `definirLojaAtiva` (que lança se o user não tem acesso) — `lojaId` forjado
 * cai em `/selecionar-loja?erro=acesso`, não 500.
 */
export async function selecionarLojaAction(formData: FormData): Promise<void> {
  const lojaId = String(formData.get("lojaId") ?? "");

  const sessao = await getSessao();
  if (!sessao) redirect("/login");

  try {
    await definirLojaAtiva(sessao.sessao.id, lojaId, sessao.usuario.id);
  } catch {
    // Acesso negado (ou lojaId inválido): volta pro seletor com aviso, sem vazar erro.
    redirect("/selecionar-loja?erro=acesso");
  }

  redirect("/");
}
