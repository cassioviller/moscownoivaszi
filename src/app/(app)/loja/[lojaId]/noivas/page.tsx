// src/app/(app)/loja/[lojaId]/noivas/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarLeads, ROTULO_ETAPA } from "@/lib/leads/leads";

export const dynamic = "force-dynamic";

// UTC: a data nasce em meia-noite UTC (leads.ts) — exibir em UTC evita off-by-one.
const dataFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export default async function NoivasPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"))) redirect(`/loja/${sc.loja.id}`);

  const { lojaId } = await params;
  const { ok } = await searchParams;
  const [noivas, podeCriar, podeEditar, iVer, iCriar, iEditar] = await Promise.all([
    listarLeads(sc.loja.id),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "criar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "editar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "interesses", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "interesses", "criar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "interesses", "editar"),
  ]);
  const iMexer = iCriar || iEditar; // criar OU editar → pode preencher/editar

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href={`/loja/${lojaId}`}
            className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
          >
            ← {sc.loja.nome}
          </Link>
          <h1 className="text-[24px] font-light tracking-tight text-tinta">Noivas</h1>
        </div>
        {podeCriar && (
          <Link
            href={`/loja/${lojaId}/noivas/nova`}
            className="inline-flex items-center justify-center rounded-md bg-bordo px-4 py-2.5
              text-[14px] font-medium tracking-[0.01em] text-papel transition-colors duration-150 ease-out
              hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
          >
            Adicionar noiva
          </Link>
        )}
      </header>

      {ok && <p className="text-[13px] text-grafite">Noiva adicionada.</p>}

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
        <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
          {noivas.map((n) => {
            const meta = [ROTULO_ETAPA[n.etapa], n.noivoNome ? `& ${n.noivoNome}` : null]
              .filter(Boolean)
              .join(" · ");
            // Link de interesses muda conforme a permissão (e se já há interesse).
            const interesseLabel = iMexer
              ? n.interesse
                ? "Editar interesses"
                : "Preencher interesses"
              : iVer
                ? "Ver interesses"
                : null;
            return (
              <li key={n.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[14px] text-tinta">{n.noivaNome}</span>
                  <span className="text-[12px] text-cinza-fumo">{meta}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {n.casamentoData && (
                    <span className="text-[13px] tabular-nums text-grafite">
                      {dataFmt.format(n.casamentoData)}
                    </span>
                  )}
                  <span className="flex items-center gap-3">
                    {podeEditar && (
                      <Link
                        href={`/loja/${lojaId}/noivas/${n.id}/editar`}
                        className="rounded-sm text-[12px] text-grafite underline decoration-borda underline-offset-4
                          transition-colors duration-150 hover:text-tinta hover:decoration-champagne
                          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                      >
                        Editar
                      </Link>
                    )}
                    {interesseLabel && (
                      <Link
                        href={`/loja/${lojaId}/noivas/${n.id}/interesses`}
                        className="rounded-sm text-[12px] text-grafite underline decoration-borda underline-offset-4
                          transition-colors duration-150 hover:text-tinta hover:decoration-champagne
                          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                      >
                        {interesseLabel}
                      </Link>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
