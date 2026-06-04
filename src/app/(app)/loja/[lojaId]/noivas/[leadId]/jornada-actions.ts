// src/app/(app)/loja/[lojaId]/noivas/[leadId]/jornada-actions.ts
// Marcos manuais da jornada (perdida) via acaoAutorizada(leads, editar); volta por query-param.
"use server";

import { redirect } from "next/navigation";
import { definirMarcoJornada } from "@/lib/leads/leads";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso } from "@/lib/server/form";

// marcarOrcamentoAbertoAction (S2) e marcarContratoFechadoAction (S3) foram aposentadas:
// os estágios "orçamento aberto" e "contrato fechado" agora derivam de um Orcamento /
// Contrato reais. Os marcos `orcamentoAbertoEm`/`contratoFechadoEm` permanecem no
// schema/jornada como compatibilidade (noivas antigas), só não há mais botão manual.
export const marcarPerdidaAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const leadId = str(formData, "leadId");
  const ligar = str(formData, "ligar") === "1";
  await definirMarcoJornada(sc.loja.id, leadId, "perdidaEm", ligar);
  redirect(comAviso(`/loja/${sc.loja.id}/noivas/${leadId}`, "ok", "jornada"));
});
