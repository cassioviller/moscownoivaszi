// src/components/dashboard/dia-do-atelier.tsx
// "Dia do atelier": as seções com conteúdo de um dia (agenda + financeiro já filtrado
// por permissão pelo chamador). Usado no Início (hoje, com `titulo`+card próprios — o
// visual do mockup "Hoje no atelier") e no Calendário (dia clicado, sem `titulo` — o
// chamador já desenha o cabeçalho do dia, que pode não ser hoje).
import Link from "next/link";
import type { DiaDoAtelier as DiaDoAtelierTipo } from "@/lib/calendario/dia";
import { brl } from "@/lib/dinheiro";
import { Avatar } from "@/components/ui/avatar";
import { Selo } from "@/components/ui/selo";

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

const ROTULO_SITUACAO: Record<string, string> = {
  AGENDADO: "Agendado",
  EM_ATENDIMENTO: "Em atendimento",
  CONCLUIDO: "Concluído",
  FALTOU: "Faltou",
};

// Situação → variante do Selo (ui/selo.tsx §Estados): AGENDADO segue seu curso normal e
// CONCLUIDO terminou bem (ok); EM_ATENDIMENTO está em andamento agora (pendente);
// FALTOU é o único caso que pede cuidado (atenção — bordô discreto, uso raro).
const VARIANTE_SITUACAO: Record<string, "ok" | "pendente" | "atencao"> = {
  AGENDADO: "ok",
  EM_ATENDIMENTO: "pendente",
  CONCLUIDO: "ok",
  FALTOU: "atencao",
};

function PainelHead({ titulo, href }: { titulo: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-borda-suave px-[18px] py-3">
      <h2 className="font-display text-[16px] font-normal text-tinta">{titulo}</h2>
      {href && (
        <Link href={href} className="text-[12px] font-semibold text-bordo transition hover:text-bordo-deep">
          Ver dia completo
        </Link>
      )}
    </div>
  );
}

function Secao({
  titulo,
  aninhado,
  children,
}: {
  titulo: string;
  /** Quando true, o pai já é um card (uso no Início — DiaDoAtelier com `titulo`):
   *  a seção vira só um grupo rotulado, sem sua própria caixa, para não repetir
   *  borda+fundo do card externo ("caixa dentro de caixa"). No Calendário
   *  (`AbaMes`, sem `titulo`), mantém a caixa própria — o chamador não desenha
   *  card ao redor. */
  aninhado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 px-[18px]">
      <h3 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">{titulo}</h3>
      <ul
        className={
          aninhado
            ? "flex flex-col divide-y divide-borda-suave border-t border-borda-suave"
            : "flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado"
        }
      >
        {children}
      </ul>
    </section>
  );
}

type EntradaAgenda = {
  id: string;
  inicio: Date;
  noivaNome: string | null;
  subtitulo: string;
  situacao: string;
  href?: string;
};

