// src/app/(app)/loja/[lojaId]/atendimentos/actions.ts
// O ato de "atender": transições de situação a partir da fila. Server Actions com
// <form> nativo; gate em leads:editar (mesmo dos marcos da jornada). Volta por
// query-param (?ok / ?erro). Criar/cancelar atendimento continua na tela Agendar.
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { iniciarAtendimento, concluirAtendimento, marcarFalta } from "@/lib/atendimentos/atendimentos";
import type { AtendimentoDesfecho } from "@/generated/prisma/client";

async function guard(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const base = `/loja/${sc.loja.id}/atendimentos`;
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"))) redirect(base);
  return { lojaId: sc.loja.id, base, id: String(formData.get("id") ?? "") };
}

export async function iniciarAtendimentoAction(formData: FormData) {
  const { lojaId, base, id } = await guard(formData);
  const r = await iniciarAtendimento(lojaId, id);
  redirect(r.ok ? `${base}?ok=iniciado` : `${base}?erro=${r.motivo}`);
}

export async function concluirAtendimentoAction(formData: FormData) {
  const { lojaId, base, id } = await guard(formData);
  const desfecho = String(formData.get("desfecho") ?? "") as AtendimentoDesfecho;
  const r = await concluirAtendimento(lojaId, id, desfecho);
  redirect(r.ok ? `${base}?ok=concluido` : `${base}?erro=${r.motivo}`);
}

export async function marcarFaltaAction(formData: FormData) {
  const { lojaId, base, id } = await guard(formData);
  const r = await marcarFalta(lojaId, id);
  redirect(r.ok ? `${base}?ok=falta` : `${base}?erro=${r.motivo}`);
}
