// src/app/(app)/loja/[lojaId]/atendimentos/novo/actions.ts
"use server";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { gradeDoDia, agendarAtendimento, cancelarAtendimento } from "@/lib/atendimentos/atendimentos";
import { listarVestidosReservadosDaNoiva, type ReservaDaNoiva } from "@/lib/disponibilidade/reservas";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso } from "@/lib/server/form";
import type { Slot } from "@/lib/atendimentos/slots";
import type { AtendimentoTipo } from "@/generated/prisma/client";

// gradeDoDiaAction (RPC, retorna Slot[]) e agendarAtendimentoAction (useActionState, retorna
// {erro}) NÃO usam acaoAutorizada: têm contrato diferente do (FormData)=>redirect do seam.

// Server action chamada pelo client p/ buscar a grade do dia (não é form action).
export async function gradeDoDiaAction(input: { dataYMD: string; cabineId: string; vendedoraId: string }): Promise<Slot[]> {
  const sc = await getSessaoComLoja();
  if (!sc) return [];
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"))) return [];
  if (!input.dataYMD || !input.cabineId || !input.vendedoraId) return [];
  return gradeDoDia(sc.loja.id, input);
}

// RPC: reservas de casamento da noiva (para o picker quando Tipo=Prova).
export async function reservasDaNoivaAction(leadId: string): Promise<ReservaDaNoiva[]> {
  const sc = await getSessaoComLoja();
  if (!sc) return [];
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"))) return [];
  if (!leadId) return [];
  return listarVestidosReservadosDaNoiva(sc.loja.id, leadId);
}

export type AgendarState = { erro: string | null };
const MOTIVOS: Record<string, string> = {
  lead_invalido: "Escolha a noiva.",
  cabine_invalida: "Escolha uma cabine ativa.",
  vendedora_invalida: "Escolha uma vendedora da equipe.",
  sem_horario: "Escolha um horário livre.",
  fora_funcionamento: "Horário fora do funcionamento da loja.",
  indisponivel: "Esse horário acabou de ser ocupado. Escolha outro.",
  tipo_invalido: "Tipo de agendamento inválido.",
  reserva_invalida: "Escolha a reserva/vestido da noiva.",
  reserva_nao_e_da_noiva: "Essa reserva não é da noiva escolhida.",
};

export async function agendarAtendimentoAction(_prev: AgendarState, formData: FormData): Promise<AgendarState> {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "criar"))) redirect(`/loja/${sc.loja.id}/atendimentos/novo`);
  const r = await agendarAtendimento(sc.loja.id, {
    leadId: String(formData.get("leadId") ?? ""),
    cabineId: String(formData.get("cabineId") ?? ""),
    vendedoraId: String(formData.get("vendedoraId") ?? ""),
    dataYMD: String(formData.get("data") ?? ""),
    hora: Number(formData.get("hora")),
    observacao: String(formData.get("observacao") ?? ""),
    tipo: (String(formData.get("tipo") ?? "ATENDIMENTO")) as AtendimentoTipo,
    bloqueioId: String(formData.get("bloqueioId") ?? "") || null,
  });
  if (r.ok) redirect(`/loja/${sc.loja.id}/atendimentos/novo?ok=1`);
  return { erro: MOTIVOS[r.motivo] ?? "Não foi possível agendar." };
}

export const cancelarAtendimentoAction = acaoAutorizada("leads", "criar", async (sc, formData) => {
  await cancelarAtendimento(sc.loja.id, str(formData, "atendimentoId"));
  redirect(comAviso(`/loja/${sc.loja.id}/atendimentos/novo`, "ok", "cancelado"));
});
