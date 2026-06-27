// src/app/(app)/loja/[lojaId]/atendimentos/config/actions.ts
// Config de atendimentos (cabines + horário da loja) via acaoAutorizada(config, editar).
"use server";
import { redirect } from "next/navigation";
import { criarCabine, alternarCabineAtiva, salvarHorarioLoja } from "@/lib/atendimentos/cabines";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso } from "@/lib/server/form";

const base = (lojaId: string) => `/loja/${lojaId}/atendimentos/config`;

export const criarCabineAction = acaoAutorizada("config", "editar", async (sc, formData) => {
  await criarCabine(sc.loja.id, str(formData, "nome"));
  redirect(comAviso(base(sc.loja.id), "ok", "cabine"));
});

export const alternarCabineAction = acaoAutorizada("config", "editar", async (sc, formData) => {
  await alternarCabineAtiva(sc.loja.id, str(formData, "cabineId"));
  redirect(comAviso(base(sc.loja.id), "ok", "cabine"));
});

export const salvarHorarioAction = acaoAutorizada("config", "editar", async (sc, formData) => {
  const r = await salvarHorarioLoja(sc.loja.id, Number(formData.get("abertura")), Number(formData.get("fechamento")));
  redirect(comAviso(base(sc.loja.id), r.ok ? "ok" : "erro", r.ok ? "horario" : "intervalo_invalido"));
});
