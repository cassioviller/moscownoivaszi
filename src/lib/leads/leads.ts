// src/lib/leads/leads.ts
// Data layer de noivas (model Lead). Espelha src/lib/vestidos/vestidos.ts:
// ÚNICO ponto de leitura/escrita de lead desta fatia — passa OBRIGATORIAMENTE pelo
// guard tenantPrisma (isolamento por loja de graça). Sem schema/migration nesta
// fatia: o model Lead já existe e já é escopado pelo guard.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import type { Lead, Prisma } from "@/generated/prisma/client";
import { LeadEtapa, LeadOrigem } from "@/generated/prisma/client";

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

// Rótulos humanos da jornada (DESIGN §11) — a UI nunca mostra o enum cru.
// NOVO aparece como "Nova noiva" (decisão de produto desta fatia).
export const ROTULO_ETAPA: Record<LeadEtapa, string> = {
  NOVO: "Nova noiva",
  INTERESSES_PREENCHIDOS: "Interesses preenchidos",
  ATENDIMENTO_AGENDADO: "Atendimento agendado",
  EM_ATENDIMENTO: "Em atendimento",
  ORCAMENTO_ABERTO: "Orçamento aberto",
  CONTRATO_FECHADO: "Contrato fechado",
  EM_PROVAS: "Em provas",
  RETIRADO: "Vestido retirado",
  CASAMENTO_REALIZADO: "Casamento realizado",
  DEVOLVIDO: "Devolvido",
  PERDIDO: "Não seguiu",
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
function parseData(raw: string | undefined): Date | null {
  const v = (raw ?? "").trim();
  if (v === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("Informe uma data de casamento válida");
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Informe uma data de casamento válida");
  return d;
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
