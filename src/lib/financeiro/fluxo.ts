// src/lib/financeiro/fluxo.ts
// Fluxo de caixa (S7) — LEITURA PURA, nenhuma escrita. Consolida o que a S4 (receber) e a
// S5 (pagar) gravaram: o dinheiro que DE FATO entrou (parcela PAGA, por `recebidoEm`) e saiu
// (Pagamento, por `data`), por competência do MOVIMENTO (não do vencimento). Não é extrato
// bancário — sem saldo inicial, sem conciliação (roadmap §10). O "em aberto" (previsto) vem
// dos resumos da S4/S5 como horizonte, separado do realizado.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { deCentavos, decParaCentavos } from "@/lib/dinheiro";
import { competenciaValida, competenciaRange, competenciaAtual } from "@/lib/financeiro/datas";
import { resumoReceber } from "@/lib/financeiro/receber";
import { resumoPagar } from "@/lib/financeiro/pagar";

export type ResumoCaixa = { entradas: string; saidas: string; saldo: string }; // saldo pode ser negativo
export type Movimento = {
  id: string;
  tipo: "ENTRADA" | "SAIDA";
  data: Date;
  valor: string;
  descricao: string;
  rotulo: string | null;
  href: string | null;
};
export type PontoTendencia = { competencia: string; entradas: string; saidas: string; saldo: string };
export type HorizonteAberto = { aReceber: string; aReceberAtraso: string; aPagar: string; aPagarAtraso: string };

const ZERO_CAIXA: ResumoCaixa = { entradas: "0.00", saidas: "0.00", saldo: "0.00" };

/** Entradas/saídas/saldo realizados na competência do movimento. Saldo pode ser negativo. */
export async function resumoCaixa(lojaId: string, competencia: string): Promise<ResumoCaixa> {
  if (!competenciaValida(competencia)) return ZERO_CAIXA;
  const { gte, lt } = competenciaRange(competencia);
  const db = tenantPrisma(prisma, lojaId);
  const [ent, sai] = await Promise.all([
    db.parcela.aggregate({ where: { status: "PAGA", recebidoEm: { gte, lt } }, _sum: { valorRecebido: true } }),
    db.pagamento.aggregate({ where: { data: { gte, lt } }, _sum: { valorPago: true } }),
  ]);
  const entradasC = decParaCentavos(ent._sum.valorRecebido);
  const saidasC = decParaCentavos(sai._sum.valorPago);
  return { entradas: deCentavos(entradasC), saidas: deCentavos(saidasC), saldo: deCentavos(entradasC - saidasC) };
}

/** Linha do tempo unificada do mês (entradas + saídas), mais recente primeiro. */
export async function movimentosDoMes(lojaId: string, competencia: string): Promise<Movimento[]> {
  if (!competenciaValida(competencia)) return [];
  const { gte, lt } = competenciaRange(competencia);
  const db = tenantPrisma(prisma, lojaId);

  const [parcelas, pagamentos] = await Promise.all([
    db.parcela.findMany({
      where: { status: "PAGA", recebidoEm: { gte, lt } },
      include: { contrato: { select: { id: true, lead: { select: { noivaNome: true } } } } },
    }),
    db.pagamento.findMany({
      where: { data: { gte, lt } },
      include: {
        colaborador: { select: { nome: true } },
        itens: { include: { contaPagar: { select: { descricao: true, fornecedor: true, categoria: true } } } },
      },
    }),
  ]);

  const entradas: Movimento[] = parcelas.map((p) => ({
    id: `parcela-${p.id}`,
    tipo: "ENTRADA",
    data: p.recebidoEm!, // garantido pelo filtro de status/recebidoEm
    valor: deCentavos(decParaCentavos(p.valorRecebido)),
    descricao: p.descricao ?? (p.numero === 0 ? "Entrada/sinal" : `Parcela ${p.numero}`),
    rotulo: p.contrato.lead?.noivaNome ?? null,
    href: `/loja/${lojaId}/contratos/${p.contrato.id}`,
  }));

  const saidas: Movimento[] = pagamentos.map((pg) => {
    const contas = pg.itens.map((i) => i.contaPagar).filter(Boolean);
    const descricao = contas.length > 0 ? contas.map((c) => c!.descricao).join(" · ") : "Pagamento";
    const rotulo =
      pg.colaborador?.nome ?? contas.find((c) => c!.fornecedor)?.fornecedor ?? contas.find((c) => c!.categoria)?.categoria ?? null;
    return {
      id: `pagamento-${pg.id}`,
      tipo: "SAIDA",
      data: pg.data,
      valor: deCentavos(decParaCentavos(pg.valorPago)),
      descricao,
      rotulo,
      href: `/loja/${lojaId}/financeiro/pagar?filtro=todas`,
    };
  });

  return [...entradas, ...saidas].sort((a, b) => b.data.getTime() - a.data.getTime());
}

/** Lista de competências "YYYY-MM" terminando no mês de `ate`, do mais antigo ao mais recente. */
function ultimasCompetencias(ate: string, meses: number): string[] {
  const y = Number(ate.slice(0, 4));
  const m = Number(ate.slice(5, 7)); // 1..12
  const out: string[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Saldo por mês dos últimos N meses (default 6), em ordem ascendente. Mês sem movimento = zeros.
 *  Duas queries no intervalo todo (não 2 por mês), com o bucket por competência feito em memória. */
export async function tendenciaCaixa(lojaId: string, opts: { meses?: number; ate?: string } = {}): Promise<PontoTendencia[]> {
  const meses = Math.max(1, Math.min(24, opts.meses ?? 6));
  const ate = competenciaValida(opts.ate ?? "") ? opts.ate! : competenciaAtual();
  const comps = ultimasCompetencias(ate, meses);
  const { gte } = competenciaRange(comps[0]);
  const { lt } = competenciaRange(comps[comps.length - 1]);
  const db = tenantPrisma(prisma, lojaId);

  const [parcelas, pagamentos] = await Promise.all([
    db.parcela.findMany({ where: { status: "PAGA", recebidoEm: { gte, lt } }, select: { recebidoEm: true, valorRecebido: true } }),
    db.pagamento.findMany({ where: { data: { gte, lt } }, select: { data: true, valorPago: true } }),
  ]);

  const porMes = new Map<string, { ent: number; sai: number }>();
  const bucket = (k: string) => porMes.get(k) ?? porMes.set(k, { ent: 0, sai: 0 }).get(k)!;
  for (const p of parcelas) bucket(p.recebidoEm!.toISOString().slice(0, 7)).ent += decParaCentavos(p.valorRecebido);
  for (const pg of pagamentos) bucket(pg.data.toISOString().slice(0, 7)).sai += decParaCentavos(pg.valorPago);

  return comps.map((competencia) => {
    const { ent, sai } = porMes.get(competencia) ?? { ent: 0, sai: 0 };
    return { competencia, entradas: deCentavos(ent), saidas: deCentavos(sai), saldo: deCentavos(ent - sai) };
  });
}

/** O que ainda está em aberto (previsão), reusando os resumos da S4/S5. Não é caixa realizado. */
export async function horizonteAberto(lojaId: string): Promise<HorizonteAberto> {
  const [rec, pag] = await Promise.all([resumoReceber(lojaId), resumoPagar(lojaId)]);
  return {
    aReceber: rec.totalAReceber,
    aReceberAtraso: rec.emAtraso,
    aPagar: pag.totalAPagar,
    aPagarAtraso: pag.emAtraso,
  };
}
