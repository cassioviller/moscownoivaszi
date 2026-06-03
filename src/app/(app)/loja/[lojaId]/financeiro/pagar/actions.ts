// src/app/(app)/loja/[lojaId]/financeiro/pagar/actions.ts
// Contas a pagar — Server Actions. Ver = financeiro:ver; mutar = financeiro:editar.
// Volta por ?ok/?erro. O pagamento quita N contas (cruzamento) lendo arrays de
// contaPagarId/valor do form.
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
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
import { caminhoInternoSeguro } from "@/lib/url-interna";
import type { ContaPagarTipo } from "@/generated/prisma/client";

async function guard() {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  return sc;
}
function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}
function aviso(base: string, chave: "ok" | "erro", valor: string): string {
  return `${base}${base.includes("?") ? "&" : "?"}${chave}=${valor}`;
}

export async function lancarDespesaAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const base = `/loja/${lojaId}/financeiro/pagar`;
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "financeiro", "editar"))) redirect(base);
  const r = await lancarConta(lojaId, {
    tipo: (str(formData, "tipo") || "DESPESA") as ContaPagarTipo,
    descricao: str(formData, "descricao"),
    categoria: str(formData, "categoria"),
    fornecedor: str(formData, "fornecedor"),
    valorPrevisto: str(formData, "valorPrevisto"),
    vencimento: str(formData, "vencimento"),
  });
  redirect(aviso(base, r.ok ? "ok" : "erro", r.ok ? "conta" : r.motivo));
}

export async function removerContaAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const base = `/loja/${lojaId}/financeiro/pagar`;
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "financeiro", "editar"))) redirect(base);
  const r = await removerConta(lojaId, str(formData, "contaId"));
  redirect(aviso(base, r.ok ? "ok" : "erro", r.ok ? "conta_removida" : r.motivo));
}

export async function pagarContasAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const base = caminhoInternoSeguro(str(formData, "voltar"), lojaId, `/loja/${lojaId}/financeiro/pagar`);
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "financeiro", "editar"))) redirect(base);
  const contaIds = formData.getAll("contaPagarId").map(String);
  const valores = formData.getAll("valor").map(String);
  const itens = contaIds.map((id, i) => ({ contaPagarId: id, valor: valores[i] ?? "" }));
  const r = await registrarPagamento(lojaId, {
    colaboradorId: str(formData, "colaboradorId") || null,
    data: str(formData, "data"),
    forma: str(formData, "forma"),
    itens,
  });
  redirect(aviso(base, r.ok ? "ok" : "erro", r.ok ? "pago" : r.motivo));
}

export async function estornarPagamentoAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const base = caminhoInternoSeguro(str(formData, "voltar"), lojaId, `/loja/${lojaId}/financeiro/pagar`);
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "financeiro", "editar"))) redirect(base);
  const r = await estornarPagamento(lojaId, str(formData, "pagamentoId"));
  redirect(aviso(base, r.ok ? "ok" : "erro", r.ok ? "estornado" : r.motivo));
}

export async function enviarContabilidadeAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  // `voltar` preserva competência+colaborador da folha (e evita concatenar querystring crua).
  const base = caminhoInternoSeguro(str(formData, "voltar"), lojaId, `/loja/${lojaId}/financeiro/pagar/folha`);
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "financeiro", "editar"))) redirect(base);
  const enviado = str(formData, "enviado") === "1";
  const r = await marcarEnviadoContabilidade(lojaId, str(formData, "pagamentoId"), enviado);
  redirect(aviso(base, r.ok ? "ok" : "erro", r.ok ? (enviado ? "enviado_contabilidade" : "desfeito_contabilidade") : r.motivo));
}

// — Folha / recorrência —

export async function gerarFolhaAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const base = `/loja/${lojaId}/financeiro/pagar/folha`;
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "financeiro", "editar"))) redirect(base);
  const r = await gerarFolhaDoMes(lojaId, str(formData, "competencia"));
  redirect(aviso(base, r.ok ? "ok" : "erro", r.ok ? `folha_${r.geradas}` : r.motivo));
}

export async function definirSalarioAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const base = `/loja/${lojaId}/financeiro/pagar/folha`;
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "financeiro", "editar"))) redirect(base);
  const r = await definirSalarioRecorrente(lojaId, str(formData, "colaboradorId"), {
    valorBase: str(formData, "valorBase"),
    diaVencimento: Number(str(formData, "diaVencimento") || "5"),
  });
  redirect(aviso(base, r.ok ? "ok" : "erro", r.ok ? "salario" : r.motivo));
}

export async function removerSalarioAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const base = `/loja/${lojaId}/financeiro/pagar/folha`;
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "financeiro", "editar"))) redirect(base);
  const r = await removerSalarioRecorrente(lojaId, str(formData, "id"));
  redirect(aviso(base, r.ok ? "ok" : "erro", r.ok ? "salario_removido" : r.motivo));
}
