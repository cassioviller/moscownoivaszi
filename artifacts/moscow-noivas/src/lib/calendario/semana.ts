// src/lib/calendario/semana.ts
// Matemática pura da semana (sem Prisma). A semana começa no DOMINGO (consistente
// com a grade do mês). atendimento.inicio é wall-clock UTC (hora cheia), então o
// dia e a hora saem de getUTC* — sem conversão de fuso.

const chaveYMD = (d: Date): string => d.toISOString().slice(0, 10);

/** Domingo (00:00 UTC) da semana que contém refUTC. */
export function inicioDaSemana(refUTC: Date): Date {
  const d = new Date(refUTC.getTime());
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

/** Os 7 dias (domingo→sábado, 00:00 UTC) da semana de refUTC. */
export function diasDaSemana(refUTC: Date): Date[] {
  const ini = inicioDaSemana(refUTC);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ini.getTime());
    d.setUTCDate(ini.getUTCDate() + i);
    return d;
  });
}

/** "YYYY-MM-DD" → domingo daquela semana. Ausente/inválido → semana de hoje. */
export function semanaDeRef(ref: string | undefined, hojeYMD: string): Date {
  const base = ref && /^\d{4}-\d{2}-\d{2}$/.test(ref) ? ref : hojeYMD;
  return inicioDaSemana(new Date(`${base}T00:00:00.000Z`));
}

/** YMD de uma data (para montar o ?ref= de navegação). */
export function refDaSemana(d: Date): string {
  return chaveYMD(d);
}

/** Chave de célula da grade: "YMD|hora". */
export function chaveCelula(ymd: string, hora: number): string {
  return `${ymd}|${hora}`;
}

/** Indexa itens por célula (dia×hora) a partir de item.inicio (UTC). */
export function indexarPorCelula<T extends { inicio: Date }>(itens: T[]): Map<string, T[]> {
  const idx = new Map<string, T[]>();
  for (const it of itens) {
    const k = chaveCelula(chaveYMD(it.inicio), it.inicio.getUTCHours());
    const atual = idx.get(k);
    if (atual) atual.push(it);
    else idx.set(k, [it]);
  }
  return idx;
}
