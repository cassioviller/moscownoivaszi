// src/app/(app)/loja/[lojaId]/atendimentos/novo/actions.ts
"use server";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { gradeDoDia, agendarAtendimento, cancelarAtendimento } from "@/lib/atendimentos/atendimentos";
import type { Slot } from "@/lib/atendimentos/slots";

// Server action chamada pelo client p/ buscar a grade do dia (não é form action).
export async function gradeDoDiaAction(input: { dataYMD: string; cabineId: string; vendedoraId: string }): Promise<Slot[]> {
  const sc = await getSessaoComLoja();
  if (!sc) return [];
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"))) return [];
  if (!input.dataYMD || !input.cabineId || !input.vendedoraId) return [];
  return gradeDoDia(sc.loja.id, input);
}

export type AgendarState = { erro: string | null };
const MOTIVOS: Record<string, string> = {
  lead_invalido: "Escolha a noiva.",
  cabine_invalida: "Escolha uma cabine ativa.",
  vendedora_invalida: "Escolha uma vendedora da equipe.",
  sem_horario: "Escolha um horário livre.",
  fora_funcionamento: "Horário fora do funcionamento da loja.",
  indisponivel: "Esse horário acabou de ser ocupado. Escolha outro.",
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
  });
  if (r.ok) redirect(`/loja/${sc.loja.id}/atendimentos/novo?ok=1`);
  return { erro: MOTIVOS[r.motivo] ?? "Não foi possível agendar." };
}

export async function cancelarAtendimentoAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "criar"))) redirect(`/loja/${sc.loja.id}/atendimentos/novo`);
  await cancelarAtendimento(sc.loja.id, String(formData.get("atendimentoId") ?? ""));
  redirect(`/loja/${sc.loja.id}/atendimentos/novo?ok=cancelado`);
}
