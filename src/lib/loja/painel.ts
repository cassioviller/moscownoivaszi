// src/lib/loja/painel.ts
//
// Dados do dashboard ("mesa do atelier"). Tudo é dado REAL já existente — etapa
// da jornada (Lead.etapa) e data do casamento (Lead.casamentoData). NÃO há
// entidade de agendamento/provas no modelo, então o dashboard não inventa
// "agenda": mostra a jornada e os casamentos próximos, que são factuais.
//
// SEGURANÇA: Lead e Vestido são tenant models — toda leitura passa pelo guard
// tenantPrisma (isolamento por loja).
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { LeadEtapa } from "@/generated/prisma/client";
import { ROTULO_ETAPA } from "@/lib/leads/leads";

// Ordem canônica da jornada (consulta → grande dia). Só as etapas "vivas".
const JORNADA_ORDEM: LeadEtapa[] = [
  LeadEtapa.NOVO,
  LeadEtapa.INTERESSES_PREENCHIDOS,
  LeadEtapa.ATENDIMENTO_AGENDADO,
  LeadEtapa.EM_ATENDIMENTO,
  LeadEtapa.ORCAMENTO_ABERTO,
  LeadEtapa.CONTRATO_FECHADO,
  LeadEtapa.EM_PROVAS,
  LeadEtapa.RETIRADO,
];

// Etapas que tiram a noiva do acompanhamento ativo (encerradas).
const ENCERRADAS = new Set<LeadEtapa>([
  LeadEtapa.CASAMENTO_REALIZADO,
  LeadEtapa.DEVOLVIDO,
  LeadEtapa.PERDIDO,
]);

const DIA_MS = 86_400_000;
const JANELA_PROXIMOS_DIAS = 30;

export type EtapaJornada = { etapa: LeadEtapa; rotulo: string; total: number };
export type CasamentoProximo = {
  id: string;
  noivaNome: string;
  data: Date;
  diasRestantes: number;
};
export type PainelLoja = {
  noivasAtivas: number;
  vestidos: number;
  emProvas: number;
  casamentosProximos: number; // dentro da janela (30 dias)
  jornada: EtapaJornada[]; // etapas vivas com ao menos 1 noiva, em ordem
  proximosCasamentos: CasamentoProximo[]; // os 5 mais próximos
};

// Meia-noite UTC do dia de HOJE no fuso da loja — casa com a convenção de
// Lead.casamentoData (data-só guardada à meia-noite UTC), evitando off-by-one.
function inicioDeHojeUTC(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

export async function carregarPainel(lojaId: string): Promise<PainelLoja> {
  const db = tenantPrisma(prisma, lojaId);
  const hoje = inicioDeHojeUTC();

  const [porEtapa, vestidos, futuros] = await Promise.all([
    db.lead.groupBy({ by: ["etapa"], _count: { _all: true } }),
    db.vestido.count(),
    db.lead.findMany({
      where: { casamentoData: { gte: hoje } },
      orderBy: { casamentoData: "asc" },
      select: { id: true, noivaNome: true, casamentoData: true },
    }),
  ]);

  const totalPorEtapa = new Map<LeadEtapa, number>();
  for (const g of porEtapa) totalPorEtapa.set(g.etapa, g._count._all);

  const noivasAtivas = [...totalPorEtapa.entries()]
    .filter(([etapa]) => !ENCERRADAS.has(etapa))
    .reduce((soma, [, n]) => soma + n, 0);

  const jornada: EtapaJornada[] = JORNADA_ORDEM.filter((e) => (totalPorEtapa.get(e) ?? 0) > 0).map(
    (etapa) => ({ etapa, rotulo: ROTULO_ETAPA[etapa], total: totalPorEtapa.get(etapa) ?? 0 }),
  );

  const proximosCasamentos: CasamentoProximo[] = futuros.slice(0, 5).map((l) => ({
    id: l.id,
    noivaNome: l.noivaNome,
    data: l.casamentoData!,
    diasRestantes: Math.round((l.casamentoData!.getTime() - hoje.getTime()) / DIA_MS),
  }));

  const limite = hoje.getTime() + JANELA_PROXIMOS_DIAS * DIA_MS;
  const casamentosProximos = futuros.filter((l) => l.casamentoData!.getTime() <= limite).length;

  return {
    noivasAtivas,
    vestidos,
    emProvas: totalPorEtapa.get(LeadEtapa.EM_PROVAS) ?? 0,
    casamentosProximos,
    jornada,
    proximosCasamentos,
  };
}
