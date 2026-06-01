// src/app/(app)/loja/[lojaId]/vestidos/[vestidoId]/reserva-actions.ts
// Reservar/cancelar a partir do detalhe do VESTIDO. A data do casamento vem da
// noiva escolhida (não se digita aqui) — uma reserva é sempre "esta peça para o
// casamento desta noiva". Feedback por query-param (?ok / ?erro), sem client component.
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterLead } from "@/lib/leads/leads";
import { reservarVestido, cancelarReserva } from "@/lib/disponibilidade/reservas";

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
  redirect(r.ok ? `${base}?ok=reserva` : `${base}?erro=${r.motivo}`);
}

export async function cancelarReservaPeloVestidoAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const vestidoId = String(formData.get("vestidoId") ?? "");
  const bloqueioId = String(formData.get("bloqueioId") ?? "");
  const base = `/loja/${sc.loja.id}/vestidos/${vestidoId}`;

  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(base);

  await cancelarReserva(sc.loja.id, bloqueioId);
  redirect(`${base}?ok=cancelada`);
}
