// src/app/(app)/loja/[lojaId]/atendimentos/page.tsx
// Atendimentos — a FILA DE TRABALHO (o ato de "atender"), distinta de Agendar
// (/atendimentos/novo, que marca horário na grade). A vendedora inicia, conclui (com
// desfecho) ou marca falta; cada linha leva ao perfil da noiva (onde se reserva). As
// transições movem a jornada (Atendimento agendado → Atendida). Ver = leads:ver;
// agir = leads:editar.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarAtendimentos, type AtendimentoFila } from "@/lib/atendimentos/atendimentos";
import type { AtendimentoSituacao, AtendimentoDesfecho } from "@/generated/prisma/client";
import { iniciarAtendimentoAction, concluirAtendimentoAction, marcarFaltaAction } from "./actions";
import { criarOrcamentoAction } from "../orcamentos/actions";

export const dynamic = "force-dynamic";

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const dataLonga = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone: "UTC" });

const ROTULO_SITUACAO: Record<AtendimentoSituacao, string> = {
  AGENDADO: "Agendado",
  EM_ATENDIMENTO: "Em atendimento",
  CONCLUIDO: "Concluído",
  FALTOU: "Faltou",
};
const ROTULO_DESFECHO: Record<AtendimentoDesfecho, string> = {
  RESERVOU: "Reservou",
  VAI_PENSAR: "Vai pensar",
  NAO_SERVIU: "Não serviu",
};
const DESFECHOS: AtendimentoDesfecho[] = ["RESERVOU", "VAI_PENSAR", "NAO_SERVIU"];

const AVISOS: Record<string, string> = {
  iniciado: "Atendimento iniciado.",
  concluido: "Atendimento concluído.",
  falta: "Falta registrada.",
  transicao_invalida: "Essa mudança não é possível agora.",
  atendimento_invalido: "Atendimento inválido.",
  desfecho_invalido: "Escolha como o atendimento terminou.",
};

