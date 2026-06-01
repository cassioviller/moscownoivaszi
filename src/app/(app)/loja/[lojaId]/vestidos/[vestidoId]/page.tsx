// src/app/(app)/loja/[lojaId]/vestidos/[vestidoId]/page.tsx
// Detalhe do vestido — peça de acervo, não item de estoque. Leitura concierge:
// foto de apoio (modesta, não domina — §9), nome editorial, características em
// linguagem legível, e a disponibilidade da peça (reservas). Edição vive em
// /editar. Auth + tenant espelham as páginas irmãs.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterVestido } from "@/lib/vestidos/vestidos";
import { listarFotosMeta } from "@/lib/vestidos/fotos";
import { listarCatalogo, rotularSelecoes } from "@/lib/catalogo/catalogo";
import { listarLeads } from "@/lib/leads/leads";
import { listarReservasDoVestido, listarManutencoesDoVestido } from "@/lib/disponibilidade/reservas";
import {
  reservarPeloVestidoAction,
  cancelarReservaPeloVestidoAction,
  enviarManutencaoAction,
  removerManutencaoAction,
} from "./reserva-actions";
import { SelectNativo } from "@/components/ui/select-nativo";
import { BotaoConfirmar } from "@/components/ui/botao-confirmar";

export const dynamic = "force-dynamic";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
// UTC: a data nasce em meia-noite UTC — exibir em UTC evita off-by-one.
const dataFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const dataDMY = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

// Mensagem humana para o retorno das ações de reserva/manutenção (?ok / ?erro).
const AVISOS: Record<string, string> = {
  reserva: "Reserva confirmada.",
  cancelada: "Reserva cancelada.",
  manutencao: "Vestido enviado para manutenção.",
  manutencao_removida: "Manutenção removida.",
  indisponivel: "Esta peça já está reservada para uma data próxima. Escolha outra peça ou outra data.",
  sem_data: "A noiva escolhida ainda não tem data de casamento.",
  sem_noiva: "Escolha uma noiva para reservar.",
  datas_invertidas: "A data de volta precisa ser depois da data de saída.",
};

