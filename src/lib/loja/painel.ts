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
  type FatosJornada,
} from "@/lib/leads/jornada";

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

  const [leads, vestidos, destaqueRow] = await Promise.all([
    db.lead.findMany({
      select: {
        id: true,
        noivaNome: true,
        casamentoData: true,
        orcamentoAbertoEm: true,
        contratoFechadoEm: true,
        perdidaEm: true,
        interesse: { select: { atributos: { select: { atributoId: true } } } },
        atendimentos: { select: { situacao: true } },
        bloqueios: {
          where: { tipo: "RESERVA_CASAMENTO" },
          select: {
            retiradaDataReal: true,
            devolucaoDataReal: true,
            provas: { select: { comparecimento: true } },
          },
        },
      },
    }),
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
    const provas = l.bloqueios.flatMap((b) => b.provas);
    const fatos: FatosJornada = {
      temAtendimentoAgendado: l.atendimentos.some((a) => a.situacao === "AGENDADO"),
      foiAtendida: l.atendimentos.some(
        (a) => a.situacao === "EM_ATENDIMENTO" || a.situacao === "CONCLUIDO",
      ),
      temProvaAgendada: provas.some((p) => p.comparecimento === "AGENDADA"),
      temInteresse: (l.interesse?.atributos.length ?? 0) > 0,
      orcamentoAbertoEm: l.orcamentoAbertoEm,
      contratoFechadoEm: l.contratoFechadoEm,
      temProvaRealizada: provas.some((p) => p.comparecimento === "COMPARECEU"),
      temRetirada: l.bloqueios.some((b) => b.retiradaDataReal !== null),
      casamentoPassou: l.casamentoData !== null && l.casamentoData < hoje,
      temDevolucao: l.bloqueios.some((b) => b.devolucaoDataReal !== null),
      perdidaEm: l.perdidaEm,
    };
    const { atual, encerrada } = estagioDaNoiva(fatos);
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
