// src/app/(app)/loja/[lojaId]/orcamentos/page.tsx
// Orçamentos da loja — a negociação de cada noiva, por status. Lente "comercial": uma
// linha por orçamento, com noiva, total e estado. Abrir um orçamento nasce do
// atendimento ou do perfil da noiva (não há "novo" solto aqui). Gate em leads:ver.
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirAcesso } from "@/lib/server/acoes";
import { listarOrcamentosDaLoja, type OrcamentoResumo } from "@/lib/orcamentos/orcamentos";
import { brl } from "@/lib/dinheiro";
import type { OrcamentoStatus } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const data = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

const ROTULO_STATUS: Record<OrcamentoStatus, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
};
const FILTROS: { chave: string; rotulo: string; status?: OrcamentoStatus }[] = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "RASCUNHO", rotulo: "Rascunhos", status: "RASCUNHO" },
  { chave: "ENVIADO", rotulo: "Enviados", status: "ENVIADO" },
  { chave: "APROVADO", rotulo: "Aprovados", status: "APROVADO" },
  { chave: "RECUSADO", rotulo: "Recusados", status: "RECUSADO" },
];

export default async function OrcamentosPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const sc = await exigirAcesso("leads");

  const { lojaId } = await params;
  const { status } = await searchParams;
  const filtro = FILTROS.find((f) => f.chave === status) ?? FILTROS[0];

  const lista: OrcamentoResumo[] = await listarOrcamentosDaLoja(sc.loja.id, { status: filtro.status });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
          ← {sc.loja.nome}
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Orçamentos</h1>
        <p className="text-[14px] text-cinza-fumo">A negociação de cada noiva, registrada.</p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const ativo = f.chave === filtro.chave;
          return (
            <Link
              key={f.chave}
              href={f.status ? `/loja/${lojaId}/orcamentos?status=${f.chave}` : `/loja/${lojaId}/orcamentos`}
              className={[
                "inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] transition-colors duration-150",
                ativo
                  ? "border-bordo bg-bordo/5 text-bordo"
                  : "border-borda-suave bg-papel text-grafite hover:border-cinza-fumo hover:text-tinta",
              ].join(" ")}
            >
              {f.rotulo}
            </Link>
          );
        })}
      </nav>

      {lista.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] text-tinta">Nenhum orçamento por aqui ainda.</p>
          <p className="max-w-[46ch] text-[13px] text-cinza-fumo">
            Um orçamento nasce durante o atendimento da noiva (ou pelo perfil dela). Quando você abrir o primeiro,
            ele aparece aqui.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
          {lista.map((o) => (
            <li key={o.id}>
              <Link
                href={`/loja/${lojaId}/orcamentos/${o.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-rose-dust/10"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[15px] text-tinta">{o.noivaNome ?? "Noiva"}</span>
                  <span className="text-[12px] text-cinza-fumo">
                    {ROTULO_STATUS[o.status]} · {o.qtdItens} {o.qtdItens === 1 ? "item" : "itens"} · {data.format(o.createdAt)}
                  </span>
                </div>
                <span className="shrink-0 font-display text-[16px] font-light tabular-nums text-tinta">
                  {brl(o.total)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