export default async function VestidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string; vestidoId: string }>;
  searchParams: Promise<{ ok?: string; erro?: string; em?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "ver"))) {
    redirect(`/loja/${sc.loja.id}`);
  }

  const { lojaId, vestidoId } = await params;
  const { ok, erro, em } = await searchParams;

  // obterVestido já é escopado por loja (tenantPrisma) → null se for de outra loja.
  const v = await obterVestido(sc.loja.id, vestidoId);
  if (!v) redirect(`/loja/${lojaId}/vestidos`);

  const [fotos, catalogo, podeEditar, podeVerNoivas, reservas, manutencoes] = await Promise.all([
    listarFotosMeta(sc.loja.id, vestidoId),
    listarCatalogo(sc.loja.id),
    podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"),
    listarReservasDoVestido(sc.loja.id, vestidoId),
    listarManutencoesDoVestido(sc.loja.id, vestidoId),
  ]);

  // Para o seletor de reserva: só noivas que já têm data de casamento (sem data,
  // o motor não tem o que projetar). Carregado apenas quando a equipe pode reservar.
  const noivasComData =
    podeEditar && podeVerNoivas
      ? (await listarLeads(sc.loja.id)).filter((n) => n.casamentoData)
      : [];

  const caracteristicas = rotularSelecoes(catalogo, v.atributos);
  const editarHref = `/loja/${lojaId}/vestidos/${vestidoId}/editar`;
  const ativo = v.status === "ativo";
  const meta = [v.tamanho, v.cor, v.categoria].filter(Boolean).join(" · ");
  // Conflito com data conhecida diz para quando a peça já está reservada (erro que ensina).
  const avisoConflito =
    erro === "indisponivel" && em
      ? `Esta peça já está reservada para ${dataFmt.format(new Date(`${em}T00:00:00.000Z`))}. Escolha outra peça ou outra data.`
      : null;
  const aviso = (ok && AVISOS[ok]) || avisoConflito || (erro && AVISOS[erro]) || null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <Link
          href={`/loja/${lojaId}/vestidos`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← Vestidos
        </Link>
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] font-medium tracking-[0.02em] text-cinza-fumo tabular-nums">
            {v.codigo}
          </span>
          {!ativo && <span className="text-[12px] text-cinza-fumo">fora do acervo</span>}
        </div>
        {/* Nome em destaque editorial: peça de acervo, não linha de estoque */}
        <h1 className="font-display text-[30px] font-light leading-tight tracking-tight text-tinta">
          {v.nome}
        </h1>
        {meta && <p className="text-[14px] text-cinza-fumo">{meta}</p>}
      </header>

      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      {/* A peça é a âncora visual: capa maior, 2ª menor ao lado (§8). Foto de apoio,
          não hero gigante (§9). Capa carrega eager (é o LCP); as demais, lazy. */}
      {fotos.length > 0 ? (
        <div className="flex flex-wrap items-end gap-4">
          {fotos.map((f) => (
            <div
              key={f.ordem}
              className={`${f.ordem === 0 ? "w-56" : "w-36"} aspect-[3/4] shrink-0 overflow-hidden rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-suave`}
            >
              {/* foto já otimizada (WebP), servida pelo route escopado; v= cache-busting */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/loja/${lojaId}/vestidos/${vestidoId}/foto/${f.ordem}?v=${f.versao}`}
                alt={`Vestido ${v.nome}: foto ${f.ordem + 1}`}
                loading={f.ordem === 0 ? "eager" : "lazy"}
                fetchPriority={f.ordem === 0 ? "high" : undefined}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      ) : podeEditar ? (
        // Sem foto e pode editar: o tile inteiro é o alvo (≥44px), convite gentil.
        <Link
          href={editarHref}
          className="flex aspect-[3/4] w-56 flex-col items-center justify-center gap-1.5 rounded-[var(--mn-radius-md)]
            border border-borda-suave bg-papel-suave text-center transition-colors duration-150
            hover:border-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        >
          <span className="text-[13px] text-grafite">Adicionar foto</span>
          <span className="text-[11px] text-cinza-fumo">ainda sem retrato</span>
        </Link>
      ) : (
        <div className="flex aspect-[3/4] w-56 items-center justify-center rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-suave text-center">
          <span className="text-[12px] text-cinza-fumo">Ainda sem retrato</span>
        </div>
      )}

      {/* Preço — dado útil, discreto (a peça é o herói, não a etiqueta) */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Preço</span>
        <span className="text-[16px] text-tinta tabular-nums">{brl.format(Number(v.precoBase))}</span>
      </div>

      {/* Disponibilidade — a pergunta nº1 do acervo de aluguel: livre ou reservada?
          O motor barra conflito de janelas; a reserva se ancora na data da noiva. */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Disponibilidade</h2>
          {/* Selo de leitura instantânea: livre (champagne, atmosfera) vs reservada (neutro) */}
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] tracking-[0.02em] ${
              reservas.length === 0
                ? "border-champagne/50 text-grafite"
                : "border-borda-suave text-cinza-fumo"
            }`}
          >
            {reservas.length === 0 ? "Livre" : "Reservada"}
          </span>
        </div>

        {reservas.length === 0 ? (
          <p className="text-[14px] text-grafite">Sem reservas. Esta peça está livre.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {reservas.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[14px] text-tinta">{r.noivaNome ?? "Noiva"}</span>
                  <span className="text-[12px] text-cinza-fumo">
                    Casamento {r.casamentoData ? dataFmt.format(r.casamentoData) : "sem data"}
                  </span>
                </span>
                {podeEditar && (
                  <form action={cancelarReservaPeloVestidoAction}>
                    <input type="hidden" name="vestidoId" value={vestidoId} />
                    <input type="hidden" name="bloqueioId" value={r.id} />
                    <BotaoConfirmar
                      mensagem={`Cancelar a reserva de ${r.noivaNome ?? "esta noiva"}?`}
                      ariaLabel={`Cancelar reserva de ${r.noivaNome ?? "noiva"}`}
                      className="inline-flex min-h-11 items-center rounded-sm text-[12px] text-grafite
                        underline decoration-borda underline-offset-4 transition-colors duration-150
                        hover:text-tinta hover:decoration-champagne focus-visible:outline-2
                        focus-visible:outline-offset-2 focus-visible:outline-bordo"
                    >
                      Cancelar
                    </BotaoConfirmar>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {podeEditar &&
          podeVerNoivas &&
          (noivasComData.length > 0 ? (
            <form action={reservarPeloVestidoAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="vestidoId" value={vestidoId} />
              <SelectNativo name="leadId" label="Reservar para" placeholder="Escolha uma noiva…">
                {noivasComData.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.noivaNome} · {n.casamentoData ? dataFmt.format(n.casamentoData) : ""}
                  </option>
                ))}
              </SelectNativo>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-bordo px-4 py-2.5
                  text-[14px] font-medium tracking-[0.01em] text-papel transition-colors duration-150 ease-out
                  hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
              >
                Reservar
              </button>
            </form>
          ) : (
            <p className="text-[13px] text-cinza-fumo">
              Para reservar, uma noiva precisa ter a data do casamento cadastrada.
            </p>
          ))}

        {/* Manutenção — peça fora do acervo por um período (conserto, higienização
            especial). O motor já a considera nas reservas; aparece também na Agenda. */}
        {(manutencoes.length > 0 || podeEditar) && (
          <div className="flex flex-col gap-3 border-t border-borda-suave pt-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Manutenção</p>

            {manutencoes.length > 0 && (
              <ul className="flex flex-col gap-2">
                {manutencoes.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-4">
                    <span className="text-[13px] text-grafite">
                      {m.inicio ? dataDMY.format(m.inicio) : "?"}
                      {m.fim ? ` a ${dataDMY.format(m.fim)}` : " (sem data de volta)"}
                    </span>
                    {podeEditar && (
                      <form action={removerManutencaoAction}>
                        <input type="hidden" name="vestidoId" value={vestidoId} />
                        <input type="hidden" name="bloqueioId" value={m.id} />
                        <BotaoConfirmar
                          mensagem="Remover esta manutenção?"
                          ariaLabel="Remover manutenção"
                          className="inline-flex min-h-11 items-center rounded-sm text-[12px] text-grafite
                            underline decoration-borda underline-offset-4 transition-colors duration-150
                            hover:text-tinta hover:decoration-champagne focus-visible:outline-2
                            focus-visible:outline-offset-2 focus-visible:outline-bordo"
                        >
                          Remover
                        </BotaoConfirmar>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {podeEditar && (
              <form action={enviarManutencaoAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="vestidoId" value={vestidoId} />
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Saída</span>
                  <input
                    type="date"
                    name="inicio"
                    required
                    className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[14px] text-tinta
                      transition-colors duration-150 focus-visible:border-bordo focus-visible:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">
                    Volta (opcional)
                  </span>
                  <input
                    type="date"
                    name="fim"
                    className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[14px] text-tinta
                      transition-colors duration-150 focus-visible:border-bordo focus-visible:outline-none"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-borda
                    px-4 py-2.5 text-[13px] text-grafite transition-colors duration-150 hover:border-bordo
                    hover:text-bordo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                >
                  Enviar para manutenção
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      {/* Características do acervo — atributos do catálogo em linguagem legível.
          Vazio não some em silêncio: convida a preencher (alimenta a indicação). */}
      {caracteristicas.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Características</h2>
          <ul className="flex flex-wrap gap-x-2 gap-y-1.5">
            {caracteristicas.map((c) => (
              <li
                key={c.nome}
                className="rounded-full border border-borda-suave bg-papel px-2.5 py-0.5 text-[12px] text-grafite"
              >
                {c.nome}: <span className="text-tinta">{c.valor}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        podeEditar && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Características</h2>
            <p className="max-w-[60ch] text-[14px] leading-[1.65] text-grafite">
              Ainda não preenchidas.{" "}
              <Link
                href={editarHref}
                className="rounded-sm text-grafite underline decoration-borda underline-offset-4
                  transition-colors duration-150 hover:text-tinta hover:decoration-champagne
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
              >
                Complete
              </Link>{" "}
              para melhorar as indicações de vestido.
            </p>
          </section>
        )
      )}

      {/* Observações — anotações do atelier sobre a peça */}
      {v.observacoes && (
        <section className="flex flex-col gap-4">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Observações</h2>
          <p className="max-w-[60ch] text-[14px] leading-[1.65] text-grafite">{v.observacoes}</p>
        </section>
      )}

      {/* Ação — editar a peça (alvo de toque ≥44px) */}
      {podeEditar && (
        <footer className="border-t border-borda-suave pt-5">
          <Link
            href={editarHref}
            className="inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline
              decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta
              hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-bordo"
          >
            Editar vestido
          </Link>
        </footer>
      )}
    </main>
  );
}
