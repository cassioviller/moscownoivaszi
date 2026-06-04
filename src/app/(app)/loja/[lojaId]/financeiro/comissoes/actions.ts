// src/app/(app)/loja/[lojaId]/financeiro/comissoes/actions.ts
// Comissão — Server Actions (S6 fatia 6). Ver = financeiro:ver; mutar = financeiro:editar.
// Fechar mês é idempotente (o motor recusa competência corrente/futura e não duplica).
// Regras: definir substitui as faixas da vigência; remover apaga a regra (cascade nas faixas).
"use server";

import { redirect } from "next/navigation";
import { definirRegra, removerRegra, fecharCompetencia, type FaixaInput } from "@/lib/financeiro/comissao";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso, destino } from "@/lib/server/form";

export const fecharCompetenciaAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const volta = destino(formData, lojaId, `/loja/${lojaId}/financeiro/comissoes`);
  const r = await fecharCompetencia(lojaId, str(formData, "competencia"));
  redirect(comAviso(volta, r.ok ? "ok" : "erro", r.ok ? `fechado_${r.fechadas}` : r.motivo));
});

export const definirRegraAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const volta = destino(formData, lojaId, `/loja/${lojaId}/financeiro/comissoes/regras`);

  // Faixas vêm como colunas paralelas (getAll); linhas com tudo vazio são ignoradas.
  const mins = formData.getAll("min").map(String);
  const maxs = formData.getAll("max").map(String);
  const pcts = formData.getAll("percentual").map(String);
  const bonus = formData.getAll("bonus").map(String);
  const faixas: FaixaInput[] = [];
  for (let i = 0; i < mins.length; i++) {
    const min = (mins[i] ?? "").trim();
    const max = (maxs[i] ?? "").trim();
    const pct = (pcts[i] ?? "").trim();
    const bon = (bonus[i] ?? "").trim();
    if (!min && !max && !pct && !bon) continue; // linha vazia
    faixas.push({
      minAcumulado: min || "0",
      maxAcumulado: max === "" ? null : max,
      percentual: pct === "" ? null : pct,
      bonusFixo: bon === "" ? null : bon,
    });
  }

  const r = await definirRegra(lojaId, str(formData, "vendedoraId"), {
    vigenciaInicio: str(formData, "vigenciaInicio") || undefined,
    bonusAcumulaFaixas: str(formData, "bonusAcumulaFaixas") === "on",
    faixas,
  });
  redirect(comAviso(volta, r.ok ? "ok" : "erro", r.ok ? "regra" : r.motivo));
});

export const removerRegraAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const volta = destino(formData, lojaId, `/loja/${lojaId}/financeiro/comissoes/regras`);
  await removerRegra(lojaId, str(formData, "regraId"));
  redirect(comAviso(volta, "ok", "regra_removida"));
});
