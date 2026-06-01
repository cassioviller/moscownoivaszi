// src/app/(app)/loja/[lojaId]/reservas/page.tsx
// Livro de reservas — todas as noivas com vestido reservado, da mais próxima à
// mais distante, agrupadas por mês. Lente "compromisso" (uma linha por reserva),
// complementar à Agenda (uma linha por janela). Leitura calma; cada reserva linka
// para a noiva e para o vestido. Gate em leads:ver.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarReservasDaLoja, type ReservaDaLoja } from "@/lib/disponibilidade/reservas";

export const dynamic = "force-dynamic";

// UTC: a data nasce em meia-noite UTC — formatar em UTC evita off-by-one.
const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const mesAbrev = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

function chaveMes(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

type Grupo = { chave: string; rotulo: string; reservas: ReservaDaLoja[] };

function agruparPorMes(reservas: ReservaDaLoja[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const r of reservas) {
    if (!r.casamentoData) continue;
    const chave = chaveMes(r.casamentoData);
    let grupo = grupos.find((g) => g.chave === chave);
    if (!grupo) {
      grupo = { chave, rotulo: mesAno.format(r.casamentoData), reservas: [] };
      grupos.push(grupo);
    }
    grupo.reservas.push(r);
  }
  return grupos;
}

export default async function ReservasPage({ params }: { params: Promise<{ lojaId: string }> }) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"))) redirect(`/loja/${sc.loja.id}`);

  const { lojaId } = await params;
  const reservas = await listarReservasDaLoja(sc.loja.id);
  const meses = agruparPorMes(reservas);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={`/loja/${lojaId}`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← {sc.loja.nome}
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Reservas</h1>
        <p className="text-[14px] text-cinza-fumo">
          {reservas.length > 0
            ? `${reservas.length} ${reservas.length === 1 ? "vestido reservado" : "vestidos reservados"} para os próximos casamentos.`
            : "As reservas confirmadas aparecem aqui."}
        </p>
      </header>

      {reservas.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] text-tinta">Nenhuma reserva por aqui ainda.</p>
          <p className="max-w-[46ch] text-[13px] text-cinza-fumo">
            Quando um vestido for reservado para o casamento de uma noiva, ele aparece aqui, da data
            mais próxima à mais distante.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {meses.map((mes) => (
            <section key={mes.chave} className="flex flex-col gap-3">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo first-letter:uppercase">
                {mes.rotulo}
              </h2>
              <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
                {mes.reservas.map((r) => (
                  <li key={r.id} className="flex items-center gap-4 px-4 py-3">
                    {/* Âncora de data: dia do casamento em bordô — o grande dia (§6) */}
                    <div className="flex w-11 shrink-0 flex-col items-center">
                      <span className="font-display text-[20px] font-light leading-none text-bordo tabular-nums">
                        {r.casamentoData ? r.casamentoData.getUTCDate() : "?"}
                      </span>
                      <span className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-cinza-fumo">
                        {r.casamentoData ? mesAbrev.format(r.casamentoData).replace(".", "") : ""}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {r.leadId ? (
                        <Link
                          href={`/loja/${lojaId}/noivas/${r.leadId}`}
                          className="w-fit rounded-sm text-[14px] text-tinta transition-colors duration-150
                            hover:text-bordo focus-visible:outline-2 focus-visible:outline-offset-2
                            focus-visible:outline-bordo"
                        >
                          {r.noivaNome ?? "Noiva"}
                        </Link>
                      ) : (
                        <span className="text-[14px] text-tinta">{r.noivaNome ?? "Noiva"}</span>
                      )}
                      <Link
                        href={`/loja/${lojaId}/vestidos/${r.vestidoId}`}
                        className="w-fit rounded-sm text-[12px] text-grafite underline decoration-borda
                          underline-offset-4 transition-colors duration-150 hover:text-tinta
                          hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2
                          focus-visible:outline-bordo"
                      >
                        {r.codigo} · {r.nome}
                      </Link>
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
