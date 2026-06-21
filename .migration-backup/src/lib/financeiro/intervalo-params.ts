// src/lib/financeiro/intervalo-params.ts
// Centraliza, para as páginas do financeiro, a leitura de ?ini=&fim=&p= e a montagem
// da querystring preservada (para chips de status, paginação, etc.). DRY do wiring.
import { resolverIntervalo, type IntervaloFinanceiro } from "./intervalo";

export type FiltroFinanceiro = {
  intervalo: IntervaloFinanceiro;
  pagina: number;
  qs(extra?: Record<string, string | number | undefined>): string;
};

export function lerFiltroFinanceiro(sp: Record<string, string | undefined>): FiltroFinanceiro {
  const intervalo = resolverIntervalo(sp.ini, sp.fim);
  const n = Number(sp.p);
  const pagina = Number.isInteger(n) && n >= 1 ? n : 1;
  const qs = (extra: Record<string, string | number | undefined> = {}) => {
    const params = new URLSearchParams();
    const todos = { ini: intervalo.iniYMD, fim: intervalo.fimYMD, ...extra };
    for (const [k, v] of Object.entries(todos)) {
      if (v !== undefined && v !== "") params.set(k, String(v));
    }
    return params.toString();
  };
  return { intervalo, pagina, qs };
}
