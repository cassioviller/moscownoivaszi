// src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx
// Detalhe da reserva — o lar das provas e ajustes da noiva. Lê a reserva (noiva +
// vestido + o bloco contínuo de indisponibilidade) e, abaixo, a operação do atelier:
// provas da reserva (leitura) e, dentro de cada prova, os ajustes de costura com
// checklist. A prova é agendada/iniciada/concluída na aba Provas & ajustes do
// Calendário — aqui há só leitura da prova + o atalho "Agendar prova".
// Ver = leads:ver; mexer em ajustes = módulo "ajustes".
import Link from "next/link";
import { redirect } from "next/navigation";
import { AvisoFlash } from "@/components/ui/aviso-flash";
import { botaoSuave, botaoPrincipal } from "@/components/ui/acoes";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterReservaDetalhe } from "@/lib/disponibilidade/reservas";
import { listarProvasDaReserva } from "@/lib/atelier/provas";
import { ROTULO_JANELA } from "@/lib/disponibilidade/agenda";
import { BotaoConfirmar } from "@/components/ui/botao-confirmar";
import type { AtendimentoSituacao } from "@/generated/prisma/client";
import {
  adicionarAjusteAction,
  alternarAjusteAction,
  removerAjusteAction,
  adicionarItemAction,
  alternarItemAction,
  removerItemAction,
  registrarRetiradaAction,
  registrarDevolucaoAction,
  desfazerRetiradaAction,
  desfazerDevolucaoAction,
} from "./actions";

export const dynamic = "force-dynamic";

const dataLonga = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const ROTULO_SITUACAO: Record<AtendimentoSituacao, string> = {
  AGENDADO: "Agendada",
  EM_ATENDIMENTO: "Em atendimento",
  CONCLUIDO: "Concluída",
  FALTOU: "Faltou",
};

const AVISOS: Record<string, string> = {
  ajuste: "Ajuste atualizado.",
  ajuste_removido: "Ajuste removido.",
  item: "Checklist atualizado.",
  movimentacao: "Movimentação registrada.",
  movimentacao_desfeita: "Registro desfeito.",
  sem_descricao: "Descreva o ajuste.",
  prova_invalida: "Prova inválida.",
  ajuste_invalido: "Ajuste não encontrado.",
  item_invalido: "Item do checklist não encontrado.",
  sem_retirada: "Registre a retirada antes da devolução.",
  data_invertida: "A devolução não pode ser antes da retirada.",
  devolucao_orfa: "Desfaça a devolução antes de desfazer a retirada.",
  datas_invalidas: "A retirada não pode ser antes do início da preparação.",
};

// Classes compartilhadas (alvo de toque ≥44px nos links/botões de ação).
const inputBase =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[15px] text-tinta " +
  "transition-colors duration-150 hover:border-cinza-fumo focus:border-tinta focus:outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";

