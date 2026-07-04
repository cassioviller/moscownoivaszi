// Painel "Casamentos próximos" — dado real (Lead.casamentoData). Cada linha: um
// datechip (dia grande + mês abreviado), o nome e quanto falta. Datas formatadas em
// UTC DE PROPÓSITO: casamentoData é data-só guardada à meia-noite UTC; formatar
// noutro fuso causaria off-by-one.
import Link from "next/link";
import type { CasamentoProximo } from "@/lib/loja/painel";

const fmtDia = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit" });
const fmtMes = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short" });

function rotuloDias(dias: number): string {
  if (dias <= 0) return "é hoje";
  if (dias === 1) return "falta 1 dia";
  return `faltam ${dias} dias`;
}

export function PainelCasamentos({ lojaId, casamentos }: { lojaId: string; casamentos: CasamentoProximo[] }) {
  return (
    <section className="flex flex-col rounded-[var(--mn-radius-lg)] border border-borda-suave bg-papel-elevado shadow-[var(--mn-shadow-soft)]">
      <div className="flex items-center justify-between gap-3 border-b border-borda-suave px-[18px] py-3">
        <h2 className="font-display text-[16px] font-normal text-tinta">Casamentos próximos</h2>
        <Link href={`/loja/${lojaId}/noivas`} className="text-[12px] font-semibold text-bordo transition hover:text-bordo-deep">
          Ver todos
        </Link>
      </div>
      <div className="flex flex-col">
        {casamentos.map((c) => (
          <div key={c.id} className="flex items-center gap-3 border-b border-borda-suave px-[18px] py-3 last:border-b-0">
            <span className="flex w-[42px] shrink-0 flex-col items-center rounded-[10px] border border-borda-suave bg-papel-suave py-1">
              <span className="text-[15px] font-bold leading-none tabular-nums text-tinta">{fmtDia.format(c.data)}</span>
              <span className="text-[9px] uppercase tracking-[0.1em] text-cinza-fumo">
                {fmtMes.format(c.data).replace(".", "")}
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13.5px] font-medium text-tinta">{c.noivaNome}</span>
              <span className="text-[11.5px] text-cinza-fumo">{rotuloDias(c.diasRestantes)}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
