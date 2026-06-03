// src/app/(app)/loja/[lojaId]/financeiro/receber/actions.ts
// Contas a receber — Server Actions. Ver = leads:ver; mutar = leads:editar (gate
// provisório do Financeiro, até um módulo dedicado). Volta por ?ok/?erro; o campo
// `voltar` guarda de onde veio (carteira ou detalhe do contrato).
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import {
  gerarPlanoDePagamento,
  adicionarParcela,
  removerParcela,
  registrarRecebimento,
  estornarRecebimento,
} from "@/lib/financeiro/receber";
import { caminhoInternoSeguro } from "@/lib/url-interna";

async function guard() {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  return sc;
}
function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}
function destino(fd: FormData, lojaId: string, fallback: string): string {
  return caminhoInternoSeguro(str(fd, "voltar"), lojaId, fallback);
}
function comAviso(base: string, chave: "ok" | "erro", valor: string): string {
  return `${base}${base.includes("?") ? "&" : "?"}${chave}=${valor}`;
}

export async function gerarPlanoAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const contratoId = str(formData, "contratoId");
  const volta = `/loja/${lojaId}/contratos/${contratoId}`;
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "leads", "editar"))) redirect(volta);
  const r = await gerarPlanoDePagamento(lojaId, contratoId, {
    entrada: str(formData, "entrada"),
    numParcelas: Number(str(formData, "numParcelas") || "1"),
    primeiroVencimento: str(formData, "primeiroVencimento"),
    periodicidadeDias: Number(str(formData, "periodicidadeDias") || "30"),
  });
  redirect(comAviso(volta, r.ok ? "ok" : "erro", r.ok ? "plano" : r.motivo));
}

export async function adicionarParcelaAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const contratoId = str(formData, "contratoId");
  const volta = `/loja/${lojaId}/contratos/${contratoId}`;
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "leads", "editar"))) redirect(volta);
  const r = await adicionarParcela(lojaId, contratoId, {
    descricao: str(formData, "descricao"),
    valorPrevisto: str(formData, "valorPrevisto"),
    vencimento: str(formData, "vencimento"),
  });
  redirect(comAviso(volta, r.ok ? "ok" : "erro", r.ok ? "parcela" : r.motivo));
}

export async function removerParcelaAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const volta = `/loja/${lojaId}/contratos/${str(formData, "contratoId")}`;
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "leads", "editar"))) redirect(volta);
  await removerParcela(lojaId, str(formData, "parcelaId"));
  redirect(comAviso(volta, "ok", "parcela_removida"));
}

export async function registrarRecebimentoAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const volta = destino(formData, lojaId, `/loja/${lojaId}/financeiro/receber`);
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "leads", "editar"))) redirect(volta);
  const r = await registrarRecebimento(lojaId, str(formData, "parcelaId"), {
    valor: str(formData, "valor"),
    data: str(formData, "data"),
    forma: str(formData, "forma"),
  });
  redirect(comAviso(volta, r.ok ? "ok" : "erro", r.ok ? "recebido" : r.motivo));
}

export async function estornarRecebimentoAction(formData: FormData) {
  const sc = await guard();
  const lojaId = sc.loja.id;
  const volta = destino(formData, lojaId, `/loja/${lojaId}/financeiro/receber`);
  if (!(await podeNoModulo(sc.usuario.id, lojaId, "leads", "editar"))) redirect(volta);
  await estornarRecebimento(lojaId, str(formData, "parcelaId"));
  redirect(comAviso(volta, "ok", "estornado"));
}
