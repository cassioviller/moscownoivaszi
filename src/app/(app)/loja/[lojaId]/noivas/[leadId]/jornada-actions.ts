// src/app/(app)/loja/[lojaId]/noivas/[leadId]/jornada-actions.ts
// Marcos manuais da jornada (orçamento/contrato/perdida). Server Actions com <form>
// nativo; revalida sessão + leads:editar; volta por query-param.
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { definirMarcoJornada, type MarcoJornada } from "@/lib/leads/leads";

async function marco(formData: FormData, campo: MarcoJornada) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const leadId = String(formData.get("leadId") ?? "");
  const base = `/loja/${sc.loja.id}/noivas/${leadId}`;
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"))) redirect(base);
  const ligar = String(formData.get("ligar") ?? "") === "1";
  await definirMarcoJornada(sc.loja.id, leadId, campo, ligar);
  redirect(`${base}?ok=jornada`);
}

// marcarOrcamentoAbertoAction foi aposentada na S2: o estágio "orçamento aberto" agora
// deriva de um Orcamento real (ver orcamentos). O marco `orcamentoAbertoEm` permanece no
// schema/jornada como compatibilidade (noivas antigas), só não há mais botão manual.
export async function marcarContratoFechadoAction(formData: FormData) {
  return marco(formData, "contratoFechadoEm");
}
export async function marcarPerdidaAction(formData: FormData) {
  return marco(formData, "perdidaEm");
}
