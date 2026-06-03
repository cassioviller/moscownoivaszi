// src/lib/leads/jornada.ts
// Jornada da noiva DERIVADA dos fatos (nunca guardada/desatualizada). Função pura,
// sem Prisma — os carregadores (leads.ts) montam os FatosJornada e chamam aqui.
// Decisão: docs/superpowers/specs/2026-06-01-jornada-derivada-design.md

export const ESTAGIOS = [
  "cadastrada",
  "atendimento_agendado",
  "atendida",
  "prova_marcada",
  "interesses",
  "orcamento_aberto",
  "contrato_fechado",
  "em_provas",
  "retirado",
  "casamento",
  "devolucao",
] as const;
export type EstagioChave = (typeof ESTAGIOS)[number];

export const ROTULO_ESTAGIO: Record<EstagioChave, string> = {
  cadastrada: "Cadastrada",
  atendimento_agendado: "Atendimento agendado",
  atendida: "Atendida",
  prova_marcada: "Prova marcada",
  interesses: "Interesses preenchidos",
  orcamento_aberto: "Orçamento aberto",
  contrato_fechado: "Contrato fechado",
  em_provas: "Em provas",
  retirado: "Vestido retirado",
  casamento: "Casamento realizado",
  devolucao: "Devolução",
};

export type FatosJornada = {
  houveAtendimento: boolean;
  foiAtendida: boolean;
  temProvaAgendada: boolean;
  temInteresse: boolean;
  orcamentoAbertoEm: Date | null;
  contratoFechadoEm: Date | null;
  temProvaRealizada: boolean;
  temRetirada: boolean;
  casamentoPassou: boolean;
  temDevolucao: boolean;
  perdidaEm: Date | null;
};

export type PassoJornada = {
  chave: EstagioChave;
  rotulo: string;
  estado: "feito" | "atual" | "futuro";
};

// Vetor de "satisfeito?" por estágio, na ordem de ESTAGIOS.
function satisfeitos(f: FatosJornada): boolean[] {
  return [
    true, // cadastrada (base)
    f.houveAtendimento, // atendimento_agendado
    f.foiAtendida, // atendida
    f.temProvaAgendada, // prova_marcada
    f.temInteresse, // interesses
    f.orcamentoAbertoEm !== null, // orcamento_aberto
    f.contratoFechadoEm !== null, // contrato_fechado
    f.temProvaRealizada, // em_provas
    f.temRetirada, // retirado
    f.casamentoPassou, // casamento
    f.temDevolucao, // devolucao
  ];
}

/**
 * Estágio atual = o de MAIOR índice satisfeito (anteriores = feito; seguintes =
 * futuro). `perdidaEm` não muda o atual — encerra a jornada com selo "Perdida".
 * Devolução fecha positiva ("Devolvido").
 */
export function estagioDaNoiva(f: FatosJornada): {
  passos: PassoJornada[];
  atual: EstagioChave;
  encerrada: string | null;
} {
  const ok = satisfeitos(f);
  let idx = 0;
  ok.forEach((s, i) => {
    if (s) idx = i;
  });
  const passos: PassoJornada[] = ESTAGIOS.map((chave, i) => ({
    chave,
    rotulo: ROTULO_ESTAGIO[chave],
    estado: i < idx ? "feito" : i === idx ? "atual" : "futuro",
  }));
  const atual = ESTAGIOS[idx];
  const encerrada = f.perdidaEm ? "Perdida" : atual === "devolucao" ? "Devolvido" : null;
  return { passos, atual, encerrada };
}

/** Noiva em acompanhamento ATIVO (dashboard): fora se perdida, casada ou devolvida. */
export function noivaAtiva(atual: EstagioChave, encerrada: string | null): boolean {
  return encerrada === null && atual !== "casamento";
}
