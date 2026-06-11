// src/lib/calendario/dados.ts
// Leituras Prisma do calendário (escopo de loja via tenantPrisma). Reúne, num
// intervalo [inicio, fim), os pontos que viram marcadores na grade do mês:
// casamentos (BloqueioVestido.casamentoData), provas (Atendimento{tipo:PROVA}.inicio)
// e atendimentos (Atendimento{tipo:ATENDIMENTO}.inicio). Datas saem como "YYYY-MM-DD" (UTC).
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { ymd, hojeUTC } from "@/lib/tempo";
import type { Marcador } from "./mes";
import type { AtendimentoSituacao } from "@/generated/prisma/client";

/** Marcadores (casamento/prova/atendimento) com data em [inicio, fim). */
export async function marcadoresNoIntervalo(
  lojaId: string,
  inicio: Date,
  fim: Date,
): Promise<Marcador[]> {
  const db = tenantPrisma(prisma, lojaId);
  const [casamentos, provas, atendimentos] = await Promise.all([
    db.bloqueioVestido.findMany({
      where: { casamentoData: { gte: inicio, lt: fim } },
      select: { casamentoData: true },
    }),
    db.atendimento.findMany({
      where: { tipo: "PROVA", inicio: { gte: inicio, lt: fim } },
      select: { inicio: true },
    }),
    db.atendimento.findMany({
      where: { tipo: "ATENDIMENTO", inicio: { gte: inicio, lt: fim } },
      select: { inicio: true },
    }),
  ]);

  const marcadores: Marcador[] = [];
  for (const c of casamentos) {
    if (c.casamentoData) marcadores.push({ ymd: ymd(c.casamentoData)!, tipo: "casamento" });
  }
  for (const p of provas) marcadores.push({ ymd: ymd(p.inicio)!, tipo: "prova" });
  for (const a of atendimentos) marcadores.push({ ymd: ymd(a.inicio)!, tipo: "atendimento" });
  return marcadores;
}

export type ItemDia =
  | { tipo: "casamento"; noivaNome: string | null }
  | { tipo: "prova"; hora: number }
  | { tipo: "atendimento"; hora: number };

export type DiaComItens = {
  itens: ItemDia[]; // casamento(s) primeiro, depois prova/atendimento por hora
  temFinanceiro: boolean; // há conta vencendo no dia (só quando financeiro=true)
  atencao: boolean; // dia passado com financeiro PREVISTA OU prova/atend. em aberto
};

/**
 * Mini-agenda por dia em [inicio, fim). Casamentos primeiro (com nome), depois provas
 * e atendimentos por horário. `temFinanceiro` (só com financeiro=true) marca dias com
 * conta vencendo. `atencao` marca dias PASSADOS com pendência (financeiro em aberto ou
 * prova/atendimento não concluído). Escopo de loja.
 */
export async function itensDoMes(
  lojaId: string,
  inicio: Date,
  fim: Date,
  opts: { financeiro: boolean },
): Promise<Map<string, DiaComItens>> {
  const db = tenantPrisma(prisma, lojaId);
  const [casamentos, ags, parcelas, contas] = await Promise.all([
    db.bloqueioVestido.findMany({
      where: { tipo: "RESERVA_CASAMENTO", casamentoData: { gte: inicio, lt: fim } },
      include: { lead: { select: { noivaNome: true } } },
    }),
    db.atendimento.findMany({
      where: { inicio: { gte: inicio, lt: fim } },
      select: { inicio: true, tipo: true, situacao: true },
    }),
    opts.financeiro
      ? db.parcela.findMany({ where: { vencimento: { gte: inicio, lt: fim } }, select: { vencimento: true, status: true } })
      : Promise.resolve([] as { vencimento: Date; status: string }[]),
    opts.financeiro
      ? db.contaPagar.findMany({ where: { vencimento: { gte: inicio, lt: fim } }, select: { vencimento: true, status: true } })
      : Promise.resolve([] as { vencimento: Date; status: string }[]),
  ]);

  const hojeMs = hojeUTC().getTime();
  const mapa = new Map<string, DiaComItens>();
  const get = (dia: string): DiaComItens => {
    let d = mapa.get(dia);
    if (!d) { d = { itens: [], temFinanceiro: false, atencao: false }; mapa.set(dia, d); }
    return d;
  };
  const passou = (dia: string) => new Date(`${dia}T00:00:00.000Z`).getTime() < hojeMs;

  for (const c of casamentos) {
    const dia = ymd(c.casamentoData);
    if (dia) get(dia).itens.push({ tipo: "casamento", noivaNome: c.lead?.noivaNome ?? null });
  }
  for (const a of ags) {
    const dia = ymd(a.inicio)!;
    const d = get(dia);
    const hora = a.inicio.getUTCHours();
    d.itens.push(a.tipo === "PROVA" ? { tipo: "prova", hora } : { tipo: "atendimento", hora });
    if (passou(dia) && (a.situacao === "AGENDADO" || a.situacao === "EM_ATENDIMENTO")) d.atencao = true;
  }
  for (const p of [...parcelas, ...contas]) {
    const dia = ymd(p.vencimento)!;
    const d = get(dia);
    d.temFinanceiro = true;
    if (passou(dia) && p.status === "PREVISTA") d.atencao = true;
  }
  // Ordena: casamento primeiro, depois por hora.
  for (const d of mapa.values()) {
    d.itens.sort((x, y) => {
      const peso = (i: ItemDia) => (i.tipo === "casamento" ? -1 : i.hora);
      return peso(x) - peso(y);
    });
  }
  return mapa;
}

export type AtendimentoCalendario = {
  id: string;
  inicio: Date;
  situacao: AtendimentoSituacao;
  noivaNome: string | null;
  leadId: string;
};

/** Atendimentos da loja com início em [inicio, fim), por horário asc. */
export async function atendimentosNoIntervalo(
  lojaId: string,
  inicio: Date,
  fim: Date,
): Promise<AtendimentoCalendario[]> {
  const rows = await tenantPrisma(prisma, lojaId).atendimento.findMany({
    where: { tipo: "ATENDIMENTO", inicio: { gte: inicio, lt: fim } },
    orderBy: { inicio: "asc" },
    include: { lead: { select: { noivaNome: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    situacao: a.situacao,
    noivaNome: a.lead?.noivaNome ?? null,
    leadId: a.leadId,
  }));
}
