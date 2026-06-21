// Aba Provas & ajustes — acionável. As PROVAS ABERTAS (agendada/em atendimento) ficam
// sempre no topo como fila de trabalho (ignoram o filtro de período): agendada → iniciar
// ou marcar falta; em atendimento → cadastrar ajustes e concluir a prova. A fila de
// AJUSTES pendentes segue filtrável por período (?ini=&fim=).
import Link from "next/link";
import { hojeYMD, hojeUTC, meiaNoiteUTC } from "@/lib/tempo";
import { listarProvasAbertas } from "@/lib/atendimentos/atendimentos";
import { listarAjustesPendentes } from "@/lib/atelier/ajustes";
import { resolverPeriodo } from "@/lib/calendario/periodo";
import { botaoSuave, botaoPrincipal } from "@/components/ui/acoes";
import { diasAteCasamento, casamentoUrgente, prazoCasamento } from "@/lib/leads/contagem-casamento";
import {
  iniciarProvaAction,
  faltaProvaAction,
  concluirProvaAction,
  adicionarAjusteProvaAction,
  alternarAjusteProvaAction,
} from "../actions";

const DIA_MS = 86_400_000;

// Campo de data do filtro — mesmos estados de foco do design (foco bordô, §6).
const inputData =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta focus:border-tinta focus:outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const inputTexto =
  "min-w-0 flex-1 rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta focus:border-tinta focus:outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";

const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const horaFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
// pt-BR devolve "15 de jan." — tiramos o conector e o ponto → "15 jan".
const fmtDia = (d: Date) => diaMes.format(d).replace(" de ", " ").replace(".", "");

// Dias-calendário (UTC) entre hoje e um alvo à meia-noite UTC.
const diasAte = (hojeMs: number, alvo: Date) => Math.round((alvo.getTime() - hojeMs) / DIA_MS);

// Prazo relativo à prova. A fila de abertas pode incluir dias passados (agendado vencido).
function prazoProva(dias: number): string {
  if (dias < -1) return `há ${-dias} dias`;
  if (dias === -1) return "ontem";
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}
// prazoCasamento (com atraso) vive em @/lib/leads/contagem-casamento — DRY com a fila de Ajustes.

export async function AbaProvasAjustes({
  lojaId,
  ini,
  fim,
}: {
  lojaId: string;
  ini?: string;
  fim?: string;
}) {
  const hoje = hojeYMD();
  const hojeMs = hojeUTC().getTime();
  const { iniYMD, fimYMD, inicio, fimExclusivo } = resolverPeriodo(ini, fim, hoje);
  const intervalo = { gte: inicio, lt: fimExclusivo };
  const [provas, ajustesPg] = await Promise.all([
    listarProvasAbertas(lojaId),
    listarAjustesPendentes(lojaId, { tamanho: 5, intervalo }),
  ]);
  const { itens: ajustes, total: totalAjustes } = ajustesPg;

  const periodoLabel = `${fmtDia(inicio)} – ${fmtDia(meiaNoiteUTC(fimYMD))}`;

  return (
    <div className="flex flex-col gap-8">
      {/* Provas abertas — sempre visíveis (fila de trabalho), independentes do filtro. */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">
            Provas abertas{provas.length > 0 && <span className="text-grafite"> · {provas.length}</span>}
          </h2>
          <Link href={`/loja/${lojaId}/atendimentos/novo?tipo=PROVA`} className={botaoSuave}>
            Agendar prova
          </Link>
        </div>
        {provas.length === 0 ? (
          <p className="text-[13px] text-cinza-fumo">Nenhuma prova aberta no momento.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {provas.map((p) => {
              const dia = p.inicio.toISOString().slice(0, 10);
              return (
                <li key={p.id} className="flex flex-col gap-3 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className={`whitespace-nowrap text-[13px] tabular-nums ${dia === hoje ? "text-bordo" : "text-grafite"}`}>
                      {fmtDia(p.inicio)} · {horaFmt.format(p.inicio)}
                    </span>
                    <span className="text-[14px] text-tinta">{p.noivaNome ?? "Noiva"}</span>
                    <span className="text-[12px] text-cinza-fumo">{prazoProva(diasAte(hojeMs, p.inicio))}</span>
                  </div>
                  <p className="text-[12px] text-cinza-fumo">
                    {p.vestidoCodigo && p.vestidoNome ? `${p.vestidoCodigo} · ${p.vestidoNome}` : "Sem vestido"}
                    {(p.cabineNome || p.vendedoraNome) && (
                      <> · {[p.cabineNome, p.vendedoraNome].filter(Boolean).join(" · ")}</>
                    )}
                  </p>

                  {p.situacao === "AGENDADO" ? (
                    <div className="flex flex-wrap gap-2">
                      <form action={iniciarProvaAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className={botaoPrincipal}>Iniciar atendimento</button>
                      </form>
                      <form action={faltaProvaAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className={botaoSuave}>Marcou falta</button>
                      </form>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {p.ajustes.length > 0 && (
                        <ul className="flex flex-col gap-1.5">
                          {p.ajustes.map((a) => (
                            <li key={a.id} className="flex items-center gap-2">
                              <form action={alternarAjusteProvaAction}>
                                <input type="hidden" name="ajusteId" value={a.id} />
                                <button
                                  type="submit"
                                  aria-label={a.status === "FEITO" ? "Marcar pendente" : "Marcar feito"}
                                  className="inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                                >
                                  {a.status === "FEITO" ? "✓" : "○"}
                                </button>
                              </form>
                              <span className={`text-[13px] ${a.status === "FEITO" ? "text-cinza-fumo line-through" : "text-tinta"}`}>
                                {a.descricao}
                                {a.checklistTotal > 0 && <span className="text-cinza-fumo"> · {a.checklistFeitos}/{a.checklistTotal}</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <form action={adicionarAjusteProvaAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={p.id} />
                        <input name="descricao" placeholder="Novo ajuste…" aria-label="Descrição do ajuste" className={inputTexto} />
                        <button type="submit" className={botaoSuave}>Adicionar ajuste</button>
                      </form>
                      <form action={concluirProvaAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className={botaoPrincipal}>Concluir prova</button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Filtro de período (lente: ?ini=&fim=) — vale só para os ajustes pendentes. */}
      <div className="flex flex-col gap-2">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="aba" value="provas-ajustes" />
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
        <p className="text-[12px] text-cinza-fumo">{periodoLabel}</p>
      </div>

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
          <p className="text-[13px] text-cinza-fumo">Nenhum ajuste pendente neste período.</p>
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
