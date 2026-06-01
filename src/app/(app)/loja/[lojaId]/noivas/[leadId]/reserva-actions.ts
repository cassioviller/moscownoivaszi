// src/app/(app)/loja/[lojaId]/noivas/[leadId]/reserva-actions.ts
// Reservar/cancelar a partir do perfil da NOIVA. A data é a do casamento dela;
// escolhe-se entre os vestidos livres para essa data. Mesmo data-layer do lado do
// vestido. Feedback por query-param (?ok / ?erro), sem client component.
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterLead } from "@/lib/leads/leads";
import { reservarVestido, cancelarReserva } from "@/lib/disponibilidade/reservas";

export async function reservarPelaNoivaAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const leadId = String(formData.get("leadId") ?? "");
  const vestidoId = String(formData.get("vestidoId") ?? "");
  const base = `/loja/${sc.loja.id}/noivas/${leadId}`;

  // Reservar mexe no acervo → gate em vestidos:editar.
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(base);
  if (!vestidoId) redirect(`${base}?erro=sem_vestido`);

  const lead = await obterLead(sc.loja.id, leadId);
  if (!lead) redirect(`/loja/${sc.loja.id}/noivas`);
  if (!lead.casamentoData) redirect(`${base}?erro=sem_data`);

  const dia = lead.casamentoData.toISOString().slice(0, 10);
  const r = await reservarVestido(sc.loja.id, { vestidoId, leadId, casamentoData: dia });
  redirect(r.ok ? `${base}?ok=reserva` : `${base}?erro=${r.motivo}`);
}

export async function cancelarReservaPelaNoivaAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const leadId = String(formData.get("leadId") ?? "");
  const bloqueioId = String(formData.get("bloqueioId") ?? "");
  const base = `/loja/${sc.loja.id}/noivas/${leadId}`;

  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(base);

  await cancelarReserva(sc.loja.id, bloqueioId);
  redirect(`${base}?ok=cancelada`);
}