export function DiaDoAtelier({
  lojaId,
  dia,
  titulo,
  hrefDiaCompleto,
}: {
  lojaId: string;
  dia: DiaDoAtelierTipo;
  /** Quando informado, o componente desenha seu próprio card + cabeçalho (uso no
   *  Início — "Hoje no atelier"). Sem `titulo`, renderiza só o conteúdo: o chamador já
   *  desenha o cabeçalho do dia (uso no Calendário, onde o dia pode não ser hoje). */
  titulo?: string;
  /** Link "Ver dia completo" no cabeçalho — só aparece junto de `titulo`. */
  hrefDiaCompleto?: string;
}) {
  const vazio =
    dia.atendimentos.length + dia.provas.length + dia.casamentos.length + dia.aReceber.length + dia.aPagar.length === 0;

  if (vazio) {
    if (!titulo) return <p className="text-[14px] text-cinza-fumo">Nada agendado para este dia.</p>;
    return (
      <div className="flex flex-col rounded-[var(--mn-radius-lg)] border border-borda-suave bg-papel-elevado shadow-[var(--mn-shadow-soft)]">
        <PainelHead titulo={titulo} href={hrefDiaCompleto} />
        <p className="px-[18px] py-4 text-[14px] text-cinza-fumo">Nada agendado para este dia.</p>
      </div>
    );
  }

  // Agenda unificada: atendimentos e provas têm horário, então viram uma única lista
  // de linhas (".row") ordenada por hora — o coração visual do painel (mockup .rows).
  // Casamentos e financeiro (sem horário) seguem em seções próprias abaixo, como antes.
  const agenda: EntradaAgenda[] = [
    ...dia.atendimentos.map((a) => ({
      id: `at-${a.id}`,
      inicio: a.inicio,
      noivaNome: a.noivaNome,
      subtitulo: ["Atendimento", [a.cabineNome, a.vendedoraNome].filter(Boolean).join(" · ") || null]
        .filter(Boolean)
        .join(" · "),
      situacao: a.situacao,
    })),
    ...dia.provas.map((p) => ({
      id: `pr-${p.id}`,
      inicio: p.inicio,
      noivaNome: p.noivaNome,
      subtitulo: ["Prova", [p.vestidoCodigo, p.vestidoNome].filter(Boolean).join(" · ") || null]
        .filter(Boolean)
        .join(" · "),
      situacao: p.situacao,
      href: p.bloqueioId ? `/loja/${lojaId}/reservas/${p.bloqueioId}` : undefined,
    })),
  ].sort((x, y) => x.inicio.getTime() - y.inicio.getTime());

  const conteudo = (
    <div className="flex flex-col gap-5 py-1">
      {agenda.length > 0 && (
        <div className="flex flex-col">
          {agenda.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-3 border-b border-borda-suave px-[18px] py-3 last:border-b-0"
            >
              <span className="w-[42px] shrink-0 text-[12.5px] tabular-nums text-cinza-fumo">{hora.format(e.inicio)}</span>
              <Avatar nome={e.noivaNome ?? "Noiva"} tamanho="sm" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13.5px] font-medium text-tinta">{e.noivaNome ?? "Noiva"}</span>
                <span className="truncate text-[11.5px] text-cinza-fumo">{e.subtitulo}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Selo variante={VARIANTE_SITUACAO[e.situacao] ?? "ok"}>{ROTULO_SITUACAO[e.situacao] ?? e.situacao}</Selo>
                {e.href && (
                  <Link
                    href={e.href}
                    className="text-[12px] text-grafite underline decoration-borda underline-offset-4 hover:text-bordo"
                  >
                    Abrir
                  </Link>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {titulo && (
        <Link
          href={`/loja/${lojaId}/atendimentos/novo`}
          className="flex items-center justify-center gap-2 px-[18px] py-3 text-[12.5px] font-semibold text-bordo transition hover:bg-[rgba(122,24,54,0.04)]"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.9} className="h-[14px] w-[14px] stroke-current">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Agendar atendimento
        </Link>
      )}

      {dia.casamentos.length > 0 && (
        <Secao titulo="Casamentos" aninhado={Boolean(titulo)}>
          {dia.casamentos.map((c) => (
            <li key={c.bloqueioId} className="flex items-center gap-3.5 px-4 py-3">
              <Avatar nome={c.noivaNome ?? "Noiva"} tamanho="sm" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13.5px] font-medium text-bordo">{c.noivaNome ?? "Noiva"}</span>
                <span className="truncate text-[11.5px] text-cinza-fumo">
                  {c.vestidoCodigo} · {c.vestidoNome}
                </span>
              </span>
            </li>
          ))}
        </Secao>
      )}

      {dia.aReceber.length > 0 && (
        <Secao titulo="A receber" aninhado={Boolean(titulo)}>
          {dia.aReceber.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="min-w-0 truncate text-[14px] text-tinta">{r.noivaNome ?? "Noiva"}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-[13px] tabular-nums text-grafite">{brl(r.valor)}</span>
                <Selo variante={r.status === "PAGA" ? "ok" : "pendente"}>{r.status === "PAGA" ? "paga" : "prevista"}</Selo>
              </span>
            </li>
          ))}
        </Secao>
      )}

      {dia.aPagar.length > 0 && (
        <Secao titulo="A pagar" aninhado={Boolean(titulo)}>
          {dia.aPagar.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="min-w-0 truncate text-[14px] text-tinta">{c.descricao}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-[13px] tabular-nums text-grafite">{brl(c.valor)}</span>
                <Selo variante={c.status === "PAGA" ? "ok" : "pendente"}>{c.status === "PAGA" ? "paga" : "prevista"}</Selo>
              </span>
            </li>
          ))}
        </Secao>
      )}
    </div>
  );

  if (!titulo) return conteudo;

  return (
    <div className="flex flex-col rounded-[var(--mn-radius-lg)] border border-borda-suave bg-papel-elevado shadow-[var(--mn-shadow-soft)]">
      <PainelHead titulo={titulo} href={hrefDiaCompleto} />
      {conteudo}
    </div>
  );
}
