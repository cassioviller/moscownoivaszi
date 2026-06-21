// src/app/(app)/loja/[lojaId]/atendimentos/actions.ts
// O ato de "atender": transições de situação a partir da fila, via acaoAutorizada(leads,
// editar). Volta por query-param (?ok / ?erro). Criar/cancelar atendimento continua na
// tela Agendar.
"use server";

import { redirect } from "next/navigation";
import { iniciarAtendimento, concluirAtendimento, marcarFalta, reabrirAtendimento } from "@/lib/atendimentos/atendimentos";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso } from "@/lib/server/form";
import type { AtendimentoDesfecho } from "@/generated/prisma/client";

export const iniciarAtendimentoAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const base = `/loja/${sc.loja.id}/atendimentos`;
  const r = await iniciarAtendimento(sc.loja.id, str(formData, "id"));
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "iniciado" : r.motivo));
});

export const concluirAtendimentoAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const base = `/loja/${sc.loja.id}/atendimentos`;
  const desfecho = str(formData, "desfecho") as AtendimentoDesfecho;
  const r = await concluirAtendimento(sc.loja.id, str(formData, "id"), desfecho);
  if (!r.ok) redirect(comAviso(base, "erro", r.motivo));
  // M1 — clímax: RESERVOU encaminha a vendedora ao perfil da noiva, direto na reserva.
  if (desfecho === "RESERVOU") {
    const leadId = str(formData, "leadId");
    if (leadId) redirect(`/loja/${sc.loja.id}/noivas/${leadId}?ok=reservou_concluido#reserva`);
  }
  redirect(comAviso(base, "ok", "concluido"));
});

export const marcarFaltaAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const base = `/loja/${sc.loja.id}/atendimentos`;
  const r = await marcarFalta(sc.loja.id, str(formData, "id"));
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "falta" : r.motivo));
});

export const reabrirAtendimentoAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const base = `/loja/${sc.loja.id}/atendimentos`;
  const r = await reabrirAtendimento(sc.loja.id, str(formData, "id"));
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "reaberto" : r.motivo));
});
