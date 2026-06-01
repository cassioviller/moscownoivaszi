// src/app/(app)/loja/[lojaId]/ajustes/page.tsx
// Ajustes — a fila da costureira. Lente do atelier: os ajustes PENDENTES da loja,
// do casamento mais próximo ao mais distante (urgência primeiro). Cada item traz
// noiva, vestido e prazo, com um toque para marcar feito. O bordô fica reservado à
// urgência (casamento ≤14d), não a toda linha. Gate: ajustes:ver; marcar: ajustes:editar.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarAjustesPendentes } from "@/lib/atelier/ajustes";
import { marcarFeitoAction } from "./actions";

export const dynamic = "force-dynamic";

const DIA_MS = 86_400_000;
const JANELA_URGENCIA_DIAS = 14; // mesmo limiar do dashboard/perfil/livro

const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

// Hoje como meia-noite UTC do dia-calendário em São Paulo (convenção do sistema).
function hojeUTC(): number {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`).getTime();
}

const AVISOS: Record<string, string> = { feito: "Ajuste concluído." };

export default async function AjustesPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "ver"))) {
    redirect(`/loja/${sc.loja.id}`);
  }

  const { lojaId } = await params;
  const { ok } = await searchParams;
  const [podeEditar, pendentes] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "editar"),
    listarAjustesPendentes(sc.loja.id),
  ]);
  const hoje = hojeUTC();
  const aviso = ok ? AVISOS[ok] : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={`/loja/${lojaId}`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← {sc.loja.nome}
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Ajustes</h1>
        <p className="text-[14px] text-cinza-fumo">
          Os ajustes de costura que pedem atenção, do casamento mais próximo ao mais distante.
        </p>
      </header>

      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      {pendentes.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] text-tinta">Nenhum ajuste pendente.</p>
          <p className="max-w-[46ch] text-[13px] text-cinza-fumo">
            Quando uma prova gerar um ajuste de costura, ele aparece aqui — com a noiva, o vestido e o
            prazo — até ser concluído.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
          {pendentes.map((a) => {
            const dias =
              a.casamentoData != null
                ? Math.round((a.casamentoData.getTime() - hoje) / DIA_MS)
                : null;
            const urgente = dias !== null && dias >= 0 && dias <= JANELA_URGENCIA_DIAS;
            return (
              <li key={a.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[15px] text-tinta">{a.descricao}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-cinza-fumo">
                    {a.leadId ? (
                      <Link
                        href={`/loja/${lojaId}/noivas/${a.leadId}`}
                        className="rounded-sm transition-colors duration-150 hover:text-bordo
                          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                      >
                        {a.noivaNome ?? "Noiva"}
                      </Link>
                    ) : (
                      <span>{a.noivaNome ?? "Noiva"}</span>
                    )}
                    <span>·</span>
                    <span>
                      {a.vestidoCodigo} · {a.vestidoNome}
                    </span>
                    {a.casamentoData && (
                      <>
                        <span>·</span>
                        <span className={urgente ? "text-bordo" : undefined}>
                          casamento {dataCurta.format(a.casamentoData)}
                        </span>
                      </>
                    )}
                    {a.checklistTotal > 0 && (
                      <>
                        <span>·</span>
                        <span>
                          checklist {a.checklistFeitos}/{a.checklistTotal}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Link
                    href={`/loja/${lojaId}/reservas/${a.bloqueioId}`}
                    className="rounded-sm text-[12px] text-grafite underline decoration-borda underline-offset-4
                      transition-colors duration-150 hover:text-bordo hover:decoration-champagne
                      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                  >
                    Abrir
                  </Link>
                  {podeEditar && (
                    <form action={marcarFeitoAction}>
                      <input type="hidden" name="ajusteId" value={a.id} />
                      <button
                        type="submit"
                        className="inline-flex min-h-11 items-center rounded-sm text-[12px] text-grafite underline
                          decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta
                          hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2
                          focus-visible:outline-bordo"
                      >
                        Marcar feito
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
