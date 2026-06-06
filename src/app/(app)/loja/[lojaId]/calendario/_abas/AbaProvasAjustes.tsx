// Aba Provas & ajustes — uma vista consolidada (só leitura) das próximas provas e da
// fila de ajustes pendentes. O trabalho operacional (registrar, marcar feito) segue
// nas páginas dedicadas — daí os links. Reaproveita listarProvasDaLoja / listarAjustesPendentes.
import Link from "next/link";
import { hojeYMD, hojeUTC } from "@/lib/tempo";
import { listarProvasDaLoja } from "@/lib/atelier/provas";
import { listarAjustesPendentes } from "@/lib/atelier/ajustes";
import { diasAteCasamento, casamentoUrgente, prazoCasamento } from "@/lib/leads/contagem-casamento";

const DIA_MS = 86_400_000;

const ROTULO_TIPO_PROVA: Record<"PRIMEIRA" | "INTERMEDIARIA" | "FINAL", string> = {
  PRIMEIRA: "1ª prova",
  INTERMEDIARIA: "Prova intermediária",
  FINAL: "Prova final",
};

const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
// pt-BR devolve "15 de jan." — tiramos o conector e o ponto → "15 jan".
const fmtDia = (d: Date) => diaMes.format(d).replace(" de ", " ").replace(".", "");

// Dias-calendário (UTC) entre hoje e um alvo à meia-noite UTC.
const diasAte = (hojeMs: number, alvo: Date) => Math.round((alvo.getTime() - hojeMs) / DIA_MS);

// Prazo até a prova (lista é sempre futura: dias ≥ 0).
function prazoProva(dias: number): string {
  if (dias <= 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}
// prazoCasamento (com atraso) vive em @/lib/leads/contagem-casamento — DRY com a fila de Ajustes.

export async function AbaProvasAjustes({ lojaId }: { lojaId: string }) {
  const hoje = hojeYMD();
  const hojeMs = hojeUTC().getTime();
  const [provasPg, ajustesPg] = await Promise.all([
    listarProvasDaLoja(lojaId, { tamanho: 5 }),
    listarAjustesPendentes(lojaId, { tamanho: 5 }),
  ]);
  const { itens: provas, total: totalProvas } = provasPg;
  const { itens: ajustes, total: totalAjustes } = ajustesPg;

  return (
    <div className="flex flex-col gap-8">
      {/* Provas */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">
            Próximas provas{totalProvas > 0 && <span className="text-grafite"> · {totalProvas}</span>}
          </h2>
          <Link href={`/loja/${lojaId}/provas`} className="rounded-sm text-[12px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">
            {totalProvas > provas.length ? `Ver todas (${totalProvas})` : "Ver todas"}
          </Link>
        </div>
        {provas.length === 0 ? (
          <p className="text-[13px] text-cinza-fumo">Nenhuma prova marcada por aqui.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {provas.map((p) => (
              <li key={p.id} className="flex items-center gap-4 px-4 py-3">
                <span className={`w-16 shrink-0 whitespace-nowrap text-[13px] tabular-nums ${p.dataReal.toISOString().slice(0, 10) === hoje ? "text-bordo" : "text-grafite"}`}>{fmtDia(p.dataReal)}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[14px] text-tinta">{ROTULO_TIPO_PROVA[p.tipo]}</span>
                    {p.noivaNome && <span className="text-[13px] text-cinza-fumo">{p.noivaNome}</span>}
                  </span>
                  <span className="text-[12px] text-cinza-fumo">
                    {p.vestidoCodigo} · {p.vestidoNome} · {prazoProva(diasAte(hojeMs, p.dataReal))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Ajustes */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">
            Ajustes pendentes{totalAjustes > 0 && <span className="text-grafite"> · {totalAjustes}</span>}
          </h2>
          <Link href={`/loja/${lojaId}/ajustes`} className="rounded-sm text-[12px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">
            {totalAjustes > ajustes.length ? `Ver fila (${totalAjustes})` : "Ver fila"}
          </Link>
        </div>
        {ajustes.length === 0 ? (
          <p className="text-[13px] text-cinza-fumo">Nenhum ajuste pendente. Tudo em dia.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {ajustes.map((a) => {
              const dias = a.casamentoData ? diasAteCasamento(a.casamentoData, hojeMs) : null;
              const urgente = dias !== null && casamentoUrgente(dias);
              return (
                <li key={a.id} className="flex items-center gap-4 px-4 py-3">
                  <span
                    className={`w-16 shrink-0 whitespace-nowrap text-[13px] tabular-nums ${urgente ? "text-bordo" : "text-grafite"}`}
                  >
                    {a.casamentoData ? fmtDia(a.casamentoData) : "—"}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-[14px] text-tinta">{a.descricao}</span>
                      {a.noivaNome && <span className="text-[13px] text-cinza-fumo">{a.noivaNome}</span>}
                    </span>
                    <span className="text-[12px] text-cinza-fumo">
                      {a.vestidoCodigo} · {a.vestidoNome}
                      {dias !== null && (
                        <> · <span className={urgente ? "text-bordo" : undefined}>{prazoCasamento(dias)}</span></>
                      )}
                      {a.checklistTotal > 0 && <> · {a.checklistFeitos}/{a.checklistTotal} no checklist</>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
