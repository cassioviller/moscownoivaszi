// src/lib/loja/painel.ts
//
// Dados do dashboard ("mesa do atelier"). Tudo é dado REAL já existente: o
// estágio da jornada de cada noiva é DERIVADO dos fatos (interesse, reservas/
// provas, marcos e data do casamento) por estagioDaNoiva, não lido de uma
// coluna. O dashboard agrega esses estágios e mostra os casamentos próximos.
//
// SEGURANÇA: Lead e Vestido são tenant models — toda leitura passa pelo guard
// tenantPrisma (isolamento por loja).
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import {
  estagioDaNoiva,
  noivaAtiva,
  ROTULO_ESTAGIO,
  ESTAGIOS,
  type EstagioChave,
} from "@/lib/leads/jornada";
import { fatosDeLead, INCLUDE_JORNADA } from "@/lib/leads/leads";
import { hojeUTC } from "@/lib/tempo";

// Atenção imediata = casamento muito próximo E ainda com trabalho em aberto
// (em provas ou orçamento aberto). Heurística de urgência aprovada pelo produto.
const ESTAGIOS_ATENCAO = new Set<EstagioChave>(["orcamento_aberto", "em_provas"]);

const DIA_MS = 86_400_000;
const JANELA_PROXIMOS_DIAS = 30;
const JANELA_ATENCAO_DIAS = 14;

export type EtapaJornada = { chave: EstagioChave; rotulo: string; total: number };
export type CasamentoProximo = {
  id: string;
  noivaNome: string;
  data: Date;
  diasRestantes: number;
};
export type Atencao = {
  id: string;
  noivaNome: string;
  rotulo: string;
  data: Date;
  diasRestantes: number;
};
export type Destaque = {
  id: string;
  codigo: string;
  nome: string;
  categoria: string | null;
  versaoFoto: number; // updatedAt da foto 0 — cache-busting na URL
};
export type PainelLoja = {
  noivasAtivas: number;
  vestidos: number;
  emProvas: number;
  casamentosProximos: number; // dentro da janela (30 dias)
  jornada: EtapaJornada[]; // etapas vivas com ao menos 1 noiva, em ordem
  proximosCasamentos: CasamentoProximo[]; // os 5 mais próximos
  atencoes: Atencao[]; // casamento ≤14 dias e ainda em provas/orçamento aberto
  destaque: Destaque | null; // vestido do acervo em destaque (com foto)
};

export async function carregarPainel(lojaId: string): Promise<PainelLoja> {
  const db = tenantPrisma(prisma, lojaId);
  const hoje = hojeUTC();

  const [leads, vestidos, destaqueRow] = await Promise.all([
    db.lead.findMany({ include: INCLUDE_JORNADA }),
    db.vestido.count(),
    db.vestido.findFirst({
      where: { status: "ativo", fotos: { some: { ordem: 0 } } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        codigo: true,
        nome: true,
        categoria: true,
        fotos: { where: { ordem: 0 }, select: { updatedAt: true } },
      },
    }),
  ]);

  type Linha = {
    id: string;
    noivaNome: string;
    casamentoData: Date | null;
    atual: EstagioChave;
    encerrada: string | null;
  };
  const linhas: Linha[] = leads.map((l) => {
    // Mesma derivação da jornada da noiva (fonte única em leads.ts) — sem cópia.
    const { atual, encerrada } = estagioDaNoiva(fatosDeLead(l, hoje));
    return { id: l.id, noivaNome: l.noivaNome, casamentoData: l.casamentoData, atual, encerrada };
  });

  const ativas = linhas.filter((l) => noivaAtiva(l.atual, l.encerrada));
  const noivasAtivas = ativas.length;

  const totalPorEstagio = new Map<EstagioChave, number>();
  for (const l of ativas) totalPorEstagio.set(l.atual, (totalPorEstagio.get(l.atual) ?? 0) + 1);
  const jornada: EtapaJornada[] = ESTAGIOS.filter((c) => (totalPorEstagio.get(c) ?? 0) > 0).map(
    (chave) => ({ chave, rotulo: ROTULO_ESTAGIO[chave], total: totalPorEstagio.get(chave) ?? 0 }),
  );

  const emProvas = totalPorEstagio.get("em_provas") ?? 0;

  const futuros = linhas
    .filter((l) => l.casamentoData !== null && l.casamentoData.getTime() >= hoje.getTime())
    .sort((a, b) => a.casamentoData!.getTime() - b.casamentoData!.getTime());

  const proximosCasamentos: CasamentoProximo[] = futuros.slice(0, 5).map((l) => ({
    id: l.id,
    noivaNome: l.noivaNome,
    data: l.casamentoData!,
    diasRestantes: Math.round((l.casamentoData!.getTime() - hoje.getTime()) / DIA_MS),
  }));

  const limite = hoje.getTime() + JANELA_PROXIMOS_DIAS * DIA_MS;
  const casamentosProximos = futuros.filter((l) => l.casamentoData!.getTime() <= limite).length;

  const limiteAtencao = hoje.getTime() + JANELA_ATENCAO_DIAS * DIA_MS;
  const atencoes: Atencao[] = futuros
    .filter(
      (l) =>
        noivaAtiva(l.atual, l.encerrada) &&
        ESTAGIOS_ATENCAO.has(l.atual) &&
        l.casamentoData!.getTime() <= limiteAtencao,
    )
    .map((l) => ({
      id: l.id,
      noivaNome: l.noivaNome,
      rotulo: ROTULO_ESTAGIO[l.atual],
      data: l.casamentoData!,
      diasRestantes: Math.round((l.casamentoData!.getTime() - hoje.getTime()) / DIA_MS),
    }));

  const destaque: Destaque | null = destaqueRow
    ? {
        id: destaqueRow.id,
        codigo: destaqueRow.codigo,
        nome: destaqueRow.nome,
        categoria: destaqueRow.categoria,
        versaoFoto: destaqueRow.fotos[0]?.updatedAt.getTime() ?? 0,
      }
    : null;

  return { noivasAtivas, vestidos, emProvas, casamentosProximos, jornada, proximosCasamentos, atencoes, destaque };
}
