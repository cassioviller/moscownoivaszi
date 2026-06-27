// src/app/(app)/loja/[lojaId]/financeiro/projecao/actions.ts
// Projeção de caixa — Server Action. Gate financeiro:editar. Registra a âncora de saldo
// e volta por ?ok/?erro para a própria tela de projeção.
"use server";

import { redirect } from "next/navigation";
import { definirSaldoReferencia } from "@/lib/financeiro/saldo-referencia";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso } from "@/lib/server/form";

export const definirSaldoReferenciaAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const volta = `/loja/${lojaId}/financeiro/projecao`;
  const r = await definirSaldoReferencia(lojaId, {
    data: str(formData, "data"),
    valor: str(formData, "valor"),
  });
  redirect(comAviso(volta, r.ok ? "ok" : "erro", r.ok ? "saldo_definido" : r.motivo));
});
