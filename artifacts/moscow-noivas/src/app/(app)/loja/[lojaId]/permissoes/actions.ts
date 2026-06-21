// src/app/(app)/loja/[lojaId]/permissoes/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessaoComLoja } from "@/lib/auth";
import { ehAdminDaLoja, PERFIL_ADMIN_ID } from "@/lib/admin/usuarios";
import { lerAcessosDoForm } from "@/lib/permissoes/modulos";
import { salvarOverride, removerOverride } from "@/lib/permissoes/perfis";
import type { MatrizFormState } from "@/components/permissoes/matriz-permissoes";

async function guard() {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await ehAdminDaLoja(sc.usuario.id, sc.loja.id))) redirect(`/loja/${sc.loja.id}`);
  return sc;
}

export async function salvarOverrideAction(
  _prev: MatrizFormState,
  fd: FormData,
): Promise<MatrizFormState> {
  const sc = await guard();
  const perfilId = String(fd.get("perfilId") ?? "");
  if (!perfilId || perfilId === PERFIL_ADMIN_ID) {
    return { erro: "Perfil inválido.", ok: false };
  }
  try {
    await salvarOverride(sc.loja.id, perfilId, lerAcessosDoForm(fd));
  } catch {
    return { erro: "Não foi possível salvar.", ok: false };
  }
  revalidatePath(`/loja/${sc.loja.id}/permissoes`);
  return { erro: null, ok: true };
}

export async function restaurarPadraoAction(fd: FormData): Promise<void> {
  const sc = await guard();
  const perfilId = String(fd.get("perfilId") ?? "");
  if (perfilId && perfilId !== PERFIL_ADMIN_ID) {
    await removerOverride(sc.loja.id, perfilId);
  }
  redirect(`/loja/${sc.loja.id}/permissoes`);
}
