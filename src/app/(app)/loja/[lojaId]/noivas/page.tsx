// src/app/(app)/loja/[lojaId]/noivas/page.tsx
import Link from "next/link";
import { exigirAcesso } from "@/lib/server/acoes";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarLeads, estagiosDasNoivas } from "@/lib/leads/leads";
import { ROTULO_ESTAGIO } from "@/lib/leads/jornada";
import { BotaoConfirmar } from "@/components/ui/botao-confirmar";
import { marcarPerdidaAction } from "./[leadId]/jornada-actions";

export const dynamic = "force-dynamic";

// UTC: a data nasce em meia-noite UTC (leads.ts) — exibir em UTC evita off-by-one.
const dataFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

const AVISOS: Record<string, string> = {
  "1": "Noiva adicionada.",
  desativada: "Noiva desativada — fora da jornada ativa.",
  reativada: "Noiva reativada.",
};

export default async function NoivasPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const sc = await exigirAcesso("leads");

  const { lojaId } = await params;
  const { ok } = await searchParams;
  const [noivas, estagios, podeCriar, podeEditar] = await Promise.all([
    listarLeads(sc.loja.id),
    estagiosDasNoivas(sc.loja.id),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "criar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"),
  ]);
  const aviso = ok ? (AVISOS[ok] ?? null) : null;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href={`/loja/${lojaId}`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
            ← {sc.loja.nome}
          </Link>
          <h1 className="text-[24px] font-light tracking-tight text-tinta">Noivas</h1>
          <p className="text-[14px] text-cinza-fumo">Cada noiva, sua jornada e o casamento à vista.</p>
        </div>
        {podeCriar && (
          <Link
            href={`/loja/${lojaId}/noivas/nova`}
            className="inline-flex items-center justify-center rounded-md bg-bordo px-4 py-2.5 text-[14px] font-medium tracking-[0.01em] text-papel transition-colors duration-150 ease-out hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
          >
            Adicionar noiva
          </Link>
        )}
      </header>

      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      {noivas.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] text-tinta">Nenhuma noiva por aqui ainda.</p>
          <p className="text-[13px] text-cinza-fumo">
            {podeCriar
              ? "Adicione a primeira noiva para começar a acompanhar a jornada."
              : "Peça à administração para adicionar as noivas."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {noivas.map((n) => {
            const est = estagios.get(n.id);
            const rotuloEtapa = est ? (est.encerrada ?? ROTULO_ESTAGIO[est.atual]) : "Cadastrada";
            const perdida = n.perdidaEm != null; // "desativada" = fora da jornada ativa
            return (
              <article
                key={n.id}
                className={`flex flex-col gap-3 rounded-[var(--mn-radius-lg)] border border-borda-suave bg-papel-elevado p-5 shadow-[var(--mn-shadow-soft)] transition-shadow duration-200 hover:shadow-[var(--mn-shadow-hover)] ${perdida ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h2 className="truncate text-[17px] font-light text-tinta">{n.noivaNome}</h2>
                    {n.noivoNome && <span className="text-[12px] text-cinza-fumo">&amp; {n.noivoNome}</span>}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${perdida ? "border-borda text-cinza-fumo" : "border-champagne/60 text-bordo"}`}
                  >
                    {perdida ? "Desativada" : rotuloEtapa}
                  </span>
                </div>

                <dl className="flex flex-col gap-1 border-t border-borda-suave pt-3 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-cinza-fumo">Casamento</dt>
                    <dd className="tabular-nums text-grafite">{n.casamentoData ? dataFmt.format(n.casamentoData) : "a definir"}</dd>
                  </div>
                  {n.whatsapp && (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-cinza-fumo">WhatsApp</dt>
                      <dd className="tabular-nums text-grafite">{n.whatsapp}</dd>
                    </div>
                  )}
                </dl>

                <div className="flex items-center justify-between gap-3 border-t border-borda-suave pt-3">
                  <Link
                    href={`/loja/${lojaId}/noivas/${n.id}`}
                    className="inline-flex min-h-9 items-center rounded-md border border-borda px-3 text-[13px] text-tinta transition-colors duration-150 hover:border-bordo hover:text-bordo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                  >
                    Detalhes
                  </Link>
                  {podeEditar && (
                    <form action={marcarPerdidaAction}>
                      <input type="hidden" name="leadId" value={n.id} />
                      <input type="hidden" name="ligar" value={perdida ? "0" : "1"} />
                      <input type="hidden" name="voltar" value={`/loja/${lojaId}/noivas`} />
                      {perdida ? (
                        <button
                          type="submit"
                          className="inline-flex min-h-9 items-center rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                        >
                          Reativar
                        </button>
                      ) : (
                        <BotaoConfirmar
                          mensagem={`Desativar ${n.noivaNome}? Ela sai da jornada ativa — você pode reativar depois.`}
                          className="inline-flex min-h-9 items-center rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-bordo hover:decoration-bordo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                        >
                          Desativar
                        </BotaoConfirmar>
                      )}
                    </form>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
