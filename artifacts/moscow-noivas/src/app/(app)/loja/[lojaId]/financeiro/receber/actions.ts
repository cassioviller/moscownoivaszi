// src/app/(app)/loja/[lojaId]/financeiro/receber/actions.ts
// Contas a receber — Server Actions. Gate via acaoAutorizada(financeiro, editar); o corpo
// recebe ctx + FormData e cuida do redirect de resultado. Volta por ?ok/?erro; o campo
// `voltar` guarda de onde veio (carteira ou detalhe do contrato).
"use server";

import { redirect } from "next/navigation";
import {
  gerarPlanoDePagamento,
  adicionarParcela,
  removerParcela,
  registrarRecebimento,
  estornarRecebimento,
} from "@/lib/financeiro/receber";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso, destino } from "@/lib/server/form";

export const gerarPlanoAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const contratoId = str(formData, "contratoId");
  const volta = `/loja/${lojaId}/contratos/${contratoId}`;
  const r = await gerarPlanoDePagamento(lojaId, contratoId, {
    entrada: str(formData, "entrada"),
    numParcelas: Number(str(formData, "numParcelas") || "1"),
    primeiroVencimento: str(formData, "primeiroVencimento"),
    periodicidadeDias: Number(str(formData, "periodicidadeDias") || "30"),
  });
  redirect(comAviso(volta, r.ok ? "ok" : "erro", r.ok ? "plano" : r.motivo));
});

export const adicionarParcelaAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const contratoId = str(formData, "contratoId");
  const volta = `/loja/${lojaId}/contratos/${contratoId}`;
  const r = await adicionarParcela(lojaId, contratoId, {
    descricao: str(formData, "descricao"),
    valorPrevisto: str(formData, "valorPrevisto"),
    vencimento: str(formData, "vencimento"),
  });
  redirect(comAviso(volta, r.ok ? "ok" : "erro", r.ok ? "parcela" : r.motivo));
});

export const removerParcelaAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const volta = `/loja/${lojaId}/contratos/${str(formData, "contratoId")}`;
  const r = await removerParcela(lojaId, str(formData, "parcelaId"));
  redirect(comAviso(volta, r.ok ? "ok" : "erro", r.ok ? "parcela_removida" : r.motivo));
});

export const registrarRecebimentoAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const volta = destino(formData, lojaId, `/loja/${lojaId}/financeiro/receber`);
  const r = await registrarRecebimento(lojaId, str(formData, "parcelaId"), {
    valor: str(formData, "valor"),
    data: str(formData, "data"),
    forma: str(formData, "forma"),
  });
  redirect(comAviso(volta, r.ok ? "ok" : "erro", r.ok ? "recebido" : r.motivo));
});

export const estornarRecebimentoAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const volta = destino(formData, lojaId, `/loja/${lojaId}/financeiro/receber`);
  const r = await estornarRecebimento(lojaId, str(formData, "parcelaId"));
  redirect(comAviso(volta, r.ok ? "ok" : "erro", r.ok ? "estornado" : r.motivo));
});
