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
  type PassoJornada,
} from "@/lib/leads/jornada";
import { fatosDeLead, INCLUDE_JORNADA } from "@/lib/leads/leads";
import { escolherDestaque, type CandidataDestaque } from "@/lib/leads/jornada-destaque";
import { hojeUTC } from "@/lib/tempo";
import { diasAteCasamento, JANELA_URGENCIA_DIAS } from "@/lib/leads/contagem-casamento";

// Atenção imediata = casamento muito próximo E ainda com trabalho em aberto
// (em provas ou orçamento aberto). Heurística de urgência aprovada pelo produto.
const ESTAGIOS_ATENCAO = new Set<EstagioChave>(["orcamento_aberto", "em_provas"]);

const JANELA_PROXIMOS_DIAS = 30; // contador "casamentos da semana/mês" do dashboard
// A janela de atenção (≤14d) vem do helper canônico JANELA_URGENCIA_DIAS.

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
export type DestaqueJornada = { noivaNome: string; passos: PassoJornada[]; encerrada: string | null };
export type PainelLoja = {
  noivasAtivas: number;
  vestidos: number;
  emProvas: number;
  casamentosProximos: number; // dentro da janela (30 dias)
  jornada: EtapaJornada[]; // etapas vivas com ao menos 1 noiva, em ordem
  proximosCasamentos: CasamentoProximo[]; // os 5 mais próximos
  atencoes: Atencao[]; // casamento ≤14 dias e ainda em provas/orçamento aberto
  destaque: Destaque | null; // vestido do acervo em destaque (com foto)
  destaqueJornada: DestaqueJornada | null; // noiva ativa com casamento mais próximo, p/ linha do tempo
};

export async function carregarPainel(lojaId: string): Promise<PainelLoja> {
  const db = tenantPrisma(prisma, lojaId);
  const hoje = hojeUTC();
  const hojeMs = hoje.getTime();

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
    passos: PassoJornada[];
  };
  const linhas: Linha[] = leads.map((l) => {
    // Mesma derivação da jornada da noiva (fonte única em leads.ts) — sem cópia.
    const { atual, encerrada, passos } = estagioDaNoiva(fatosDeLead(l, hoje));
    return { id: l.id, noivaNome: l.noivaNome, casamentoData: l.casamentoData, atual, encerrada, passos };
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
    diasRestantes: diasAteCasamento(l.casamentoData!, hojeMs),
  }));

  const casamentosProximos = futuros.filter(
    (l) => diasAteCasamento(l.casamentoData!, hojeMs) <= JANELA_PROXIMOS_DIAS,
  ).length;

  const atencoes: Atencao[] = futuros
    .filter(
      (l) =>
        noivaAtiva(l.atual, l.encerrada) &&
        ESTAGIOS_ATENCAO.has(l.atual) &&
        diasAteCasamento(l.casamentoData!, hojeMs) <= JANELA_URGENCIA_DIAS,
    )
    .map((l) => ({
      id: l.id,
      noivaNome: l.noivaNome,
      rotulo: ROTULO_ESTAGIO[l.atual],
      data: l.casamentoData!,
      diasRestantes: diasAteCasamento(l.casamentoData!, hojeMs),
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

  // Noiva em destaque na linha do tempo: a ATIVA com casamento futuro mais
  // próximo (a mais urgente). Os passos vêm da MESMA derivação acima (linhas),
  // sem recalcular a jornada.
  const candidatas: CandidataDestaque[] = linhas.map((l) => ({
    id: l.id,
    noivaNome: l.noivaNome,
    casamentoData: l.casamentoData,
    ativa: noivaAtiva(l.atual, l.encerrada),
  }));
  const escolhida = escolherDestaque(candidatas, hoje);
  const linhaEscolhida = escolhida ? linhas.find((l) => l.id === escolhida.id) : undefined;
  const destaqueJornada: DestaqueJornada | null = linhaEscolhida
    ? { noivaNome: linhaEscolhida.noivaNome, passos: linhaEscolhida.passos, encerrada: linhaEscolhida.encerrada }
    : null;

  return {
    noivasAtivas,
    vestidos,
    emProvas,
    casamentosProximos,
    jornada,
    proximosCasamentos,
    atencoes,
    destaque,
    destaqueJornada,
  };
}
