// src/app/(app)/loja/[lojaId]/financeiro/cobranca/actions.ts
// Cobrança — Server Action. Gate financeiro:editar. Registra uma cobrança feita a uma noiva
// e volta por ?ok/?erro para a tela de cobrança.
"use server";

import { redirect } from "next/navigation";
import { registrarCobranca } from "@/lib/financeiro/cobranca";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso } from "@/lib/server/form";

export const registrarCobrancaAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const volta = `/loja/${lojaId}/financeiro/cobranca`;
  const r = await registrarCobranca(lojaId, {
    leadId: str(formData, "leadId"),
    canal: str(formData, "canal"),
    observacao: str(formData, "observacao"),
  });
  redirect(comAviso(volta, r.ok ? "ok" : "erro", r.ok ? "cobranca_registrada" : r.motivo));
});
