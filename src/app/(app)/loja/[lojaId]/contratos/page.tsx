// src/app/(app)/loja/[lojaId]/contratos/page.tsx
// Contratos da loja — a venda de cada noiva. Um contrato nasce de um orçamento aprovado
// (ou do perfil da noiva), não há "novo" em branco aqui. Gate em leads:ver.
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirAcesso } from "@/lib/server/acoes";
import { listarContratosDaLoja, type ContratoResumo } from "@/lib/contratos/contratos";
import { brl } from "@/lib/dinheiro";
import type { ContratoStatus } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const data = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

const ROTULO_STATUS: Record<ContratoStatus, string> = { ATIVO: "Ativo", CANCELADO: "Cancelado" };
const FILTROS: { chave: string; rotulo: string; status?: ContratoStatus }[] = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "ATIVO", rotulo: "Ativos", status: "ATIVO" },
  { chave: "CANCELADO", rotulo: "Cancelados", status: "CANCELADO" },
];

export default async function ContratosPage({
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
  const lista: ContratoResumo[] = await listarContratosDaLoja(sc.loja.id, { status: filtro.status });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
          ← {sc.loja.nome}
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Contratos</h1>
        <p className="text-[14px] text-cinza-fumo">A venda firmada de cada noiva.</p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const ativo = f.chave === filtro.chave;
          return (
            <Link
              key={f.chave}
              href={f.status ? `/loja/${lojaId}/contratos?status=${f.chave}` : `/loja/${lojaId}/contratos`}
              className={[
                "inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] transition-colors duration-150",
                ativo ? "border-bordo bg-bordo/5 text-bordo" : "border-borda-suave bg-papel text-grafite hover:border-cinza-fumo hover:text-tinta",
              ].join(" ")}
            >
              {f.rotulo}
            </Link>
          );
        })}
      </nav>

      {lista.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] text-tinta">Nenhum contrato por aqui ainda.</p>
          <p className="max-w-[46ch] text-[13px] text-cinza-fumo">
            Um contrato nasce de um orçamento aprovado (ou do perfil da noiva). Quando você gerar o primeiro,
            ele aparece aqui.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
          {lista.map((c) => (
            <li key={c.id}>
              <Link
                href={`/loja/${lojaId}/contratos/${c.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-rose-dust/10"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className={`text-[15px] ${c.status === "CANCELADO" ? "text-cinza-fumo line-through" : "text-tinta"}`}>
                    {c.noivaNome ?? "Noiva"}
                  </span>
                  <span className="text-[12px] text-cinza-fumo">
                    {ROTULO_STATUS[c.status]} · {data.format(c.fechadoEm)}
                  </span>
                </div>
                <span className="shrink-0 font-display text-[16px] font-light tabular-nums text-tinta">{brl(c.valorTotal)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
