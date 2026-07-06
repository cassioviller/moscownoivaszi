// src/app/(app)/loja/[lojaId]/calendario/actions.ts
// Ações da aba Provas & ajustes: ciclo da prova (iniciar/falta/concluir) e
// cadastro/toggle de ajustes. Redirecionam de volta para a aba.
"use server";
import { redirect } from "next/navigation";
import { iniciarAtendimento, marcarFalta, concluirProva } from "@/lib/atendimentos/atendimentos";
import { adicionarAjuste, alternarStatusAjuste } from "@/lib/atelier/ajustes";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso } from "@/lib/server/form";

const baseAba = (lojaId: string) => `/loja/${lojaId}/calendario?aba=provas-ajustes`;

export const iniciarProvaAction = acaoAutorizada("leads", "editar", async (sc, fd) => {
  const r = await iniciarAtendimento(sc.loja.id, str(fd, "id"));
  redirect(comAviso(baseAba(sc.loja.id), r.ok ? "ok" : "erro", r.ok ? "iniciado" : r.motivo));
});
export const faltaProvaAction = acaoAutorizada("leads", "editar", async (sc, fd) => {
  const r = await marcarFalta(sc.loja.id, str(fd, "id"));
  redirect(comAviso(baseAba(sc.loja.id), r.ok ? "ok" : "erro", r.ok ? "falta" : r.motivo));
});
export const concluirProvaAction = acaoAutorizada("leads", "editar", async (sc, fd) => {
  const r = await concluirProva(sc.loja.id, str(fd, "id"));
  redirect(comAviso(baseAba(sc.loja.id), r.ok ? "ok" : "erro", r.ok ? "concluido" : r.motivo));
});
export const adicionarAjusteProvaAction = acaoAutorizada("ajustes", "criar", async (sc, fd) => {
  const r = await adicionarAjuste(sc.loja.id, { atendimentoId: str(fd, "id"), descricao: str(fd, "descricao") });
  redirect(comAviso(baseAba(sc.loja.id), r.ok ? "ok" : "erro", r.ok ? "ajuste" : r.motivo));
});
export const alternarAjusteProvaAction = acaoAutorizada("ajustes", "editar", async (sc, fd) => {
  const r = await alternarStatusAjuste(sc.loja.id, str(fd, "ajusteId"));
  redirect(comAviso(baseAba(sc.loja.id), r.ok ? "ok" : "erro", r.ok ? "ajuste" : r.motivo));
});
