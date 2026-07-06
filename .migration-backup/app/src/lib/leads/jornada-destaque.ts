// Escolhe a "noiva em destaque" para a linha do tempo do dashboard: a noiva ATIVA
// cujo casamento futuro está mais próximo (a mais urgente). Puro e testável; a
// montagem dos passos de jornada fica em jornada.ts (fonte única).
export type CandidataDestaque = {
  id: string;
  noivaNome: string;
  casamentoData: Date | null;
  ativa: boolean;
};

export function escolherDestaque(cands: CandidataDestaque[], hoje: Date): CandidataDestaque | null {
  const hojeMs = hoje.getTime();
  const elegiveis = cands
    .filter((c) => c.ativa && c.casamentoData !== null && c.casamentoData.getTime() >= hojeMs)
    .sort((a, b) => a.casamentoData!.getTime() - b.casamentoData!.getTime());
  return elegiveis[0] ?? null;
}
