// src/lib/calendario/mes.ts
// Matemática pura da grade mensal (sem Prisma). Tudo em UTC — o dia-calendário do
// sistema é meia-noite UTC do dia em São Paulo (ver @/lib/tempo). A grade tem 42
// células (6 semanas × 7), começando no domingo da semana do dia 1: assim cada mês
// cabe inteiro e os dias "vazantes" dos meses vizinhos preenchem as bordas.

export type TipoMarcador = "casamento" | "prova" | "atendimento";
export type Marcador = { ymd: string; tipo: TipoMarcador };

export type DiaGrade = {
  data: Date; // meia-noite UTC
  ymd: string; // "YYYY-MM-DD"
  noMes: boolean; // pertence ao mês de referência
  hoje: boolean;
};

/** 42 dias (6×7) da grade do mês (ano, mes0 0-based), com hoje sinalizado. */
export function gradeDoMes(ano: number, mes0: number, hojeYMD: string): DiaGrade[] {
  const primeiro = new Date(Date.UTC(ano, mes0, 1));
  const inicio = new Date(primeiro.getTime());
  inicio.setUTCDate(1 - primeiro.getUTCDay()); // recua até o domingo
  const dias: DiaGrade[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio.getTime());
    d.setUTCDate(inicio.getUTCDate() + i);
    const ymd = d.toISOString().slice(0, 10);
    dias.push({ data: d, ymd, noMes: d.getUTCMonth() === mes0, hoje: ymd === hojeYMD });
  }
  return dias;
}

/** "YYYY-MM" → {ano, mes0}. Ausente/ inválido → mês de hoje. */
export function mesDeRef(ref: string | undefined, hojeYMD: string): { ano: number; mes0: number } {
  const m = ref ? /^(\d{4})-(\d{2})$/.exec(ref) : null;
  if (m) {
    const ano = Number(m[1]);
    const mes = Number(m[2]);
    if (mes >= 1 && mes <= 12) return { ano, mes0: mes - 1 };
  }
  const [a, mm] = hojeYMD.split("-");
  return { ano: Number(a), mes0: Number(mm) - 1 };
}

/** {ano, mes0} → "YYYY-MM" (mês 1-based, zero-pad). */
export function refDoMes(ano: number, mes0: number): string {
  return `${ano}-${String(mes0 + 1).padStart(2, "0")}`;
}

/** Mês vizinho (delta em meses), virando o ano nas bordas. */
export function mesVizinho(ano: number, mes0: number, delta: number): { ano: number; mes0: number } {
  const d = new Date(Date.UTC(ano, mes0 + delta, 1));
  return { ano: d.getUTCFullYear(), mes0: d.getUTCMonth() };
}

/** Agrupa marcadores por dia; tipos repetidos no mesmo dia colapsam (Set). */
export function agruparMarcadoresPorDia(marcadores: Marcador[]): Map<string, Set<TipoMarcador>> {
  const mapa = new Map<string, Set<TipoMarcador>>();
  for (const mk of marcadores) {
    let set = mapa.get(mk.ymd);
    if (!set) {
      set = new Set<TipoMarcador>();
      mapa.set(mk.ymd, set);
    }
    set.add(mk.tipo);
  }
  return mapa;
}
