// Painel "Casamentos próximos" — dado real (Lead.casamentoData). Cada linha: a
// noiva, a data e quanto falta. Datas formatadas em UTC DE PROPÓSITO: casamentoData
// é data-só guardada à meia-noite UTC; formatar noutro fuso causaria off-by-one.
import type { CasamentoProximo } from "@/lib/loja/painel";

const fmtData = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "long",
});

function rotuloDias(dias: number): string {
  if (dias <= 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

export function PainelCasamentos({ casamentos }: { casamentos: CasamentoProximo[] }) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado px-6 py-6 shadow-[var(--mn-shadow-soft)]">
      <p className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Casamentos próximos</p>
      <ul className="flex flex-col divide-y divide-borda-suave">
        {casamentos.map((c) => (
          <li key={c.id} className="flex items-baseline justify-between gap-4 py-2.5">
            <span className="flex flex-col gap-0.5">
              <span className="text-[14px] text-tinta">{c.noivaNome}</span>
              <span className="text-[12px] text-cinza-fumo">{fmtData.format(c.data)}</span>
            </span>
            <span className="shrink-0 text-[12px] text-grafite">{rotuloDias(c.diasRestantes)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
