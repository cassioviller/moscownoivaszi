// src/app/(app)/loja/[lojaId]/ajustes/page.tsx
// Ajustes — a fila da costureira. Lente do atelier: os ajustes PENDENTES da loja,
// do casamento mais próximo ao mais distante (urgência primeiro). Cada item traz
// noiva, vestido e prazo, com um toque para marcar feito. O bordô fica reservado à
// urgência (casamento ≤14d), não a toda linha. Gate: ajustes:ver; marcar: ajustes:editar.
import Link from "next/link";
import { redirect } from "next/navigation";
import { AvisoFlash } from "@/components/ui/aviso-flash";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarAjustesPendentes } from "@/lib/atelier/ajustes";
import { paginar, TAMANHO_PAGINA } from "@/lib/paginacao";
import { Paginacao } from "@/components/Paginacao";
import { marcarFeitoAction } from "./actions";
import { hojeUTC } from "@/lib/tempo";
import { diasAteCasamento, casamentoUrgente, prazoCasamento } from "@/lib/leads/contagem-casamento";

export const dynamic = "force-dynamic";

const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const AVISOS: Record<string, string> = {
  feito: "Ajuste concluído.",
  ajuste_invalido: "Ajuste não encontrado.",
};

export default async function AjustesPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ ok?: string; erro?: string; p?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "ver"))) {
    redirect(`/loja/${sc.loja.id}`);
  }

  const { lojaId } = await params;
  const sp = await searchParams;
  const [podeEditar, fila] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "editar"),
    listarAjustesPendentes(sc.loja.id, { pagina: sp.p }),
  ]);
  const { itens: pendentes, total } = fila;
  const hoje = hojeUTC().getTime();
  const aviso = (sp.ok && AVISOS[sp.ok]) || (sp.erro && AVISOS[sp.erro]) || null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={`/loja/${lojaId}`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← {sc.loja.nome}
        </Link>
        <h1 className="font-display text-[26px] font-light tracking-tight text-tinta">Ajustes</h1>
        <p className="text-[14px] text-cinza-fumo">
          Os ajustes de costura que pedem atenção, do casamento mais próximo ao mais distante.
        </p>
      </header>

      {aviso && <AvisoFlash tom={sp.ok ? "ok" : "erro"}>{aviso}</AvisoFlash>}

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
                ? diasAteCasamento(a.casamentoData, hoje)
                : null;
            const urgente = dias !== null && casamentoUrgente(dias);
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
                    {a.casamentoData && dias !== null && (
                      <>
                        <span>·</span>
                        {/* urgência primeiro (bordô só ≤14d), data exata como referência */}
                        <span className={urgente ? "text-bordo" : undefined}>{prazoCasamento(dias)}</span>
                        <span>·</span>
                        <span>{dataCurta.format(a.casamentoData)}</span>
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

      <Paginacao
        pagina={paginar(sp.p).pagina}
        total={total}
        tamanho={TAMANHO_PAGINA}
        href={(p) => `?${new URLSearchParams({ p: String(p) }).toString()}`}
      />
    </main>
  );
}
