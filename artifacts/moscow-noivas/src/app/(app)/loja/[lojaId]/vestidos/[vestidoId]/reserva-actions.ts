// src/app/(app)/loja/[lojaId]/vestidos/[vestidoId]/reserva-actions.ts
// Reservar/cancelar a partir do detalhe do VESTIDO. A data do casamento vem da
// noiva escolhida (não se digita aqui) — uma reserva é sempre "esta peça para o
// casamento desta noiva". Feedback por query-param (?ok / ?erro), sem client component.
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterLead } from "@/lib/leads/leads";
import { reservarVestido, removerBloqueio, criarManutencao } from "@/lib/disponibilidade/reservas";

export async function reservarPeloVestidoAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const vestidoId = String(formData.get("vestidoId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  const base = `/loja/${sc.loja.id}/vestidos/${vestidoId}`;

  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(base);
  if (!leadId) redirect(`${base}?erro=sem_noiva`);

  // A data é a do casamento da noiva escolhida (escopada por loja em obterLead).
  const lead = await obterLead(sc.loja.id, leadId);
  if (!lead) redirect(`${base}?erro=sem_noiva`);
  if (!lead.casamentoData) redirect(`${base}?erro=sem_data`);

  const dia = lead.casamentoData.toISOString().slice(0, 10);
  const r = await reservarVestido(sc.loja.id, { vestidoId, leadId, casamentoData: dia });
  if (r.ok) redirect(`${base}?ok=reserva`);
  const em = r.conflitaComDatas?.[0];
  redirect(`${base}?erro=${r.motivo}${em ? `&em=${em}` : ""}`);
}

export async function cancelarReservaPeloVestidoAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const vestidoId = String(formData.get("vestidoId") ?? "");
  const bloqueioId = String(formData.get("bloqueioId") ?? "");
  const base = `/loja/${sc.loja.id}/vestidos/${vestidoId}`;

  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(base);

  await removerBloqueio(sc.loja.id, bloqueioId);
  redirect(`${base}?ok=cancelada`);
}

export async function enviarManutencaoAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const vestidoId = String(formData.get("vestidoId") ?? "");
  const inicio = String(formData.get("inicio") ?? "");
  const fim = String(formData.get("fim") ?? "");
  const motivo = String(formData.get("motivo") ?? "");
  const base = `/loja/${sc.loja.id}/vestidos/${vestidoId}`;

  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(base);

  const r = await criarManutencao(sc.loja.id, { vestidoId, inicio, fim: fim || null, motivo });
  redirect(r.ok ? `${base}?ok=manutencao` : `${base}?erro=${r.motivo}`);
}

export async function removerManutencaoAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const vestidoId = String(formData.get("vestidoId") ?? "");
  const bloqueioId = String(formData.get("bloqueioId") ?? "");
  const base = `/loja/${sc.loja.id}/vestidos/${vestidoId}`;

  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(base);

  await removerBloqueio(sc.loja.id, bloqueioId); // remove o bloqueio (type-agnóstico)
  redirect(`${base}?ok=manutencao_removida`);
}
