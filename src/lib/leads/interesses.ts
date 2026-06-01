// src/lib/leads/interesses.ts
// Data layer dos interesses escalares da noiva (model LeadInteresse, 1:1 com Lead).
// FATIA 1: só campos escalares — sem LeadInteresseAtributo, sem catálogo.
//
// SEGURANÇA: LeadInteresse NÃO é escopado pelo tenantPrisma (não tem lojaId). O
// isolamento vem de confirmar ANTES que o Lead pertence à loja, via
// tenantPrisma.lead.findUnique — só então tocamos o filho. Visita (obter) nunca
// cria registro; o upsert vive apenas em salvarInteresse.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import type { Lead, LeadInteresse } from "@/generated/prisma/client";
import { Escala, Fenda } from "@/generated/prisma/client";

export type InteresseInput = {
  volumeSaia?: string;
  brilho?: string;
  cauda?: string;
  fenda?: string;
  algoAMais?: string;
  naoQuerUsar?: string;
  tetoOrcamento?: string;
};

export const ROTULO_ESCALA: Record<Escala, string> = {
  POUCO: "Pouco",
  MEDIO: "Médio",
  MUITO: "Muito",
};

export const ROTULO_FENDA: Record<Fenda, string> = {
  SIM: "Sim",
  NAO: "Não",
  TALVEZ: "Talvez",
};

function vazioNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function parseEscala(raw: string | undefined): Escala | null {
  const v = (raw ?? "").trim();
  if (v === "") return null;
  if (v in Escala) return v as Escala;
  throw new Error("Valor de escala inválido");
}

function parseFenda(raw: string | undefined): Fenda | null {
  const v = (raw ?? "").trim();
  if (v === "") return null;
  if (v in Fenda) return v as Fenda;
  throw new Error("Valor de fenda inválido");
}

// teto opcional; pt-BR (vírgula decimal). "" → null. Inválido/≤0 → erro.
function parseTeto(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (v === "") return null;
  const limpo = v.replace(/\s/g, "");
  const norm = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(norm);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Informe um teto de orçamento válido");
  return n.toFixed(2);
}

function dados(input: InteresseInput) {
  return {
    volumeSaia: parseEscala(input.volumeSaia),
    brilho: parseEscala(input.brilho),
    cauda: parseEscala(input.cauda),
    fenda: parseFenda(input.fenda),
    algoAMais: vazioNull(input.algoAMais),
    naoQuerUsar: vazioNull(input.naoQuerUsar),
    tetoOrcamento: parseTeto(input.tetoOrcamento),
  };
}

// Confirma que o Lead é da loja. Lança se não for (falha fechada).
async function exigirLeadDaLoja(lojaId: string, leadId: string): Promise<void> {
  const dono = await tenantPrisma(prisma, lojaId).lead.findUnique({
    where: { id: leadId },
    select: { id: true },
  });
  if (!dono) throw new Error("Noiva não encontrada nesta loja");
}

/** Leitura read-only: noiva + interesse (ou null). NUNCA cria registro. */
export async function obterNoivaComInteresse(
  lojaId: string,
  leadId: string,
): Promise<{ lead: Lead; interesse: LeadInteresse | null } | null> {
  const lead = await tenantPrisma(prisma, lojaId).lead.findUnique({ where: { id: leadId } });
  if (!lead) return null; // não é da loja (ou não existe)
  const interesse = await prisma.leadInteresse.findUnique({ where: { leadId } });
  return { lead, interesse };
}

/** Upsert dos interesses escalares. Só aqui se cria/atualiza registro. */
export async function salvarInteresse(
  lojaId: string,
  leadId: string,
  input: InteresseInput,
): Promise<LeadInteresse> {
  await exigirLeadDaLoja(lojaId, leadId);
  const data = dados(input);
  return prisma.leadInteresse.upsert({
    where: { leadId },
    create: { leadId, ...data },
    update: data,
  });
}