export default async function ReservaDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string; bloqueioId: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const { lojaId, bloqueioId } = await params;
  const { ok, erro } = await searchParams;

  // Visão: atelier (leads:ver) OU costureira (ajustes:ver). Sem nenhum → fora.
  const [podeVerNoivas, podeVerVestidos, podeCriar, podeEditar, podeVerAjustesGate, podeEditarNoivas] =
    await Promise.all([
      podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"),
      podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "ver"),
      podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "criar"),
      podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "editar"),
      podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "ver"),
      podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"),
    ]);
  if (!podeVerNoivas && !podeVerAjustesGate) redirect(`/loja/${sc.loja.id}`);
  // Movimentação (retirada/devolução): leads:editar OU ajustes:editar (espelha a action).
  const podeMovimentar = podeEditarNoivas || podeEditar;

  const reserva = await obterReservaDetalhe(sc.loja.id, bloqueioId);
  if (!reserva) redirect(podeVerNoivas ? `/loja/${lojaId}/reservas` : `/loja/${lojaId}/ajustes`);

  const provas = await listarProvasDaReserva(sc.loja.id, bloqueioId);

  const aviso = (ok && AVISOS[ok]) || (erro && AVISOS[erro]) || null;
  const inicioBloco = reserva.fases[0]?.inicio ?? null;
  const ultima = reserva.fases[reserva.fases.length - 1];
  const fimBloco = ultima?.abertoFim ? null : (ultima?.fim ?? null);
  // O input date precisa do "value" do casamento como sugestão amigável.
  const casamentoYmd = reserva.casamentoData?.toISOString().slice(0, 10);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <Link
          href={podeVerNoivas ? `/loja/${lojaId}/reservas` : `/loja/${lojaId}/ajustes`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← {podeVerNoivas ? "Reservas" : "Ajustes"}
        </Link>
        <h1 className="font-display text-[28px] font-light leading-tight tracking-tight text-tinta">
          {reserva.leadId && podeVerNoivas ? (
            <Link href={`/loja/${lojaId}/noivas/${reserva.leadId}`} className="hover:text-bordo">
              {reserva.noivaNome ?? "Noiva"}
            </Link>
          ) : (
            (reserva.noivaNome ?? "Noiva")
          )}
        </h1>
        <p className="text-[14px] text-cinza-fumo">
          {podeVerVestidos ? (
            <Link href={`/loja/${lojaId}/vestidos/${reserva.vestidoId}`} className="hover:text-bordo">
              {reserva.codigo} · {reserva.nome}
            </Link>
          ) : (
            <span>
              {reserva.codigo} · {reserva.nome}
            </span>
          )}
          {reserva.casamentoData && <> · casamento {dataCurta.format(reserva.casamentoData)}</>}
        </p>
      </header>

      {aviso && <AvisoFlash tom={ok ? "ok" : "erro"}>{aviso}</AvisoFlash>}

      {/* Bloco contínuo de indisponibilidade — honesto e calmo (não é "alerta") */}
      {reserva.fases.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Indisponível</h2>
          {inicioBloco && (
            <p className="text-[14px] text-tinta">
              De {dataLonga.format(inicioBloco)}{" "}
              {fimBloco ? `a ${dataLonga.format(fimBloco)}` : "(em aberto, peça ainda fora)"}.
            </p>
          )}
          <ul className="flex flex-wrap gap-2">
            {reserva.fases.map((f, idx) => (
              <li
                key={`${f.tipo}-${idx}`}
                className="rounded-full border border-borda-suave bg-papel px-3 py-1 text-[12px] text-grafite"
              >
                {ROTULO_JANELA[f.tipo]}: {dataCurta.format(f.inicio)} →{" "}
                {f.abertoFim ? "em aberto" : dataCurta.format(f.fim)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Movimentação do vestido — saída/volta da peça (fecha a jornada) */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Movimentação</h2>

        {reserva.devolucaoDataReal ? (
          <div className="flex flex-col gap-2 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4">
            <p className="text-[15px] text-tinta">
              Devolvido em {dataLonga.format(reserva.devolucaoDataReal)}.
            </p>
            <p className="text-[13px] text-cinza-fumo">A jornada desta noiva está encerrada.</p>
            {podeMovimentar && (
              <form action={desfazerDevolucaoAction} className="self-start">
                <input type="hidden" name="bloqueioId" value={bloqueioId} />
                <button type="submit" className={botaoSuave}>
                  Desfazer devolução
                </button>
              </form>
            )}
          </div>
        ) : reserva.retiradaDataReal ? (
          <div className="flex flex-col gap-3 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4">
            <p className="text-[15px] text-tinta">
              Retirado em {dataLonga.format(reserva.retiradaDataReal)} — com a noiva.
            </p>
            <p className="text-[13px] text-grafite">
              Enquanto a devolução não for registrada, o vestido fica indisponível para outras noivas.
            </p>
            {podeMovimentar && (
              <>
                <form action={registrarDevolucaoAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="bloqueioId" value={bloqueioId} />
                  <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">
                      Data da devolução
                    </span>
                    <input
                      type="date"
                      name="data"
                      required
                      defaultValue={casamentoYmd}
                      className={`${inputBase} py-2 text-[14px]`}
                      aria-label="Data da devolução"
                    />
                  </label>
                  <button type="submit" className={botaoPrincipal}>
                    Registrar devolução
                  </button>
                </form>
                <form action={desfazerRetiradaAction} className="self-start">
                  <input type="hidden" name="bloqueioId" value={bloqueioId} />
                  <button type="submit" className={botaoSuave}>
                    Desfazer retirada
                  </button>
                </form>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel p-4">
            <p className="text-[15px] text-tinta">Vestido ainda no atelier.</p>
            {podeMovimentar && (
              <form action={registrarRetiradaAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="bloqueioId" value={bloqueioId} />
                <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">
                    Data da retirada
                  </span>
                  <input
                    type="date"
                    name="data"
                    required
                    defaultValue={casamentoYmd}
                    className={`${inputBase} py-2 text-[14px]`}
                    aria-label="Data da retirada"
                  />
                </label>
                <button type="submit" className={botaoPrincipal}>
                  Registrar retirada
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      {/* Provas */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Provas</h2>
          {podeEditarNoivas && reserva.leadId && (
            <Link
              href={`/loja/${lojaId}/atendimentos/novo?noiva=${reserva.leadId}&tipo=PROVA&reserva=${bloqueioId}`}
              className={botaoSuave}
            >
              Agendar prova
            </Link>
          )}
        </div>

        {provas.length === 0 ? (
          <p className="text-[14px] text-grafite">Nenhuma prova agendada ainda.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {provas.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[15px] text-tinta">{dataHora.format(p.inicio)}</span>
                    <span className="text-[12px] text-cinza-fumo">
                      {[p.cabineNome, p.vendedoraNome].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                  <span className="rounded-full border border-borda-suave bg-papel px-2.5 py-0.5 text-[12px] text-grafite">
                    {ROTULO_SITUACAO[p.situacao]}
                  </span>
                </div>

                {p.observacao && <p className="text-[13px] text-grafite">{p.observacao}</p>}

                {/* Ajustes desta prova */}
                <div className="flex flex-col gap-2 border-t border-borda-suave pt-3">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">
                    Ajustes
                  </span>
                  {p.ajustes.length === 0 ? (
                    <p className="text-[13px] text-cinza-fumo">Sem ajustes nesta prova.</p>
                  ) : (
                    <ul className="flex flex-col gap-2.5">
                      {p.ajustes.map((a) => {
                        const feito = a.status === "FEITO";
                        return (
                          <li key={a.id} className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <span
                                className={`text-[14px] ${feito ? "text-cinza-fumo line-through" : "text-tinta"}`}
                              >
                                {a.descricao}
                              </span>
                              <div className="flex shrink-0 items-center gap-3">
                                {podeEditar && (
                                  <form action={alternarAjusteAction}>
                                    <input type="hidden" name="bloqueioId" value={bloqueioId} />
                                    <input type="hidden" name="ajusteId" value={a.id} />
                                    <button type="submit" className={botaoSuave}>
                                      {feito ? "Reabrir" : "Marcar feito"}
                                    </button>
                                  </form>
                                )}
                                {podeEditar && (
                                  <form action={removerAjusteAction}>
                                    <input type="hidden" name="bloqueioId" value={bloqueioId} />
                                    <input type="hidden" name="ajusteId" value={a.id} />
                                    <BotaoConfirmar
                                      mensagem={`Remover o ajuste "${a.descricao}"?`}
                                      ariaLabel={`Remover ajuste ${a.descricao}`}
                                      className={botaoSuave}
                                    >
                                      Remover
                                    </BotaoConfirmar>
                                  </form>
                                )}
                              </div>
                            </div>

                            {/* Checklist de costura */}
                            {a.checklist.length > 0 && (
                              <ul className="flex flex-col gap-1 pl-3">
                                {a.checklist.map((c) => (
                                  <li key={c.id} className="flex items-center justify-between gap-3">
                                    <span
                                      className={`text-[13px] ${c.feito ? "text-cinza-fumo line-through" : "text-grafite"}`}
                                    >
                                      {c.feito ? "✓ " : "○ "}
                                      {c.descricao}
                                    </span>
                                    {podeEditar && (
                                      <div className="flex shrink-0 items-center gap-3">
                                        <form action={alternarItemAction}>
                                          <input type="hidden" name="bloqueioId" value={bloqueioId} />
                                          <input type="hidden" name="itemId" value={c.id} />
                                          <button type="submit" className={botaoSuave}>
                                            {c.feito ? "Desmarcar" : "Marcar"}
                                          </button>
                                        </form>
                                        <form action={removerItemAction}>
                                          <input type="hidden" name="bloqueioId" value={bloqueioId} />
                                          <input type="hidden" name="itemId" value={c.id} />
                                          <button type="submit" className={botaoSuave}>
                                            ×
                                          </button>
                                        </form>
                                      </div>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}

                            {/* Adicionar item ao checklist */}
                            {podeCriar && (
                              <form action={adicionarItemAction} className="flex items-center gap-2 pl-3">
                                <input type="hidden" name="bloqueioId" value={bloqueioId} />
                                <input type="hidden" name="ajusteId" value={a.id} />
                                <input
                                  name="descricao"
                                  placeholder="Item do checklist…"
                                  className={`${inputBase} flex-1 py-2 text-[13px]`}
                                  aria-label="Novo item do checklist"
                                />
                                <button type="submit" className={`${botaoSuave} no-underline`}>
                                  Adicionar
                                </button>
                              </form>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* Adicionar ajuste */}
                  {podeCriar && (
                    <form action={adicionarAjusteAction} className="flex items-center gap-2">
                      <input type="hidden" name="bloqueioId" value={bloqueioId} />
                      <input type="hidden" name="provaId" value={p.id} />
                      <input
                        name="descricao"
                        placeholder="Novo ajuste (ex.: bainha 3cm)…"
                        className={`${inputBase} flex-1 py-2 text-[14px]`}
                        aria-label="Novo ajuste"
                      />
                      <button type="submit" className={`${botaoSuave} no-underline`}>
                        Adicionar
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
