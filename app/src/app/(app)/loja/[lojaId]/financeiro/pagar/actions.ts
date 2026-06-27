// src/app/(app)/loja/[lojaId]/financeiro/pagar/actions.ts
// Contas a pagar — Server Actions via acaoAutorizada(financeiro, editar). Volta por ?ok/?erro.
// O pagamento quita N contas (cruzamento) lendo arrays de contaPagarId/valor do form.
"use server";

import { redirect } from "next/navigation";
import {
  lancarConta,
  removerConta,
  definirSalarioRecorrente,
  removerSalarioRecorrente,
  gerarFolhaDoMes,
  registrarPagamento,
  estornarPagamento,
  marcarEnviadoContabilidade,
} from "@/lib/financeiro/pagar";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso, destino } from "@/lib/server/form";
import type { ContaPagarTipo } from "@/generated/prisma/client";

export const lancarDespesaAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const base = `/loja/${sc.loja.id}/financeiro/pagar`;
  const r = await lancarConta(sc.loja.id, {
    tipo: (str(formData, "tipo") || "DESPESA") as ContaPagarTipo,
    descricao: str(formData, "descricao"),
    categoria: str(formData, "categoria"),
    fornecedor: str(formData, "fornecedor"),
    valorPrevisto: str(formData, "valorPrevisto"),
    vencimento: str(formData, "vencimento"),
  });
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "conta" : r.motivo));
});

export const removerContaAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const base = `/loja/${sc.loja.id}/financeiro/pagar`;
  const r = await removerConta(sc.loja.id, str(formData, "contaId"));
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "conta_removida" : r.motivo));
});

export const pagarContasAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const base = destino(formData, sc.loja.id, `/loja/${sc.loja.id}/financeiro/pagar`);
  const contaIds = formData.getAll("contaPagarId").map(String);
  const valores = formData.getAll("valor").map(String);
  const itens = contaIds.map((id, i) => ({ contaPagarId: id, valor: valores[i] ?? "" }));
  const r = await registrarPagamento(sc.loja.id, {
    colaboradorId: str(formData, "colaboradorId") || null,
    data: str(formData, "data"),
    forma: str(formData, "forma"),
    itens,
  });
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "pago" : r.motivo));
});

export const estornarPagamentoAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const base = destino(formData, sc.loja.id, `/loja/${sc.loja.id}/financeiro/pagar`);
  const r = await estornarPagamento(sc.loja.id, str(formData, "pagamentoId"));
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "estornado" : r.motivo));
});

export const enviarContabilidadeAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  // `voltar` preserva competência+colaborador da folha (e evita concatenar querystring crua).
  const base = destino(formData, sc.loja.id, `/loja/${sc.loja.id}/financeiro/pagar/folha`);
  const enviado = str(formData, "enviado") === "1";
  const r = await marcarEnviadoContabilidade(sc.loja.id, str(formData, "pagamentoId"), enviado);
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? (enviado ? "enviado_contabilidade" : "desfeito_contabilidade") : r.motivo));
});

// — Folha / recorrência —

export const gerarFolhaAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const base = `/loja/${sc.loja.id}/financeiro/pagar/folha`;
  const r = await gerarFolhaDoMes(sc.loja.id, str(formData, "competencia"));
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? `folha_${r.geradas}` : r.motivo));
});

export const definirSalarioAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const base = `/loja/${sc.loja.id}/financeiro/pagar/folha`;
  const r = await definirSalarioRecorrente(sc.loja.id, str(formData, "colaboradorId"), {
    valorBase: str(formData, "valorBase"),
    diaVencimento: Number(str(formData, "diaVencimento") || "5"),
  });
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "salario" : r.motivo));
});

export const removerSalarioAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const base = `/loja/${sc.loja.id}/financeiro/pagar/folha`;
  const r = await removerSalarioRecorrente(sc.loja.id, str(formData, "id"));
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "salario_removido" : r.motivo));
});
