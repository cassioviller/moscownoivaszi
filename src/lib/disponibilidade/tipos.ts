// Camada de domínio do Motor de Disponibilidade.
// Tipos próprios (independentes do Prisma) para manter o motor 100% puro:
// não conhece banco nem tela. O consumidor mapeia as entidades Prisma para estes tipos.

export type TipoJanela = "prova" | "uso" | "lavagem" | "manutencao";

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
