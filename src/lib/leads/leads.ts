// src/lib/leads/leads.ts
// Data layer de noivas (model Lead). Espelha src/lib/vestidos/vestidos.ts:
// ÚNICO ponto de leitura/escrita de lead desta fatia — passa OBRIGATORIAMENTE pelo
// guard tenantPrisma (isolamento por loja de graça). Sem schema/migration nesta
// fatia: o model Lead já existe e já é escopado pelo guard.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import type { Lead, Prisma } from "@/generated/prisma/client";
import { LeadOrigem } from "@/generated/prisma/client";
import { estagioDaNoiva, noivaAtiva, type FatosJornada, type EstagioChave } from "./jornada";
import { hojeUTC } from "@/lib/tempo";
import { parseDiaUTC } from "@/lib/disponibilidade/datas";

// Lead + presença do interesse (id só, p/ a lista decidir "Preencher" vs "Editar").
export type LeadListado = Prisma.LeadGetPayload<{ include: { interesse: { select: { id: true } } } }>;

export type NovaNoiva = {
  noivaNome: string;
  noivoNome?: string;
  whatsapp?: string;
  cerimonialista?: string;
  casamentoData?: string; // "YYYY-MM-DD" do <input type=date>
  casamentoHorario?: string; // "HH:MM" do <input type=time>
  casamentoLocal?: string;
  origem?: string; // "LOJA" | "WHATSAPP"
};

export const ROTULO_ORIGEM: Record<LeadOrigem, string> = {
  LOJA: "Loja",
  WHATSAPP: "WhatsApp",
};

function vazioNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function parseOrigem(raw: string | undefined): LeadOrigem {
  const v = (raw ?? "").trim();
  if (v === "") return LeadOrigem.LOJA; // default do schema
  if (v in LeadOrigem) return v as LeadOrigem;
  throw new Error("Origem inválida");
}

// Data-só "YYYY-MM-DD" → DateTime à meia-noite UTC. Guardar e exibir em UTC mantém
// o dia do calendário estável (sem off-by-one por fuso). Vazio é permitido (null).
// Delega ao parser estrito do motor (parseDiaUTC), que também rejeita datas
// impossíveis ("2027-02-30") — antes passavam e rolavam para março, contaminando
// a contagem regressiva e o agrupamento da jornada.
function parseData(raw: string | undefined): Date | null {
  const v = (raw ?? "").trim();
  if (v === "") return null;
  try {
    return parseDiaUTC(v);
  } catch {
    throw new Error("Informe uma data de casamento válida");
  }
}

function validar(input: NovaNoiva): {
  noivaNome: string;
  origem: LeadOrigem;
  casamentoData: Date | null;
} {
  const noivaNome = input.noivaNome.trim();
  if (!noivaNome) throw new Error("Nome da noiva é obrigatório");
  return { noivaNome, origem: parseOrigem(input.origem), casamentoData: parseData(input.casamentoData) };
}

function dados(input: NovaNoiva, noivaNome: string, origem: LeadOrigem, casamentoData: Date | null) {
  return {
    noivaNome,
    origem,
    casamentoData,
    noivoNome: vazioNull(input.noivoNome),
    whatsapp: vazioNull(input.whatsapp),
    cerimonialista: vazioNull(input.cerimonialista),
    casamentoHorario: vazioNull(input.casamentoHorario),
    casamentoLocal: vazioNull(input.casamentoLocal),
    // etapa: omitido de propósito → default NOVO do schema.
  };
}

export async function listarLeads(lojaId: string): Promise<LeadListado[]> {
  // include do interesse (só id) é leitura do filho via pai escopado — seguro.
  return tenantPrisma(prisma, lojaId).lead.findMany({
    orderBy: { noivaNome: "asc" },
    include: { interesse: { select: { id: true } } },
  });
}

export async function criarLead(lojaId: string, input: NovaNoiva): Promise<Lead> {
  const { noivaNome, origem, casamentoData } = validar(input);
  // O guard tenantPrisma carimba lojaId em runtime; o tipo do create exige lojaId,
  // por isso o cast (mesmo motivo do `as never` em vestidos.ts).
  return tenantPrisma(prisma, lojaId).lead.create({
    data: dados(input, noivaNome, origem, casamentoData) as never,
  });
}

export async function obterLead(lojaId: string, leadId: string): Promise<Lead | null> {
  // Escopado: lead de outra loja → null (guard injeta lojaId no where).
  return tenantPrisma(prisma, lojaId).lead.findUnique({ where: { id: leadId } });
}

export async function editarLead(lojaId: string, leadId: string, input: NovaNoiva): Promise<Lead> {
  const { noivaNome, origem, casamentoData } = validar(input);
  // tenantPrisma injeta lojaId no where → editar lead de outra loja lança P2025
  // (falha fechada). etapa/interesse não são tocados aqui.
  return tenantPrisma(prisma, lojaId).lead.update({
    where: { id: leadId },
    data: dados(input, noivaNome, origem, casamentoData),
  });
}


