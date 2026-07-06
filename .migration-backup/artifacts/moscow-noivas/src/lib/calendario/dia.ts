// src/lib/calendario/dia.ts
// "Dia do atelier": tudo o que acontece num dia — agenda (atendimentos, provas,
// casamentos) e, quando financeiro=true, as contas a receber/pagar que VENCEM no dia.
// Janela [meia-noite UTC do dia, +1 dia). Escopo de loja via tenantPrisma. A parte
// financeira só é buscada quando o chamador tem financeiro:ver (não vaza dado sensível).
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { meiaNoiteUTC } from "@/lib/tempo";
import { decParaString } from "@/lib/dinheiro";
import type { AtendimentoSituacao, ParcelaStatus, ContaPagarStatus } from "@/generated/prisma/client";

export type AtendimentoDoDia = {
  id: string;
  inicio: Date;
  situacao: AtendimentoSituacao;
  noivaNome: string | null;
  leadId: string;
  cabineNome: string | null;
  vendedoraNome: string | null;
};
export type ProvaDoDia = {
  id: string;
  inicio: Date;
  situacao: AtendimentoSituacao;
  noivaNome: string | null;
  leadId: string;
  bloqueioId: string | null;
  vestidoCodigo: string | null;
  vestidoNome: string | null;
};
export type CasamentoDoDia = {
  bloqueioId: string;
  noivaNome: string | null;
  leadId: string | null;
  vestidoCodigo: string;
  vestidoNome: string;
};
export type ReceberDoDia = {
  id: string;
  noivaNome: string | null;
  leadId: string;
  valor: string; // decimal-string, ex "500"
  status: ParcelaStatus;
};
export type PagarDoDia = {
  id: string;
  descricao: string;
  valor: string;
  status: ContaPagarStatus;
};
export type DiaDoAtelier = {
  ymd: string;
  atendimentos: AtendimentoDoDia[];
  provas: ProvaDoDia[];
  casamentos: CasamentoDoDia[];
  aReceber: ReceberDoDia[]; // [] quando financeiro=false
  aPagar: PagarDoDia[]; // [] quando financeiro=false
};

export async function detalheDoDia(
  lojaId: string,
  ymd: string,
  opts: { financeiro: boolean },
): Promise<DiaDoAtelier> {
  const db = tenantPrisma(prisma, lojaId);
  const gte = meiaNoiteUTC(ymd);
  const lt = new Date(gte.getTime());
  lt.setUTCDate(lt.getUTCDate() + 1);

  const [atendimentos, provas, casamentos, parcelas, contas] = await Promise.all([
    db.atendimento.findMany({
      where: { tipo: "ATENDIMENTO", inicio: { gte, lt } },
      orderBy: { inicio: "asc" },
      include: { lead: { select: { noivaNome: true } }, cabine: { select: { nome: true } }, vendedora: { select: { nome: true } } },
    }),
    db.atendimento.findMany({
      where: { tipo: "PROVA", inicio: { gte, lt } },
      orderBy: { inicio: "asc" },
      include: {
        lead: { select: { noivaNome: true } },
        bloqueio: { include: { vestido: { select: { codigo: true, nome: true } } } },
      },
    }),
    db.bloqueioVestido.findMany({
      where: { tipo: "RESERVA_CASAMENTO", casamentoData: { gte, lt } },
      include: { lead: { select: { noivaNome: true } }, vestido: { select: { codigo: true, nome: true } } },
    }),
    opts.financeiro
      ? db.parcela.findMany({
          where: { vencimento: { gte, lt } },
          orderBy: { vencimento: "asc" },
          include: { contrato: { select: { leadId: true, lead: { select: { noivaNome: true } } } } },
        })
      : Promise.resolve([]),
    opts.financeiro
      ? db.contaPagar.findMany({ where: { vencimento: { gte, lt } }, orderBy: { vencimento: "asc" } })
      : Promise.resolve([]),
  ]);

  return {
    ymd,
    atendimentos: atendimentos.map((a) => ({
      id: a.id,
      inicio: a.inicio,
      situacao: a.situacao,
      noivaNome: a.lead?.noivaNome ?? null,
      leadId: a.leadId,
      cabineNome: a.cabine?.nome ?? null,
      vendedoraNome: a.vendedora?.nome ?? null,
    })),
    provas: provas.map((p) => ({
      id: p.id,
      inicio: p.inicio,
      situacao: p.situacao,
      noivaNome: p.lead?.noivaNome ?? null,
      leadId: p.leadId,
      bloqueioId: p.bloqueioId,
      vestidoCodigo: p.bloqueio?.vestido.codigo ?? null,
      vestidoNome: p.bloqueio?.vestido.nome ?? null,
    })),
    casamentos: casamentos.map((c) => ({
      bloqueioId: c.id,
      noivaNome: c.lead?.noivaNome ?? null,
      leadId: c.leadId,
      vestidoCodigo: c.vestido.codigo,
      vestidoNome: c.vestido.nome,
    })),
    aReceber: parcelas.map((p) => ({
      id: p.id,
      noivaNome: p.contrato.lead?.noivaNome ?? null,
      leadId: p.contrato.leadId,
      valor: decParaString(p.valorPrevisto),
      status: p.status,
    })),
    aPagar: contas.map((c) => ({
      id: c.id,
      descricao: c.descricao,
      valor: decParaString(c.valorPrevisto),
      status: c.status,
    })),
  };
}
