// src/app/(app)/loja/[lojaId]/vestidos/fotos-actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { removerFoto, salvarFoto } from "@/lib/vestidos/fotos";

function ordemDe(formData: FormData): number {
  return Number(formData.get("ordem")) === 1 ? 1 : 0;
}

async function exigirEdicao() {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) {
    redirect(`/loja/${sc.loja.id}/vestidos`);
  }
  return sc;
}

export async function subirFotoAction(formData: FormData): Promise<void> {
  const sc = await exigirEdicao();
  const vestidoId = String(formData.get("vestidoId") ?? "");
  const ordem = ordemDe(formData);
  const destino = `/loja/${sc.loja.id}/vestidos/${vestidoId}/editar`;

  const file = formData.get("foto");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${destino}?fotoErro=${encodeURIComponent("Selecione uma imagem")}`);
  }

  try {
    const buf = Buffer.from(await (file as File).arrayBuffer());
    await salvarFoto(sc.loja.id, vestidoId, ordem, buf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não foi possível salvar a foto";
    redirect(`${destino}?fotoErro=${encodeURIComponent(msg)}`);
  }
  revalidatePath(destino);
  redirect(`${destino}?fotoOk=1`);
}

export async function removerFotoAction(formData: FormData): Promise<void> {
  const sc = await exigirEdicao();
  const vestidoId = String(formData.get("vestidoId") ?? "");
  const ordem = ordemDe(formData);
  const destino = `/loja/${sc.loja.id}/vestidos/${vestidoId}/editar`;
  await removerFoto(sc.loja.id, vestidoId, ordem);
  revalidatePath(destino);
  redirect(destino);
}