function hojeUTC(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

const inputBase =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta " +
  "transition-colors duration-150 hover:border-cinza-fumo focus:border-tinta focus:outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const botaoSuave =
  "inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline decoration-borda " +
  "underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const botaoPrincipal =
  "inline-flex min-h-11 w-fit items-center rounded-md bg-bordo px-4 text-[14px] font-medium text-papel " +
  "transition-colors duration-150 ease-out hover:bg-bordo-hover focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-bordo";

function Linha({
  a,
  lojaId,
  podeEditar,
  comData,
}: {
  a: AtendimentoFila;
  lojaId: string;
  podeEditar: boolean;
  comData?: boolean;
}) {
  return (
    <li className="flex items-start gap-4 px-4 py-3">
      <div className="flex w-14 shrink-0 flex-col items-center">
        <span className="font-display text-[17px] font-light leading-none tabular-nums text-tinta">
          {hora.format(a.inicio)}
        </span>
        {comData && (
          <span className="mt-1 text-center text-[11px] text-cinza-fumo">{dataLonga.format(a.inicio)}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link
            href={`/loja/${lojaId}/noivas/${a.leadId}`}
            className="w-fit rounded-sm text-[15px] text-tinta transition-colors duration-150 hover:text-bordo
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
          >
            {a.noivaNome ?? "Noiva"}
          </Link>
          <span className="text-[12px] text-cinza-fumo">
            {a.cabineNome} · {a.vendedoraNome}
          </span>
        </span>

        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="inline-flex min-h-7 items-center rounded-full border border-borda-suave bg-papel px-2.5 py-0.5 text-[12px] text-grafite">
            {ROTULO_SITUACAO[a.situacao]}
            {a.situacao === "CONCLUIDO" && a.desfecho ? ` · ${ROTULO_DESFECHO[a.desfecho]}` : ""}
          </span>

          {podeEditar && a.situacao === "AGENDADO" && (
            <>
              <form action={iniciarAtendimentoAction}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className={botaoSuave}>
                  Iniciar atendimento
                </button>
              </form>
              <form action={marcarFaltaAction}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className={botaoSuave}>
                  Marcou falta
                </button>
              </form>
            </>
          )}

          {podeEditar && a.situacao === "EM_ATENDIMENTO" && (
            <>
              <form action={criarOrcamentoAction}>
                <input type="hidden" name="atendimentoId" value={a.id} />
                <button type="submit" className={botaoSuave}>
                  Abrir orçamento
                </button>
              </form>
              <form action={concluirAtendimentoAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={a.id} />
                <label className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Desfecho</span>
                  <select name="desfecho" required defaultValue="" aria-label="Desfecho do atendimento" className={inputBase}>
                    <option value="" disabled>
                      Como terminou?
                    </option>
                    {DESFECHOS.map((d) => (
                      <option key={d} value={d}>
                        {ROTULO_DESFECHO[d]}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className={botaoPrincipal}>
                  Concluir
                </button>
              </form>
            </>
          )}
        </span>
      </div>
    </li>
  );
}

export default async function AtendimentosPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ ok?: string; erro?: string; quando?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const [podeVer, podeEditar] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"),
  ]);
  if (!podeVer) redirect(`/loja/${sc.loja.id}`);

  const { lojaId } = await params;
  const { ok, erro, quando } = await searchParams;
  const historico = quando === "historico";

  const lista = await listarAtendimentos(sc.loja.id, { finalizados: historico });
  const aviso = (ok && AVISOS[ok]) || (erro && AVISOS[erro]) || null;

  // Fila (abertos): atrasados (data vencida, ainda em aberto), hoje e próximos.
  const hoje = hojeUTC().getTime();
  const amanha = hoje + 86_400_000;
  const atrasados = !historico ? lista.filter((a) => a.inicio.getTime() < hoje) : [];
  const deHoje = !historico ? lista.filter((a) => a.inicio.getTime() >= hoje && a.inicio.getTime() < amanha) : [];
  const proximos = !historico ? lista.filter((a) => a.inicio.getTime() >= amanha) : [];

  const listaClasses =
    "flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
          ← {sc.loja.nome}
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-[24px] font-light tracking-tight text-tinta">
            {historico ? "Atendimentos anteriores" : "Atendimentos"}
          </h1>
          <Link href={`/loja/${lojaId}/atendimentos/novo`} className={botaoSuave}>
            Agendar
          </Link>
        </div>
        <p className="text-[14px] text-cinza-fumo">
          {historico ? "Os atendimentos já finalizados." : "Receba a noiva, registre o atendimento e o desfecho."}
        </p>
      </header>

      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      {historico ? (
        lista.length === 0 ? (
          <p className="text-[15px] text-tinta">Nenhum atendimento finalizado ainda.</p>
        ) : (
          <ul className={listaClasses}>
            {lista.map((a) => (
              <Linha key={a.id} a={a} lojaId={lojaId} podeEditar={false} comData />
            ))}
          </ul>
        )
      ) : (
        <div className="flex flex-col gap-8">
          {atrasados.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-bordo">Atrasados</h2>
              <ul className={listaClasses}>
                {atrasados.map((a) => (
                  <Linha key={a.id} a={a} lojaId={lojaId} podeEditar={podeEditar} comData />
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Hoje</h2>
            {deHoje.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-[15px] text-tinta">Nenhum atendimento hoje.</p>
                <Link href={`/loja/${lojaId}/atendimentos/novo`} className={botaoSuave}>
                  Agendar um atendimento
                </Link>
              </div>
            ) : (
              <ul className={listaClasses}>
                {deHoje.map((a) => (
                  <Linha key={a.id} a={a} lojaId={lojaId} podeEditar={podeEditar} />
                ))}
              </ul>
            )}
          </section>

          {proximos.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Próximos</h2>
              <ul className={listaClasses}>
                {proximos.map((a) => (
                  <Linha key={a.id} a={a} lojaId={lojaId} podeEditar={podeEditar} comData />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <div className="border-t border-borda-suave pt-5">
        <Link
          href={historico ? `/loja/${lojaId}/atendimentos` : `/loja/${lojaId}/atendimentos?quando=historico`}
          className="inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline
            decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta
            hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        >
          {historico ? "← Voltar à fila de atendimentos" : "Ver atendimentos anteriores"}
        </Link>
      </div>
    </main>
  );
}
