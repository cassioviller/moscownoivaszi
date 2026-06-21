// src/lib/financeiro/intervalo.ts
// Lente de visualização por intervalo de datas no financeiro. Lê ?ini=&fim= da URL,
// com default no 1º e último dia do mês atual (em SP). Datas à meia-noite UTC
// (convenção do módulo). O fim é INCLUSIVO; para queries Prisma use { gte, lt },
// com lt = fim + 1 dia (o primeiro instante já fora do intervalo).
import { hojeYMD, meiaNoiteUTC } from "@/lib/tempo";
import { diaValido } from "@/lib/disponibilidade/datas";

/** "YYYY-MM-DD" do primeiro dia do mês de um dia de referência. */
export function primeiroDiaDoMes(refYMD: string): string {
  return `${refYMD.slice(0, 7)}-01`;
}

/** "YYYY-MM-DD" do último dia do mês de um dia de referência (lida com 28/29/30/31). */
export function ultimoDiaDoMes(refYMD: string): string {
  const ano = Number(refYMD.slice(0, 4));
  const mes = Number(refYMD.slice(5, 7)); // 1..12
  const ultimo = new Date(Date.UTC(ano, mes, 0)); // dia 0 do mês seguinte = último deste
  return ultimo.toISOString().slice(0, 10);
}

export type IntervaloFinanceiro = {
  iniYMD: string; // para os inputs (defaultValue) e para preservar na URL
  fimYMD: string;
  gte: Date; // meia-noite UTC do início (inclusivo)
  lt: Date; // meia-noite UTC do dia seguinte ao fim (exclusivo) — para queries
};

const valido = (s: string | undefined): s is string => !!s && diaValido(s);

/**
 * Resolve o intervalo a partir dos params crus (?ini=&fim=). Ausentes/inválidos caem
 * no 1º/último dia do mês de hoje. Se ini > fim, troca para um intervalo coerente.
 */
export function resolverIntervalo(
  iniRaw: string | undefined,
  fimRaw: string | undefined,
  hoje: string = hojeYMD(),
): IntervaloFinanceiro {
  let ini = valido(iniRaw) ? iniRaw : primeiroDiaDoMes(hoje);
  let fim = valido(fimRaw) ? fimRaw : ultimoDiaDoMes(hoje);
  if (ini > fim) [ini, fim] = [fim, ini]; // comparação lexicográfica vale p/ YYYY-MM-DD
  const gte = meiaNoiteUTC(ini);
  const lt = meiaNoiteUTC(fim);
  lt.setUTCDate(lt.getUTCDate() + 1); // fim inclusivo → exclusivo no lt
  return { iniYMD: ini, fimYMD: fim, gte, lt };
}

/**
 * Filtro de `vencimento` (Prisma) para um intervalo, opcionalmente limitado por um
 * `teto` (ex.: `hoje`, para "atrasadas" = já vencido). Centraliza a interseção que
 * vivia copiada em receber.ts/pagar.ts (listar + resumo):
 *  - sem intervalo, sem teto → undefined (não filtra por vencimento);
 *  - sem intervalo, com teto → `{ lt: teto }`;
 *  - com intervalo → `{ gte, lt }`, onde `lt` é o MENOR entre o do intervalo e o teto.
 */
export function vencimentoNaJanela(
  intervalo: { gte: Date; lt: Date } | undefined,
  teto?: Date,
): { gte: Date; lt: Date } | { lt: Date } | undefined {
  if (!intervalo) return teto ? { lt: teto } : undefined;
  const lt = teto && teto < intervalo.lt ? teto : intervalo.lt;
  return { gte: intervalo.gte, lt };
}
