// src/app/(app)/loja/[lojaId]/agenda/page.tsx
// Agenda do atelier — os compromissos das reservas (prova, uso/casamento,
// higienização) dos próximos dias, derivados do motor. Leitura calma agrupada por
// mês: o que pede a mão do atelier, em ordem. Gate em leads:ver.
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirAcesso } from "@/lib/server/acoes";
import { agendaDoAtelier, type EventoAgenda } from "@/lib/disponibilidade/agenda";

export const dynamic = "force-dynamic";

const HORIZONTE_DIAS = 60;
const DIA_MS = 86_400_000;

// Hoje como meia-noite UTC do dia-calendário em São Paulo (mesma convenção do dado).
function hojeUTC(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

// UTC: as datas das janelas nascem em meia-noite UTC — formatar em UTC evita off-by-one.
const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const mesAbrev = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

function chaveMes(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

function periodo(e: EventoAgenda): string {
  if (e.abertoFim) return `a partir de ${diaMes.format(e.inicio)}`;
  return `de ${diaMes.format(e.inicio)} a ${diaMes.format(e.fim)}`;
}

type GrupoAgenda = { chave: string; rotulo: string; eventos: EventoAgenda[] };

// Agrupa eventos (já ordenados por início) em meses, preservando a ordem.
function agruparPorMes(eventos: EventoAgenda[]): GrupoAgenda[] {
  const grupos: GrupoAgenda[] = [];
  for (const e of eventos) {
    const chave = chaveMes(e.inicio);
    let grupo = grupos.find((g) => g.chave === chave);
    if (!grupo) {
      grupo = { chave, rotulo: mesAno.format(e.inicio), eventos: [] };
      grupos.push(grupo);
    }
    grupo.eventos.push(e);
  }
  return grupos;
}

// "Esta semana" (do que está em curso até hoje+7) ganha um grupo próprio no topo —
// o coração do dia (§8.4). O resto segue agrupado por mês.
function agruparAgenda(eventos: EventoAgenda[]): GrupoAgenda[] {
  const fimSemana = new Date(hojeUTC().getTime() + 7 * DIA_MS);
  const semana = eventos.filter((e) => e.inicio.getTime() <= fimSemana.getTime());
  const resto = eventos.filter((e) => e.inicio.getTime() > fimSemana.getTime());
  const grupos: GrupoAgenda[] = [];
  if (semana.length) grupos.push({ chave: "semana", rotulo: "Esta semana", eventos: semana });
  grupos.push(...agruparPorMes(resto));
  return grupos;
}

export default async function AgendaPage({ params }: { params: Promise<{ lojaId: string }> }) {
  const sc = await exigirAcesso("leads");

  const { lojaId } = await params;
  const eventos = await agendaDoAtelier(sc.loja.id, HORIZONTE_DIAS);
  const grupos = agruparAgenda(eventos);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={`/loja/${lojaId}`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← {sc.loja.nome}
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Agenda</h1>
        <p className="text-[14px] text-cinza-fumo">
          Os cuidados das reservas nos próximos {HORIZONTE_DIAS} dias.
        </p>
      </header>

      {eventos.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] text-tinta">Nada agendado por aqui.</p>
          <p className="max-w-[46ch] text-[13px] text-cinza-fumo">
            Quando uma noiva reservar um vestido, as provas, o uso e a higienização aparecem aqui,
            em ordem.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {grupos.map((grupo) => (
            <section key={grupo.chave} className="flex flex-col gap-3">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo first-letter:uppercase">
                {grupo.rotulo}
              </h2>
              <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
                {grupo.eventos.map((e, idx) => (
                  <li key={`${e.vestidoId}-${e.tipo}-${idx}`} className="flex gap-4 px-4 py-3">
                    {/* Âncora de data: dia grande + mês curto. O "uso/casamento" — o
                        grande dia — ganha o bordô (a joia com significado, §6). */}
                    <div className="flex w-11 shrink-0 flex-col items-center">
                      <span
                        className={`font-display text-[20px] font-light leading-none tabular-nums ${
                          e.tipo === "uso" ? "text-bordo" : "text-tinta"
                        }`}
                      >
                        {e.inicio.getUTCDate()}
                      </span>
                      <span className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-cinza-fumo">
                        {mesAbrev.format(e.inicio).replace(".", "")}
                      </span>
                    </div>
                    {/* Empilha no mobile (conteúdo / período); vira linha a partir de sm */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[14px] text-tinta">{e.rotulo}</span>
                          {e.noivaNome && (
                            <span className="text-[13px] text-cinza-fumo">{e.noivaNome}</span>
                          )}
                        </span>
                        <Link
                          href={`/loja/${lojaId}/vestidos/${e.vestidoId}`}
                          className="w-fit rounded-sm text-[12px] text-grafite underline decoration-borda
                            underline-offset-4 transition-colors duration-150 hover:text-tinta
                            hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2
                            focus-visible:outline-bordo"
                        >
                          {e.vestidoCodigo} · {e.vestidoNome}
                        </Link>
                      </div>
                      <span className="shrink-0 text-[12px] tabular-nums text-cinza-fumo sm:text-right">
                        {periodo(e)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
