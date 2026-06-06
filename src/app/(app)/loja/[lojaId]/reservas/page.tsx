// src/app/(app)/loja/[lojaId]/reservas/page.tsx
// Livro de reservas — quem casa com qual vestido. Lente "compromisso" (uma linha
// por noiva), distinta da Agenda (uma linha por janela de trabalho): aqui a noiva
// é a protagonista e a etapa da jornada diz como vai cada compromisso. O bordô fica
// reservado à urgência (casamento próximo), não a toda data. Gate em leads:ver.
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirAcesso } from "@/lib/server/acoes";
import { listarReservasDaLoja, type ReservaDaLoja } from "@/lib/disponibilidade/reservas";
import { estagiosDasNoivas } from "@/lib/leads/leads";
import { ROTULO_ESTAGIO } from "@/lib/leads/jornada";
import { hojeUTC } from "@/lib/tempo";
import { diasAteCasamento, casamentoUrgente } from "@/lib/leads/contagem-casamento";

export const dynamic = "force-dynamic";

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

export default async function ReservasPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ quando?: string }>;
}) {
  const sc = await exigirAcesso("leads");

  const { lojaId } = await params;
  const { quando } = await searchParams;
  const passadas = quando === "passadas";

  const reservas = await listarReservasDaLoja(sc.loja.id, { passadas });
  const estagios = await estagiosDasNoivas(sc.loja.id);
  const meses = agruparPorMes(reservas);
  const hoje = hojeUTC().getTime();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={`/loja/${lojaId}`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← {sc.loja.nome}
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">
          {passadas ? "Reservas passadas" : "Reservas"}
        </h1>
        <p className="text-[14px] text-cinza-fumo">
          {passadas ? "Casamentos já realizados." : "Quem casa com qual vestido, nos próximos casamentos."}
        </p>
      </header>

      {reservas.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] text-tinta">
            {passadas ? "Nenhuma reserva passada." : "Nenhuma reserva por aqui ainda."}
          </p>
          {!passadas && (
            <p className="max-w-[46ch] text-[13px] text-cinza-fumo">
              Quando um vestido for reservado para o casamento de uma noiva, ele aparece aqui, da data
              mais próxima à mais distante.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {meses.map((mes) => (
            <section key={mes.chave} className="flex flex-col gap-3">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo first-letter:uppercase">
                {mes.rotulo}
              </h2>
              <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
                {mes.reservas.map((r) => {
                  const dias = r.casamentoData
                    ? diasAteCasamento(r.casamentoData, hoje)
                    : null;
                  // Bordô só na urgência: casamento próximo (≤14d). Distante = tinta (§6).
                  const urgente = !passadas && dias !== null && casamentoUrgente(dias);
                  return (
                    <li key={r.id} className="flex items-center gap-4 px-4 py-3">
                      <div className="flex w-11 shrink-0 flex-col items-center">
                        <span
                          className={`font-display text-[20px] font-light leading-none tabular-nums ${
                            urgente ? "text-bordo" : "text-tinta"
                          }`}
                        >
                          {r.casamentoData ? r.casamentoData.getUTCDate() : "?"}
                        </span>
                        <span className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-cinza-fumo">
                          {r.casamentoData ? mesAbrev.format(r.casamentoData).replace(".", "") : ""}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {/* Noiva = destino primário (a reserva é dela; o perfil mostra a jornada) */}
                        {r.leadId ? (
                          <Link
                            href={`/loja/${lojaId}/noivas/${r.leadId}`}
                            className="w-fit rounded-sm text-[15px] text-tinta transition-colors duration-150
                              hover:text-bordo focus-visible:outline-2 focus-visible:outline-offset-2
                              focus-visible:outline-bordo"
                          >
                            {r.noivaNome ?? "Noiva"}
                          </Link>
                        ) : (
                          <span className="text-[15px] text-tinta">{r.noivaNome ?? "Noiva"}</span>
                        )}
                        {/* Etapa da jornada (o que a Agenda não mostra) + vestido como chip secundário */}
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          {r.leadId && estagios.get(r.leadId) && (
                            <span className="text-[12px] text-cinza-fumo">
                              {estagios.get(r.leadId)!.encerrada ?? ROTULO_ESTAGIO[estagios.get(r.leadId)!.atual]}
                            </span>
                          )}
                          <Link
                            href={`/loja/${lojaId}/vestidos/${r.vestidoId}`}
                            className="inline-flex min-h-8 items-center rounded-full border border-borda-suave
                              bg-papel px-2.5 py-0.5 text-[12px] text-grafite transition-colors duration-150
                              hover:border-bordo hover:text-bordo focus-visible:outline-2
                              focus-visible:outline-offset-2 focus-visible:outline-bordo"
                          >
                            {r.codigo} · {r.nome}
                          </Link>
                          <Link
                            href={`/loja/${lojaId}/reservas/${r.id}`}
                            className="rounded-sm text-[12px] text-grafite underline decoration-borda
                              underline-offset-4 transition-colors duration-150 hover:text-bordo
                              hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2
                              focus-visible:outline-bordo"
                          >
                            Provas &amp; ajustes
                          </Link>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Porta para o histórico (ou volta), discreta no rodapé */}
      <div className="border-t border-borda-suave pt-5">
        <Link
          href={passadas ? `/loja/${lojaId}/reservas` : `/loja/${lojaId}/reservas?quando=passadas`}
          className="inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline
            decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta
            hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-bordo"
        >
          {passadas ? "← Voltar às próximas reservas" : "Ver reservas passadas"}
        </Link>
      </div>
    </main>
  );
}
