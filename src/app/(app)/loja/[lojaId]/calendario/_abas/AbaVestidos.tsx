// Aba Vestidos fora — a timeline do acervo: uma linha por vestido, barras mostrando
// quando cada peça está fora (preparação → uso → higienização → manutenção) no
// período escolhido (padrão: próximos 60 dias). Bordô reservado ao uso/casamento e
// à marca de "hoje". Dado pronto via agendaDoAtelier; janela via ?ini=&fim=.
import Link from "next/link";
import { hojeYMD, meiaNoiteUTC } from "@/lib/tempo";
import { agendaDoAtelier, ROTULO_JANELA } from "@/lib/disponibilidade/agenda";
import { resolverPeriodoVestidos } from "@/lib/calendario/periodo";
import { montarGantt, eixoGantt, type BarraGantt, type LinhaGantt } from "@/lib/calendario/gantt";
import { botaoSuave } from "@/components/ui/acoes";
import type { TipoJanela } from "@/lib/disponibilidade/tipos";

const N_TICKS = 5; // marcas de data no eixo, igualmente espaçadas na janela

// Campo de data do filtro — mesmos estados de foco do design (foco bordô, §6).
const inputData =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta focus:border-tinta focus:outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";

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

export async function AbaVestidos({
  lojaId,
  ini,
  fim,
}: {
  lojaId: string;
  ini?: string;
  fim?: string;
}) {
  const hoje = hojeYMD();
  const { iniYMD, fimYMD, inicio, dias } = resolverPeriodoVestidos(ini, fim, hoje);
  const eventos = await agendaDoAtelier(lojaId, dias, inicio);
  const linhas = montarGantt(eventos, inicio, dias);
  const eixo = eixoGantt(inicio, dias, N_TICKS);

  const periodoLabel = `${fmtDia(inicio)} – ${fmtDia(meiaNoiteUTC(fimYMD))}`;

  // Filtro de período (lente de visualização: ?ini=&fim=). Form GET com hidden
  // aba=vestidos para preservar a aba ao trocar a janela. Pré-preenchido com a
  // janela resolvida (padrão hoje → +60).
  const filtro = (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="aba" value="vestidos" />
      <label className="flex flex-col gap-1 text-[12px] text-cinza-fumo">
        De
        <input name="ini" type="date" defaultValue={iniYMD} aria-label="Início do período" className={`${inputData} w-40`} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-cinza-fumo">
        Até
        <input name="fim" type="date" defaultValue={fimYMD} aria-label="Fim do período" className={`${inputData} w-40`} />
      </label>
      <button type="submit" className={botaoSuave}>
        Ver período
      </button>
    </form>
  );

  if (linhas.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-[18px] font-light text-tinta">Vestidos em movimento</h2>
          <p className="text-[12px] text-cinza-fumo">{periodoLabel}</p>
        </div>
        {filtro}
        <p className="text-[15px] text-tinta">Nenhum vestido fora neste período.</p>
        <p className="max-w-[46ch] text-[13px] text-cinza-fumo">
          Quando uma noiva reservar um vestido, o tempo em que a peça fica fora aparece aqui, em faixas.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-[18px] font-light text-tinta">Vestidos em movimento</h2>
        <p className="text-[12px] text-cinza-fumo">
          {linhas.length} {linhas.length === 1 ? "peça fora" : "peças fora"} · {periodoLabel} · cada faixa é o tempo que a peça fica fora
        </p>
      </div>

      {filtro}

      {/* Eixo de tempo — datas alinhadas à faixa (desktop). */}
      <div className="hidden items-center gap-4 px-4 sm:flex">
        <div className="w-44 shrink-0" />
        <div className="relative h-4 flex-1">
          {eixo.map((t, i) => {
            const ehHoje = t.data.toISOString().slice(0, 10) === hoje;
            return (
              <span
                key={i}
                className={`absolute top-0 text-[11px] tabular-nums whitespace-nowrap ${ehHoje ? "text-bordo" : "text-cinza-fumo"}`}
                style={{ left: `${t.posPct}%` }}
              >
                {ehHoje ? "hoje" : fmtDia(t.data)}
              </span>
            );
          })}
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
        {linhas.map((l) => (
          <li key={l.vestidoId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <Link
              href={`/loja/${lojaId}/vestidos/${l.vestidoId}`}
              className="w-full shrink-0 rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo sm:w-44"
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
