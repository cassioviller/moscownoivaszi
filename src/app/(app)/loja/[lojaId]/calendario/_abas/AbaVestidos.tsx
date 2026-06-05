// Aba Vestidos fora — a timeline do acervo: uma linha por vestido, barras mostrando
// quando cada peça está fora (preparação → uso → higienização → manutenção) nos
// próximos 60 dias. Bordô reservado ao uso/casamento. Dado pronto via agendaDoAtelier.
import Link from "next/link";
import { hojeUTC } from "@/lib/tempo";
import { agendaDoAtelier } from "@/lib/disponibilidade/agenda";
import { montarGantt, type BarraGantt } from "@/lib/calendario/gantt";
import type { TipoJanela } from "@/lib/disponibilidade/tipos";

const HORIZONTE_DIAS = 60;

const COR_BARRA: Record<TipoJanela, string> = {
  preparacao: "bg-rose-dust",
  uso: "bg-bordo",
  lavagem: "bg-champagne",
  manutencao: "bg-grafite/40",
};

function tituloBarra(b: BarraGantt): string {
  return b.abertoFim ? `${b.rotulo} (em aberto)` : b.rotulo;
}

export async function AbaVestidos({ lojaId }: { lojaId: string }) {
  const eventos = await agendaDoAtelier(lojaId, HORIZONTE_DIAS);
  const linhas = montarGantt(eventos, hojeUTC(), HORIZONTE_DIAS);

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

      <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
        {linhas.map((l) => (
          <li key={l.vestidoId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <Link
              href={`/loja/${lojaId}/vestidos/${l.vestidoId}`}
              className="w-full shrink-0 rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne sm:w-44"
            >
              {l.vestidoCodigo} · {l.vestidoNome}
              {l.noivaNome && <span className="block text-[12px] text-cinza-fumo no-underline">{l.noivaNome}</span>}
            </Link>
            <div className="relative h-6 flex-1 rounded-full bg-papel-suave">
              {l.barras.map((b, i) => (
                <span
                  key={i}
                  title={tituloBarra(b)}
                  className={`absolute top-1 bottom-1 rounded-full ${COR_BARRA[b.tipo]}`}
                  style={{ left: `${b.inicioPct}%`, width: `${b.larguraPct}%` }}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-cinza-fumo">
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full bg-rose-dust" /> Preparação</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full bg-bordo" /> Uso / casamento</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full bg-champagne" /> Higienização</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full bg-grafite/40" /> Manutenção</span>
      </div>
    </div>
  );
}
