// src/app/(app)/loja/[lojaId]/atendimentos/config/actions.ts
"use server";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { criarCabine, alternarCabineAtiva, salvarHorarioLoja } from "@/lib/atendimentos/cabines";

async function guard() {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "config", "editar"))) redirect(`/loja/${sc.loja.id}/atendimentos/config`);
  return sc;
}
const base = (lojaId: string) => `/loja/${lojaId}/atendimentos/config`;

export async function criarCabineAction(formData: FormData) {
  const sc = await guard();
  await criarCabine(sc.loja.id, String(formData.get("nome") ?? ""));
  redirect(`${base(sc.loja.id)}?ok=cabine`);
}
export async function alternarCabineAction(formData: FormData) {
  const sc = await guard();
  await alternarCabineAtiva(sc.loja.id, String(formData.get("cabineId") ?? ""));
  redirect(`${base(sc.loja.id)}?ok=cabine`);
}
export async function salvarHorarioAction(formData: FormData) {
  const sc = await guard();
  const r = await salvarHorarioLoja(sc.loja.id, Number(formData.get("abertura")), Number(formData.get("fechamento")));
  redirect(`${base(sc.loja.id)}?${r.ok ? "ok=horario" : "erro=intervalo_invalido"}`);
}
