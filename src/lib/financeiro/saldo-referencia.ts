// src/lib/financeiro/saldo-referencia.ts
// O ponto de partida da projeção de caixa. Histórico leve: cada registro é uma âncora
// datada; a mais recente com dataReferencia ≤ hoje é a ativa. Convenção: `valor` é o saldo
// no INÍCIO de dataReferencia, então o realizado a somar conta [dataReferencia, hoje].
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC } from "@/lib/tempo";
import { diaParaData } from "@/lib/financeiro/datas";
import { paraCentavos, deCentavos, decParaCentavos, decParaString } from "@/lib/dinheiro";
import { resumoCaixaIntervalo } from "@/lib/financeiro/fluxo";

export type Ancora = { data: Date; valor: string };

export type ResultadoSaldo = { ok: true } | { ok: false; motivo: "data_invalida" | "valor_invalido" };

/** Registra uma nova âncora de saldo. data ≤ hoje; valor ≥ 0 (entrada do usuário). */
export async function definirSaldoReferencia(lojaId: string, input: { data: string; valor: string }): Promise<ResultadoSaldo> {
  let dataRef: Date;
  try {
    dataRef = diaParaData(input.data);
  } catch {
    return { ok: false, motivo: "data_invalida" };
  }
  if (dataRef.getTime() > hojeUTC().getTime()) return { ok: false, motivo: "data_invalida" };
  let valorC: number;
  try {
    valorC = paraCentavos(input.valor);
  } catch {
    return { ok: false, motivo: "valor_invalido" };
  }
  await tenantPrisma(prisma, lojaId).saldoReferencia.create({
    data: { dataReferencia: dataRef, valor: deCentavos(valorC) } as never,
  });
  return { ok: true };
}

/** A âncora ativa: o registro mais recente com dataReferencia ≤ hoje. */
export async function ancoraAtiva(lojaId: string): Promise<Ancora | null> {
  const row = await tenantPrisma(prisma, lojaId).saldoReferencia.findFirst({
    where: { dataReferencia: { lte: hojeUTC() } },
    orderBy: { dataReferencia: "desc" },
  });
  return row ? { data: row.dataReferencia, valor: decParaString(row.valor) } : null;
}

/** Saldo de hoje = âncora + realizado [âncora, hoje]. Sem âncora → valor null. */
export async function saldoDeHoje(lojaId: string): Promise<{ valor: string | null; ancora: Ancora | null }> {
  const ancora = await ancoraAtiva(lojaId);
  if (!ancora) return { valor: null, ancora: null };
  const lt = new Date(hojeUTC().getTime());
  lt.setUTCDate(lt.getUTCDate() + 1); // inclui o dia de hoje
  const realizado = await resumoCaixaIntervalo(lojaId, { gte: ancora.data, lt });
  const valorC = decParaCentavos(ancora.valor) + decParaCentavos(realizado.saldo);
  return { valor: deCentavos(valorC), ancora };
}
