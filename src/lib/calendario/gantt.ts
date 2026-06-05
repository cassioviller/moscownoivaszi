// src/lib/calendario/gantt.ts
// Layout PURO da timeline de vestidos (sem Prisma). Recebe os eventos da agenda
// (EventoAgenda, derivados das reservas) e os converte em linhas — uma por vestido —
// com barras posicionadas em PORCENTAGEM da janela [janelaInicio, +janelaDias).
// Barras "abertoFim" (vestido fora por tempo indeterminado) vão até o fim da janela.
import type { EventoAgenda } from "@/lib/disponibilidade/agenda";
import type { TipoJanela } from "@/lib/disponibilidade/tipos";

const DIA_MS = 86_400_000;
const clampPct = (n: number) => Math.max(0, Math.min(100, n));

export type BarraGantt = {
  tipo: TipoJanela;
  rotulo: string;
  inicioPct: number;
  larguraPct: number;
  abertoFim: boolean;
};

export type LinhaGantt = {
  vestidoId: string;
  vestidoCodigo: string;
  vestidoNome: string;
  noivaNome: string | null;
  barras: BarraGantt[];
};

/** Monta as linhas (1 por vestido) com barras em % da janela. Linhas ordenadas
 *  pela barra mais à esquerda; barras de cada linha por início. */
export function montarGantt(
  eventos: EventoAgenda[],
  janelaInicio: Date,
  janelaDias: number,
): LinhaGantt[] {
  if (janelaDias <= 0) return [];
  const base = janelaInicio.getTime();
  const porVestido = new Map<string, LinhaGantt>();

  for (const e of eventos) {
    const iDias = (e.inicio.getTime() - base) / DIA_MS;
    const fDias = (e.fim.getTime() - base) / DIA_MS;
    const inicioPct = clampPct((iDias / janelaDias) * 100);
    const fimPct = e.abertoFim ? 100 : clampPct((fDias / janelaDias) * 100);
    const larguraPct = Math.max(1, fimPct - inicioPct); // mínimo visível

    let linha = porVestido.get(e.vestidoId);
    if (!linha) {
      linha = {
        vestidoId: e.vestidoId,
        vestidoCodigo: e.vestidoCodigo,
        vestidoNome: e.vestidoNome,
        noivaNome: e.noivaNome,
        barras: [],
      };
      porVestido.set(e.vestidoId, linha);
    }
    linha.barras.push({ tipo: e.tipo, rotulo: e.rotulo, inicioPct, larguraPct, abertoFim: e.abertoFim });
  }

  const linhas = [...porVestido.values()];
  for (const l of linhas) l.barras.sort((a, b) => a.inicioPct - b.inicioPct);
  linhas.sort((a, b) => (a.barras[0]?.inicioPct ?? 0) - (b.barras[0]?.inicioPct ?? 0));
  return linhas;
}
