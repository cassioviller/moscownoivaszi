"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { ehAdminDaLoja, criarVendedora } from "@/lib/admin/usuarios";

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : "Erro inesperado";
}

export async function criarVendedoraAction(formData: FormData): Promise<void> {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  // Defesa em profundidade: só admin (ou super-admin) da loja ativa cadastra equipe.
  if (!(await ehAdminDaLoja(sc.usuario.id, sc.loja.id))) redirect("/");

  const nome = String(formData.get("nome") ?? "");
  const email = String(formData.get("email") ?? "");
  const senha = String(formData.get("senha") ?? "");
  try {
    await criarVendedora({ nome, email, senha, lojaId: sc.loja.id });
  } catch (e) {
    redirect(`/equipe?erro=${encodeURIComponent(mensagem(e))}`);
  }
  redirect("/equipe?ok=1");
}
