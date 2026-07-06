// Painel "Atenções imediatas" (§8.4/§10) — noivas com casamento muito próximo
// ainda com trabalho em aberto (em provas / orçamento). NÃO é alarme: tom calmo,
// rosé como detalhe emocional (§5), sem vermelho. Só aparece quando há o que
// cuidar — a ausência é a calma. Data em UTC (data-só à meia-noite UTC).
import type { Atencao } from "@/lib/loja/painel";

const fmtData = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "long",
});

function rotuloDias(dias: number): string {
  if (dias <= 0) return "casa hoje";
  if (dias === 1) return "casa amanhã";
  return `casa em ${dias} dias`;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "—";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (partes[0][0] + ultima).toUpperCase();
}

export function PainelAtencoes({ atencoes }: { atencoes: Atencao[] }) {
  return (
    <section
      className="flex flex-col gap-4 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado
        px-6 py-6 shadow-[var(--mn-shadow-soft)]"
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Atenções imediatas</p>
      <ul className="flex flex-col divide-y divide-borda-suave">
        {atencoes.map((a) => (
          <li key={a.id} className="flex items-center gap-3.5 py-3">
            {/* marca rosé delicada — detalhe emocional, não alarme */}
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-dust/60
                bg-papel-suave font-display text-[13px] tracking-[0.02em] text-grafite"
            >
              {iniciais(a.noivaNome)}
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[14px] text-tinta">{a.noivaNome}</span>
              <span className="text-[12px] text-cinza-fumo">{a.rotulo}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="text-[12px] text-grafite">{rotuloDias(a.diasRestantes)}</span>
              <span className="text-[11px] text-cinza-fumo">{fmtData.format(a.data)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
