// src/app/(app)/loja/[lojaId]/ajustes/actions.ts
// Fila global da costureira: marcar um ajuste como feito (sai da fila). Server
// Action com <form> nativo, revalida sessão + permissão (ajustes:editar) e volta
// por query-param.
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { alternarStatusAjuste } from "@/lib/atelier/ajustes";

export async function marcarFeitoAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const base = `/loja/${sc.loja.id}/ajustes`;
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "editar"))) redirect(base);

  await alternarStatusAjuste(sc.loja.id, String(formData.get("ajusteId") ?? ""));
  redirect(`${base}?ok=feito`);
}
