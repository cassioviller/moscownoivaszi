// Camada de domínio do Motor de Disponibilidade.
// Tipos próprios (independentes do Prisma) para manter o motor 100% puro:
// não conhece banco nem tela. O consumidor mapeia as entidades Prisma para estes tipos.

// "preparacao" = 1ª fase do bloco contínuo (peça reservada para provas/ajustes),
// ANTES do uso. NÃO é a prova real (operacional) — esta vive na entidade Prova e
// não alimenta o motor. Ver docs/superpowers/specs/2026-06-01-provas-ajustes-design.md.
export type TipoJanela = "preparacao" | "uso" | "lavagem" | "manutencao";

export type TipoBloqueio = "reserva_casamento" | "manutencao";

export interface Regras {
  provaDiasAntes: number;
  provaDuracao: number;
  usoDiasAntes: number;
  usoDiasDepois: number;
  lavagemDiasDepois: number;
}

export interface Bloqueio {
  id: string;
  vestidoId: string;
  tipo: TipoBloqueio;
  // Datas de ENTRADA como "YYYY-MM-DD" (Grill 4): sem horário/fuso, sem off-by-one.
  casamentoData: string | null;
  // DEPRECADO como insumo do motor (decisão 2026-06-01): a prova real é operacional
  // (entidade Prova) e NÃO move a disponibilidade. Mantido no shape porque a coluna
  // ainda existe no banco; o motor o ignora de propósito.
  provaDataReal: string | null;
  retiradaDataReal: string | null;
  devolucaoDataReal: string | null;
}

export interface Janela {
  tipo: TipoJanela;
  // Datas de SAÍDA já parseadas: Date em UTC-meia-noite (não ambíguas).
  inicio: Date;
  fim: Date;
}

export interface Conflito {
  bloqueioId: string;
  janelaCandidata: Janela;
  janelaExistente: Janela;
}

export interface ErroBloqueio {
  bloqueioId: string;
  motivo: string;
}

export interface Veredito {
  disponivel: boolean;
  conflitos: Conflito[];
  // Bloqueios existentes que não puderam ser projetados (dados malformados).
  // Sempre presente ([] quando não há). Qualquer erro força disponivel: false.
  errosBloqueio: ErroBloqueio[];
}
