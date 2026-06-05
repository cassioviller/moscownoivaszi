// Aba Atendimentos — a semana de consultas: colunas de dia × linhas de hora, blocos
// de 60min. Cada bloco mostra a noiva; cor por situação (bordô só no agendado, foco
// do dia). Navegação ‹ semana › preserva a aba na URL.
import Link from "next/link";
import { hojeYMD } from "@/lib/tempo";
import {
  diasDaSemana,
  semanaDeRef,
  refDaSemana,
  chaveCelula,
  indexarPorCelula,
} from "@/lib/calendario/semana";
import { atendimentosNoIntervalo, type AtendimentoCalendario } from "@/lib/calendario/dados";
import { obterHorarioLoja } from "@/lib/atendimentos/cabines";
import type { AtendimentoSituacao } from "@/generated/prisma/client";

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

const COR_SITUACAO: Record<AtendimentoSituacao, string> = {
  AGENDADO: "bg-bordo text-papel-elevado",
  EM_ATENDIMENTO: "bg-rose-dust text-tinta",
  CONCLUIDO: "bg-papel-suave text-grafite",
  FALTOU: "bg-papel-suave text-cinza-fumo line-through",
};

export async function AbaAtendimentos({ lojaId, refParam }: { lojaId: string; refParam?: string }) {
  const hoje = hojeYMD();
  const inicioSemana = semanaDeRef(refParam, hoje);
  const dias = diasDaSemana(inicioSemana);

  const { abertura, fechamento } = await obterHorarioLoja(lojaId);
  const horas = Array.from({ length: Math.max(0, fechamento - abertura) }, (_, i) => abertura + i);

  const fim = new Date(dias[6].getTime());
  fim.setUTCDate(fim.getUTCDate() + 1); // exclusivo (fim do sábado)

  const atendimentos = await atendimentosNoIntervalo(lojaId, inicioSemana, fim);
  const porCelula = indexarPorCelula<AtendimentoCalendario>(atendimentos);

  const anterior = new Date(inicioSemana.getTime());
  anterior.setUTCDate(anterior.getUTCDate() - 7);
  const proxima = new Date(inicioSemana.getTime());
  proxima.setUTCDate(proxima.getUTCDate() + 7);
  const link = (d: Date) => `/loja/${lojaId}/calendario?aba=atendimentos&ref=${refDaSemana(d)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[16px] font-light text-tinta">
            {diaMes.format(dias[0])} – {diaMes.format(dias[6])}
          </h2>
          <p className="text-[12px] text-cinza-fumo">
            {atendimentos.length === 0
              ? "Nenhum atendimento nesta semana."
              : `${atendimentos.length} ${atendimentos.length === 1 ? "atendimento" : "atendimentos"} nesta semana.`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link href={link(anterior)} aria-label="Semana anterior" className="rounded-md px-2 py-1 text-[14px] text-grafite transition-colors duration-150 hover:bg-papel-suave hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">‹</Link>
          <Link href={link(proxima)} aria-label="Próxima semana" className="rounded-md px-2 py-1 text-[14px] text-grafite transition-colors duration-150 hover:bg-papel-suave hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">›</Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        {/* Sem fios verticais: só separadores horizontais de hora — agenda, não planilha. */}
        <div className="grid min-w-[640px] grid-cols-[48px_repeat(7,1fr)] overflow-hidden rounded-[var(--mn-radius-md)] border border-borda-suave">
          {/* cabeçalho */}
          <div className="border-b border-borda-suave bg-papel-elevado" />
          {dias.map((d, i) => {
            const ehHoje = d.toISOString().slice(0, 10) === hoje;
            return (
              <div key={d.toISOString()} className={`border-b border-borda-suave py-2 text-center ${ehHoje ? "bg-papel-suave" : "bg-papel-elevado"}`}>
                <div className="text-[11px] uppercase tracking-[0.1em] text-cinza-fumo">{SEMANA[i]}</div>
                <div className={`text-[13px] tabular-nums ${ehHoje ? "text-bordo" : "text-grafite"}`}>
                  {d.getUTCDate()}
                </div>
              </div>
            );
          })}

          {/* linhas de hora */}
          {horas.map((h, idx) => {
            const fioHora = idx === 0 ? "" : "border-t border-borda-suave";
            return (
              <div key={`linha-${h}`} className="contents">
                <div className={`bg-papel-elevado py-2 pr-1 text-right text-[11px] tabular-nums text-cinza-fumo ${fioHora}`}>
                  {String(h).padStart(2, "0")}h
                </div>
                {dias.map((d) => {
                  const ymd = d.toISOString().slice(0, 10);
                  const itens = porCelula.get(chaveCelula(ymd, h)) ?? [];
                  return (
                    <div key={`${ymd}-${h}`} className={`min-h-12 p-0.5 ${fioHora} ${ymd === hoje ? "bg-papel-suave" : "bg-papel-elevado"}`}>
                      {itens.map((a) => (
                        <Link
                          key={a.id}
                          href={`/loja/${lojaId}/noivas/${a.leadId}`}
                          className={`block truncate rounded-[6px] px-1.5 py-1 text-[11px] transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo ${COR_SITUACAO[a.situacao]}`}
                        >
                          {a.noivaNome ?? "Atendimento"}
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
