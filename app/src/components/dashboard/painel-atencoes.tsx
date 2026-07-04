// Painel "Atenções" (§8.4/§10) — noivas com casamento muito próximo ainda com
// trabalho em aberto (em provas / orçamento). NÃO é alarme: tom calmo, o bordô
// aparece só como joia (count-pill, ícone), sem vermelho. Só aparece quando há o
// que cuidar — a ausência é a calma (gate em page.tsx, preservado). Data em UTC
// (data-só à meia-noite UTC) mas não exibida aqui: só "casa em N dias".
import Link from "next/link";
import type { Atencao } from "@/lib/loja/painel";
import { iconeNav } from "@/components/layout/icones-nav";

// rotulo vem de ROTULO_ESTAGIO (jornada.ts) — hoje só "Orçamento aberto" e "Em
// provas" alimentam este painel (ESTAGIOS_ATENCAO em loja/painel.ts). Mapeamos
// pro ícone mais próximo; qualquer rótulo futuro cai no ícone genérico de casamentos.
const ICONE_POR_ROTULO: Record<string, string> = {
  "Orçamento aberto": "financeiro",
  "Em provas": "provas",
};

function rotuloDias(dias: number): string {
  if (dias <= 0) return "casa hoje";
  if (dias === 1) return "casa amanhã";
  return `casa em ${dias} dias`;
}

export function PainelAtencoes({ lojaId, atencoes }: { lojaId: string; atencoes: Atencao[] }) {
  return (
    <section className="flex flex-col rounded-[var(--mn-radius-lg)] border border-borda-suave bg-papel-elevado shadow-[var(--mn-shadow-soft)]">
      <div className="flex items-center justify-between gap-3 border-b border-borda-suave px-[18px] py-3">
        <h2 className="flex items-center gap-2 font-display text-[16px] font-normal text-tinta">
          Atenções
          <span className="rounded-full bg-[rgba(122,24,54,0.08)] px-2 py-[1px] text-[11px] font-bold tabular-nums text-bordo">
            {atencoes.length}
          </span>
        </h2>
        <Link href={`/loja/${lojaId}/noivas`} className="text-[12px] font-semibold text-bordo transition hover:text-bordo-deep">
          Ver todas
        </Link>
      </div>
      <div className="flex flex-col">
        {atencoes.map((a) => (
          <Link
            key={a.id}
            href={`/loja/${lojaId}/noivas/${a.id}`}
            className="flex items-center gap-3 border-b border-borda-suave px-[18px] py-3 transition last:border-b-0 hover:bg-papel-suave"
          >
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-papel-suave text-bordo">
              {iconeNav(ICONE_POR_ROTULO[a.rotulo] ?? "casamentos")}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium text-tinta">{a.rotulo}</span>
              <span className="truncate text-[11.5px] text-cinza-fumo">
                {a.noivaNome} · {rotuloDias(a.diasRestantes)}
              </span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} className="h-[15px] w-[15px] shrink-0 stroke-cinza-fumo">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        ))}
      </div>
    </section>
  );
}
