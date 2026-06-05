// Aba Vestidos fora — a timeline do acervo: uma linha por vestido, barras mostrando
// quando cada peça está fora (preparação → uso → higienização → manutenção) nos
// próximos 60 dias. Bordô reservado ao uso/casamento. Dado pronto via agendaDoAtelier.
import Link from "next/link";
import { hojeUTC } from "@/lib/tempo";
import { agendaDoAtelier, ROTULO_JANELA } from "@/lib/disponibilidade/agenda";
import { montarGantt, eixoGantt, type BarraGantt, type LinhaGantt } from "@/lib/calendario/gantt";
import type { TipoJanela } from "@/lib/disponibilidade/tipos";

const HORIZONTE_DIAS = 60;
const N_TICKS = 5; // marcas de data no eixo (passo de 12 dias em 60)

const COR_BARRA: Record<TipoJanela, string> = {
  preparacao: "bg-rose-dust",
  uso: "bg-bordo",
  lavagem: "bg-champagne",
  manutencao: "bg-grafite/40",
};

const ORDEM_BARRA: TipoJanela[] = ["preparacao", "uso", "lavagem", "manutencao"];

const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const fmtDia = (d: Date) => fmtData.format(d).replace(" de ", " ").replace(".", "");

function tituloBarra(b: BarraGantt): string {
  return b.abertoFim ? `${b.rotulo} (em aberto)` : b.rotulo;
}

function periodoBarra(b: BarraGantt): string {
  return b.abertoFim ? `a partir de ${fmtDia(b.inicio)}` : `${fmtDia(b.inicio)} – ${fmtDia(b.fim)}`;
}

// Período da peça fora: do início mais cedo ao fim mais tarde (ou "a partir de"
// quando alguma janela é aberta — vestido fora por tempo indeterminado).
function periodoLinha(l: LinhaGantt): string {
  const ini = l.barras.reduce((m, b) => (b.inicio < m ? b.inicio : m), l.barras[0].inicio);
  if (l.barras.some((b) => b.abertoFim)) return `a partir de ${fmtDia(ini)}`;
  const fim = l.barras.reduce((m, b) => (b.fim > m ? b.fim : m), l.barras[0].fim);
  return `${fmtDia(ini)} – ${fmtDia(fim)}`;
}

export async function AbaVestidos({ lojaId }: { lojaId: string }) {
  const inicioJanela = hojeUTC();
  const eventos = await agendaDoAtelier(lojaId, HORIZONTE_DIAS);
  const linhas = montarGantt(eventos, inicioJanela, HORIZONTE_DIAS);
  const eixo = eixoGantt(inicioJanela, HORIZONTE_DIAS, N_TICKS);

  if (linhas.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[15px] text-tinta">Nenhum vestido fora nos próximos {HORIZONTE_DIAS} dias.</p>
        <p className="max-w-[46ch] text-[13px] text-cinza-fumo">
          Quando uma noiva reservar um vestido, o tempo em que a peça fica fora aparece aqui, em faixas.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-cinza-fumo">Próximos {HORIZONTE_DIAS} dias · cada faixa é o tempo que a peça fica fora.</p>

      {/* Eixo de tempo — datas alinhadas à faixa (desktop). */}
      <div className="hidden items-center gap-4 px-4 sm:flex">
        <div className="w-44 shrink-0" />
        <div className="relative h-4 flex-1">
          {eixo.map((t, i) => (
            <span
              key={i}
              className="absolute top-0 text-[11px] tabular-nums whitespace-nowrap text-cinza-fumo"
              style={{ left: `${t.posPct}%` }}
            >
              {fmtDia(t.data)}
            </span>
          ))}
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
        {linhas.map((l) => (
          <li key={l.vestidoId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <Link
              href={`/loja/${lojaId}/vestidos/${l.vestidoId}`}
              className="w-full shrink-0 rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne sm:w-44"
            >
              {l.vestidoCodigo} · {l.vestidoNome}
              <span className="block text-[12px] text-cinza-fumo no-underline">
                {l.noivaNome ? `${l.noivaNome} · ` : ""}
                {periodoLinha(l)}
              </span>
            </Link>
            <div className="relative h-6 flex-1 rounded-full bg-papel-suave">
              {/* linhas-guia nas datas do eixo */}
              {eixo.map((t, i) =>
                i === 0 ? null : (
                  <span
                    key={`guia-${i}`}
                    className="absolute top-0 bottom-0 w-px bg-borda-suave"
                    style={{ left: `${t.posPct}%` }}
                  />
                ),
              )}
              {l.barras.map((b, i) => (
                <span
                  key={i}
                  title={`${tituloBarra(b)} · ${periodoBarra(b)}`}
                  className={`absolute top-1 bottom-1 rounded-full ${COR_BARRA[b.tipo]}`}
                  style={{ left: `${b.inicioPct}%`, width: `${b.larguraPct}%` }}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-cinza-fumo">
        {ORDEM_BARRA.map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={`h-2 w-3 rounded-full ${COR_BARRA[t]}`} /> {ROTULO_JANELA[t]}
          </span>
        ))}
      </div>
    </div>
  );
}
