// src/lib/disponibilidade/agenda.ts
// Agenda do atelier: projeta as reservas em compromissos reais (prova, uso/casamento,
// lavagem) reusando o motor puro (calcularJanelas). Não há entidade de "agendamento"
// no banco — a agenda é DERIVADA dos bloqueios + regras da loja. Leitura só; escopo
// de loja via tenantPrisma.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import type { TipoJanela } from "./tipos";
import { calcularJanelas, FUTURO_DISTANTE } from "./motor";
import { parseDiaUTC, addDias } from "./datas";
import { obterRegras, toBloqueio } from "./reservas";

export const ROTULO_JANELA: Record<TipoJanela, string> = {
  preparacao: "Preparação / provas",
  uso: "Uso / casamento",
  lavagem: "Higienização",
  manutencao: "Manutenção",
};

export type EventoAgenda = {
  tipo: TipoJanela;
  rotulo: string;
  inicio: Date;
  fim: Date;
  abertoFim: boolean; // janela sem fim definido (vestido fora por tempo indeterminado)
  vestidoId: string;
  vestidoNome: string;
  vestidoCodigo: string;
  noivaNome: string | null;
};

// Hoje como meia-noite UTC do dia-calendário em São Paulo (mesma convenção do painel
// e das datas gravadas) — evita off-by-one ao comparar com as janelas projetadas.
function hojeUTC(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parseDiaUTC(ymd);
}

/**
 * Compromissos do atelier que tocam a janela [hoje, hoje+horizonte]. Cada reserva
 * vira de 1 a 3 eventos (prova/uso/lavagem). Bloqueios malformados são pulados —
 * a agenda nunca quebra por um dado ruim (eles já aparecem barrados na reserva).
 */
export async function agendaDoAtelier(
  lojaId: string,
  horizonteDias = 60,
): Promise<EventoAgenda[]> {
  const db = tenantPrisma(prisma, lojaId);
  const [regras, bloqueios] = await Promise.all([
    obterRegras(lojaId),
    db.bloqueioVestido.findMany({
      include: {
        vestido: { select: { id: true, codigo: true, nome: true } },
        lead: { select: { noivaNome: true } },
      },
    }),
  ]);

  const hoje = hojeUTC();
  const limite = addDias(hoje, horizonteDias);
  const eventos: EventoAgenda[] = [];

  for (const b of bloqueios) {
    let janelas;
    try {
      janelas = calcularJanelas(toBloqueio(b), regras);
    } catch {
      continue; // dado malformado: não derruba a agenda
    }
    for (const j of janelas) {
      if (j.fim < hoje || j.inicio > limite) continue; // fora da janela visível
      eventos.push({
        tipo: j.tipo,
        rotulo: ROTULO_JANELA[j.tipo],
        inicio: j.inicio,
        fim: j.fim,
        abertoFim: j.fim.getTime() === FUTURO_DISTANTE.getTime(),
        vestidoId: b.vestidoId,
        vestidoNome: b.vestido.nome,
        vestidoCodigo: b.vestido.codigo,
        noivaNome: b.lead?.noivaNome ?? null,
      });
    }
  }

  eventos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  return eventos;
}
