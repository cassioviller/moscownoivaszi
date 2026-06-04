// src/app/(app)/loja/[lojaId]/ajustes/actions.ts
// Fila global da costureira: marcar um ajuste como feito (sai da fila), via
// acaoAutorizada(ajustes, editar). Volta por query-param.
"use server";

import { redirect } from "next/navigation";
import { alternarStatusAjuste } from "@/lib/atelier/ajustes";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso } from "@/lib/server/form";

export const marcarFeitoAction = acaoAutorizada("ajustes", "editar", async (sc, formData) => {
  await alternarStatusAjuste(sc.loja.id, str(formData, "ajusteId"));
  redirect(comAviso(`/loja/${sc.loja.id}/ajustes`, "ok", "feito"));
});
