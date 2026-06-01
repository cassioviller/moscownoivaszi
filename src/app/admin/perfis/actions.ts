// src/app/admin/perfis/actions.ts
"use server";

import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { lerAcessosDoForm } from "@/lib/permissoes/modulos";
import { salvarTemplate } from "@/lib/permissoes/perfis";
import { PERFIL_ADMIN_ID } from "@/lib/admin/usuarios";
import type { MatrizFormState } from "@/components/permissoes/matriz-permissoes";

export async function salvarTemplateAction(
  _prev: MatrizFormState,
  fd: FormData,
): Promise<MatrizFormState> {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (!sessao.usuario.isSuperAdmin) redirect("/");

  const perfilId = String(fd.get("perfilId") ?? "");
  if (!perfilId || perfilId === PERFIL_ADMIN_ID) {
    return { erro: "Perfil inválido.", ok: false };
  }
  try {
    await salvarTemplate(perfilId, lerAcessosDoForm(fd));
  } catch {
    return { erro: "Não foi possível salvar.", ok: false };
  }
  return { erro: null, ok: true };
}