// include mínimo p/ derivar a jornada: interesse (atributos), atendimentos (situação),
// reservas (datas + provas). Exportado p/ o painel reusar a MESMA derivação (sem cópia).
export const INCLUDE_JORNADA = {
  interesse: { select: { atributos: { select: { atributoId: true } } } },
  atendimentos: { select: { situacao: true } },
  orcamentos: { select: { status: true } },
  contratos: { select: { status: true } },
  bloqueios: {
    where: { tipo: "RESERVA_CASAMENTO" as const },
    select: {
      retiradaDataReal: true,
      devolucaoDataReal: true,
      provas: { select: { comparecimento: true } },
    },
  },
} as const;

export type LeadComJornada = Prisma.LeadGetPayload<{ include: typeof INCLUDE_JORNADA }>;

export function fatosDeLead(lead: LeadComJornada, hoje: Date): FatosJornada {
  const provas = lead.bloqueios.flatMap((b) => b.provas);
  return {
    // "houve atendimento" é STICKY: qualquer atendimento já marca a etapa. Assim uma
    // noiva que FALTOU não regride para "cadastrada" (ela foi agendada um dia).
    houveAtendimento: lead.atendimentos.length > 0,
    foiAtendida: lead.atendimentos.some(
      (a) => a.situacao === "EM_ATENDIMENTO" || a.situacao === "CONCLUIDO",
    ),
    temProvaAgendada: provas.some((p) => p.comparecimento === "AGENDADA"),
    temInteresse: (lead.interesse?.atributos.length ?? 0) > 0,
    temOrcamento: lead.orcamentos.some((o) => o.status !== "RECUSADO"),
    orcamentoAbertoEm: lead.orcamentoAbertoEm,
    temContrato: lead.contratos.some((c) => c.status === "ATIVO"),
    contratoFechadoEm: lead.contratoFechadoEm,
    temProvaRealizada: provas.some((p) => p.comparecimento === "COMPARECEU"),
    temRetirada: lead.bloqueios.some((b) => b.retiradaDataReal !== null),
    casamentoPassou: lead.casamentoData !== null && lead.casamentoData < hoje,
    temDevolucao: lead.bloqueios.some((b) => b.devolucaoDataReal !== null),
    perdidaEm: lead.perdidaEm,
  };
}

/** Fatos da jornada de UMA noiva (null se não for da loja). */
export async function fatosDaNoiva(lojaId: string, leadId: string): Promise<FatosJornada | null> {
  const lead = await tenantPrisma(prisma, lojaId).lead.findUnique({
    where: { id: leadId },
    include: INCLUDE_JORNADA,
  });
  if (!lead) return null;
  return fatosDeLead(lead, hojeUTC());
}

export type EstagioResumo = { atual: EstagioChave; encerrada: string | null };

/** Estágio derivado de TODAS as noivas da loja (lote, em memória). */
export async function estagiosDasNoivas(lojaId: string): Promise<Map<string, EstagioResumo>> {
  const hoje = hojeUTC();
  const leads = await tenantPrisma(prisma, lojaId).lead.findMany({ include: INCLUDE_JORNADA });
  const mapa = new Map<string, EstagioResumo>();
  for (const l of leads) {
    const { atual, encerrada } = estagioDaNoiva(fatosDeLead(l, hoje));
    mapa.set(l.id, { atual, encerrada });
  }
  return mapa;
}

export type NoivaComEstagio = LeadComJornada & { estagio: EstagioResumo };

/** Lista as noivas da loja JÁ com o estágio derivado — UMA leitura ordenada por nome.
 *  Antes a tela de Noivas fazia duas findMany sobre o mesmo lead (listarLeads para os
 *  dados + estagiosDasNoivas para a jornada); aqui as duas viram uma só. */
export async function listarNoivasComEstagio(lojaId: string): Promise<NoivaComEstagio[]> {
  const hoje = hojeUTC();
  const leads = await tenantPrisma(prisma, lojaId).lead.findMany({
    orderBy: { noivaNome: "asc" },
    include: INCLUDE_JORNADA,
  });
  return leads.map((l) => {
    const { atual, encerrada } = estagioDaNoiva(fatosDeLead(l, hoje));
    return { ...l, estagio: { atual, encerrada } };
  });
}

/** Noivas em acompanhamento ATIVO (fora: perdida, devolvida, casada). Para os selects de
 *  formulário — só faz sentido agendar/orçar/reservar para quem está na jornada viva. */
export async function listarNoivasAtivas(lojaId: string): Promise<LeadComJornada[]> {
  const hoje = hojeUTC();
  const leads = await tenantPrisma(prisma, lojaId).lead.findMany({ orderBy: { noivaNome: "asc" }, include: INCLUDE_JORNADA });
  return leads.filter((l) => {
    const { atual, encerrada } = estagioDaNoiva(fatosDeLead(l, hoje));
    return noivaAtiva(atual, encerrada);
  });
}

export type MarcoJornada = "orcamentoAbertoEm" | "contratoFechadoEm" | "perdidaEm";

/** Liga/desliga um marco manual da jornada. Escopado por loja (updateMany). */
export async function definirMarcoJornada(
  lojaId: string,
  leadId: string,
  campo: MarcoJornada,
  ligar: boolean,
): Promise<void> {
  await tenantPrisma(prisma, lojaId).lead.updateMany({
    where: { id: leadId },
    data: { [campo]: ligar ? new Date() : null } as never,
  });
}
