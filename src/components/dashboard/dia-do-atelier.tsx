// src/components/dashboard/dia-do-atelier.tsx
// "Dia do atelier": as seções com conteúdo de um dia (agenda + financeiro já filtrado
// por permissão pelo chamador). Usado no Início (hoje) e no Calendário (dia clicado).
import Link from "next/link";
import type { DiaDoAtelier } from "@/lib/calendario/dia";
import { brl } from "@/lib/dinheiro";

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

const ROTULO_SITUACAO: Record<string, string> = {
  AGENDADO: "Agendado",
  EM_ATENDIMENTO: "Em atendimento",
  CONCLUIDO: "Concluído",
  FALTOU: "Faltou",
};

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">{titulo}</h3>
      <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
        {children}
      </ul>
    </section>
  );
}

export function DiaDoAtelier({ lojaId, dia }: { lojaId: string; dia: DiaDoAtelier }) {
  const vazio =
    dia.atendimentos.length + dia.provas.length + dia.casamentos.length + dia.aReceber.length + dia.aPagar.length === 0;
  if (vazio) {
    return <p className="text-[14px] text-cinza-fumo">Nada agendado para este dia.</p>;
  }
  const linha = "flex items-center justify-between gap-4 px-4 py-3";
  return (
    <div className="flex flex-col gap-5">
      {dia.atendimentos.length > 0 && (
        <Secao titulo="Atendimentos">
          {dia.atendimentos.map((a) => (
            <li key={a.id} className={linha}>
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] text-tinta">{hora.format(a.inicio)} · {a.noivaNome ?? "Noiva"}</span>
                <span className="text-[12px] text-cinza-fumo">{[a.cabineNome, a.vendedoraNome].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              <span className="shrink-0 text-[12px] text-grafite">{ROTULO_SITUACAO[a.situacao]}</span>
            </li>
          ))}
        </Secao>
      )}
      {dia.provas.length > 0 && (
        <Secao titulo="Provas">
          {dia.provas.map((p) => (
            <li key={p.id} className={linha}>
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] text-tinta">{hora.format(p.inicio)} · {p.noivaNome ?? "Noiva"}</span>
                <span className="text-[12px] text-cinza-fumo">{[p.vestidoCodigo, p.vestidoNome].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              {p.bloqueioId && (
                <Link href={`/loja/${lojaId}/reservas/${p.bloqueioId}`} className="shrink-0 text-[12px] text-grafite underline decoration-borda underline-offset-4 hover:text-bordo">Abrir</Link>
              )}
            </li>
          ))}
        </Secao>
      )}
      {dia.casamentos.length > 0 && (
        <Secao titulo="Casamentos">
          {dia.casamentos.map((c) => (
            <li key={c.bloqueioId} className={linha}>
              <span className="text-[14px] text-bordo">{c.noivaNome ?? "Noiva"}</span>
              <span className="shrink-0 text-[12px] text-cinza-fumo">{c.vestidoCodigo} · {c.vestidoNome}</span>
            </li>
          ))}
        </Secao>
      )}
      {dia.aReceber.length > 0 && (
        <Secao titulo="A receber">
          {dia.aReceber.map((r) => (
            <li key={r.id} className={linha}>
              <span className="min-w-0 text-[14px] text-tinta">{r.noivaNome ?? "Noiva"}</span>
              <span className="shrink-0 text-[13px] text-grafite tabular-nums">{brl(r.valor)} · {r.status === "PAGA" ? "paga" : "prevista"}</span>
            </li>
          ))}
        </Secao>
      )}
      {dia.aPagar.length > 0 && (
        <Secao titulo="A pagar">
          {dia.aPagar.map((c) => (
            <li key={c.id} className={linha}>
              <span className="min-w-0 text-[14px] text-tinta">{c.descricao}</span>
              <span className="shrink-0 text-[13px] text-grafite tabular-nums">{brl(c.valor)} · {c.status === "PAGA" ? "paga" : "prevista"}</span>
            </li>
          ))}
        </Secao>
      )}
    </div>
  );
}
