// src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx
// Detalhe da reserva — o lar das provas e ajustes da noiva. Lê a reserva (noiva +
// vestido + o bloco contínuo de indisponibilidade) e, abaixo, a operação do atelier:
// provas registradas e, dentro de cada prova, os ajustes de costura com checklist.
// Ver = leads:ver; mexer em provas/ajustes = módulo "ajustes". A prova é registro
// operacional: NÃO altera disponibilidade (decisão 2026-06-01).
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterReservaDetalhe } from "@/lib/disponibilidade/reservas";
import { listarProvasDaReserva } from "@/lib/atelier/provas";
import { ROTULO_JANELA } from "@/lib/disponibilidade/agenda";
import { SelectNativo } from "@/components/ui/select-nativo";
import { BotaoConfirmar } from "@/components/ui/botao-confirmar";
import type { ProvaTipo, ProvaComparecimento } from "@/generated/prisma/client";
import {
  registrarProvaAction,
  editarComparecimentoAction,
  removerProvaAction,
  adicionarAjusteAction,
  alternarAjusteAction,
  removerAjusteAction,
  adicionarItemAction,
  alternarItemAction,
  removerItemAction,
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

const ROTULO_TIPO: Record<ProvaTipo, string> = {
  PRIMEIRA: "1ª prova",
  INTERMEDIARIA: "Prova intermediária",
  FINAL: "Prova final",
};
const ROTULO_COMPARECIMENTO: Record<ProvaComparecimento, string> = {
  AGENDADA: "Agendada",
  COMPARECEU: "Compareceu",
  FALTOU: "Faltou",
  REMARCADA: "Remarcada",
};
const TIPOS: ProvaTipo[] = ["PRIMEIRA", "INTERMEDIARIA", "FINAL"];
const COMPARECIMENTOS: ProvaComparecimento[] = ["AGENDADA", "COMPARECEU", "FALTOU", "REMARCADA"];

const AVISOS: Record<string, string> = {
  prova: "Prova registrada.",
  prova_removida: "Prova removida.",
  ajuste: "Ajuste atualizado.",
  ajuste_removido: "Ajuste removido.",
  item: "Checklist atualizado.",
  sem_data: "Informe a data da prova.",
  tipo_invalido: "Escolha o tipo da prova.",
  reserva_invalida: "Reserva inválida.",
  sem_descricao: "Descreva o ajuste.",
  prova_invalida: "Prova inválida.",
};

// Classes compartilhadas (alvo de toque ≥44px nos links/botões de ação).
const inputBase =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[15px] text-tinta " +
  "transition-colors duration-150 hover:border-cinza-fumo focus:border-tinta focus:outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const botaoSuave =
  "inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline decoration-borda " +
  "underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne " +
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
  const [podeVerNoivas, podeVerVestidos, podeCriar, podeEditar, podeVerAjustesGate] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "criar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "editar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "ver"),
  ]);
  if (!podeVerNoivas && !podeVerAjustesGate) redirect(`/loja/${sc.loja.id}`);

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

      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

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

      {/* Provas */}
      <section className="flex flex-col gap-4">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Provas</h2>

        {provas.length === 0 ? (
          <p className="text-[14px] text-grafite">Nenhuma prova registrada ainda.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {provas.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[15px] text-tinta">{ROTULO_TIPO[p.tipo]}</span>
                    <span className="text-[12px] text-cinza-fumo">
                      {dataLonga.format(p.dataReal)}
                      {p.responsavel ? ` · ${p.responsavel}` : ""}
                    </span>
                  </div>
                  <span className="rounded-full border border-borda-suave bg-papel px-2.5 py-0.5 text-[12px] text-grafite">
                    {ROTULO_COMPARECIMENTO[p.comparecimento]}
                  </span>
                </div>

                {p.observacao && <p className="text-[13px] text-grafite">{p.observacao}</p>}

                {/* Atualizar comparecimento (edição rápida) */}
                {podeEditar && (
                  <form action={editarComparecimentoAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="bloqueioId" value={bloqueioId} />
                    <input type="hidden" name="provaId" value={p.id} />
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">
                        Comparecimento
                      </span>
                      <select
                        name="comparecimento"
                        defaultValue={p.comparecimento}
                        aria-label="Comparecimento"
                        className={`${inputBase} py-2 text-[14px]`}
                      >
                        {COMPARECIMENTOS.map((c) => (
                          <option key={c} value={c}>
                            {ROTULO_COMPARECIMENTO[c]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className={`${botaoSuave} no-underline`}>
                      Atualizar
                    </button>
                  </form>
                )}

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

                {/* Remover prova */}
                {podeEditar && (
                  <form action={removerProvaAction} className="self-end">
                    <input type="hidden" name="bloqueioId" value={bloqueioId} />
                    <input type="hidden" name="provaId" value={p.id} />
                    <BotaoConfirmar
                      mensagem="Remover esta prova e seus ajustes?"
                      ariaLabel="Remover prova"
                      className={botaoSuave}
                    >
                      Remover prova
                    </BotaoConfirmar>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Registrar prova */}
        {podeCriar && (
          <form
            action={registrarProvaAction}
            className="flex flex-col gap-3 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel p-4"
          >
            <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">
              Registrar prova
            </span>
            <input type="hidden" name="bloqueioId" value={bloqueioId} />
            <div className="flex flex-wrap gap-3">
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Data</span>
                <input
                  type="date"
                  name="dataReal"
                  required
                  defaultValue={casamentoYmd}
                  className={`${inputBase} py-2 text-[14px]`}
                  aria-label="Data da prova"
                />
              </label>
              <SelectNativo name="tipo" label="Tipo" placeholder="Tipo da prova">
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO[t]}
                  </option>
                ))}
              </SelectNativo>
              <SelectNativo name="comparecimento" label="Comparecimento" placeholder="Comparecimento">
                {COMPARECIMENTOS.map((c) => (
                  <option key={c} value={c}>
                    {ROTULO_COMPARECIMENTO[c]}
                  </option>
                ))}
              </SelectNativo>
            </div>
            <input
              name="responsavel"
              placeholder="Responsável (opcional)"
              className={`${inputBase} py-2 text-[14px]`}
              aria-label="Responsável"
            />
            <input
              name="observacao"
              placeholder="Observação (opcional)"
              className={`${inputBase} py-2 text-[14px]`}
              aria-label="Observação"
            />
            <button
              type="submit"
              className="inline-flex min-h-11 w-fit items-center rounded-md bg-bordo px-4 text-[14px] font-medium
                text-papel transition-colors duration-150 ease-out hover:bg-bordo-hover focus-visible:outline-2
                focus-visible:outline-offset-2 focus-visible:outline-bordo"
            >
              Registrar prova
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
