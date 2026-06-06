// Aba Mês — a grade do mês de relance. Cada dia traz marcadores delicados (um ponto
// por tipo): bordô = casamento (o grande dia, §6), champagne = prova, grafite =
// atendimento. Navegação ‹ mês › preserva a aba na URL.
import Link from "next/link";
import { hojeYMD } from "@/lib/tempo";
import {
  gradeDoMes,
  mesDeRef,
  refDoMes,
  mesVizinho,
  agruparMarcadoresPorDia,
  type TipoMarcador,
} from "@/lib/calendario/mes";
import { marcadoresNoIntervalo } from "@/lib/calendario/dados";

const tituloMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const COR_MARCADOR: Record<TipoMarcador, string> = {
  casamento: "bg-bordo",
  prova: "bg-champagne",
  atendimento: "bg-grafite",
};
const ORDEM_MARCADOR: TipoMarcador[] = ["casamento", "prova", "atendimento"];
const ROTULO_MARCADOR: Record<TipoMarcador, string> = {
  casamento: "Casamento",
  prova: "Prova",
  atendimento: "Atendimento",
};
// [singular, plural] para a contagem do mês — "3 casamentos · 5 provas".
const PLURAL_MARCADOR: Record<TipoMarcador, [string, string]> = {
  casamento: ["casamento", "casamentos"],
  prova: ["prova", "provas"],
  atendimento: ["atendimento", "atendimentos"],
};

export async function AbaMes({ lojaId, refParam }: { lojaId: string; refParam?: string }) {
  const hoje = hojeYMD();
  const { ano, mes0 } = mesDeRef(refParam, hoje);
  const dias = gradeDoMes(ano, mes0, hoje);

  const inicio = dias[0].data;
  const fim = new Date(dias[41].data.getTime());
  fim.setUTCDate(fim.getUTCDate() + 1); // exclusivo

  const marcadores = await marcadoresNoIntervalo(lojaId, inicio, fim);
  const porDia = agruparMarcadoresPorDia(marcadores);

  // Contagem do mês de referência (ignora os dias vazantes dos meses vizinhos).
  const noMes = marcadores.filter((m) => {
    const [a, mm] = m.ymd.split("-");
    return Number(a) === ano && Number(mm) - 1 === mes0;
  });
  const contagem = ORDEM_MARCADOR.map((t) => ({ t, n: noMes.filter((m) => m.tipo === t).length })).filter(
    (c) => c.n > 0,
  );

  const ant = mesVizinho(ano, mes0, -1);
  const prox = mesVizinho(ano, mes0, +1);
  const link = (a: { ano: number; mes0: number }) =>
    `/loja/${lojaId}/calendario?aba=mes&ref=${refDoMes(a.ano, a.mes0)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-[18px] font-light text-tinta first-letter:uppercase">
            {tituloMes.format(dias.find((d) => d.noMes)!.data)}
          </h2>
          {contagem.length > 0 && (
            <p className="text-[12px] text-cinza-fumo">
              {contagem.map((c) => `${c.n} ${PLURAL_MARCADOR[c.t][c.n === 1 ? 0 : 1]}`).join(" · ")} neste mês
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={link(ant)}
            aria-label="Mês anterior"
            className="rounded-md px-2 py-1 text-[14px] text-grafite transition-colors duration-150 hover:bg-papel-suave hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
          >
            ‹
          </Link>
          <Link
            href={link(prox)}
            aria-label="Próximo mês"
            className="rounded-md px-2 py-1 text-[14px] text-grafite transition-colors duration-150 hover:bg-papel-suave hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
          >
            ›
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[var(--mn-radius-md)] border border-borda-suave bg-borda-suave">
        {SEMANA.map((d) => (
          <div key={d} className="bg-papel-elevado py-2 text-center text-[11px] uppercase tracking-[0.1em] text-cinza-fumo">
            {d}
          </div>
        ))}
        {dias.map((dia) => {
          const tipos = porDia.get(dia.ymd);
          const temCasamento = tipos?.has("casamento") ?? false;
          return (
            <div
              key={dia.ymd}
              className={`flex min-h-20 flex-col gap-1 p-1.5 ${dia.hoje ? "bg-papel-suave" : "bg-papel-elevado"} ${dia.noMes ? "" : "opacity-40"}`}
            >
              <span
                className={`text-[12px] tabular-nums ${
                  dia.hoje
                    ? "flex h-5 w-5 items-center justify-center rounded-full bg-bordo text-papel-elevado"
                    : temCasamento
                      ? "font-medium text-bordo"
                      : "text-grafite"
                }`}
              >
                {dia.data.getUTCDate()}
              </span>
              {tipos && (
                <span className="mt-auto flex flex-wrap gap-1">
                  {ORDEM_MARCADOR.filter((t) => tipos.has(t)).map((t) => (
                    <span key={t} className={`h-1.5 w-1.5 rounded-full ${COR_MARCADOR[t]}`} />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-cinza-fumo">
        {ORDEM_MARCADOR.map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${COR_MARCADOR[t]}`} /> {ROTULO_MARCADOR[t]}
          </span>
        ))}
      </div>
    </div>
  );
}
