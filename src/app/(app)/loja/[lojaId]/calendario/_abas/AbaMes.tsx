// Aba Mês — a grade do mês como mini-agenda. Cada dia mostra casamento (nome, bordô),
// provas/atendimentos (hora · tipo) e, com financeiro:ver, um marcador R$ discreto.
// Clicar num dia abre o Dia do atelier (?dia=). Sem dia, a grade abre limpa.
import Link from "next/link";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { hojeYMD } from "@/lib/tempo";
import { gradeDoMes, mesDeRef, refDoMes, mesVizinho } from "@/lib/calendario/mes";
import { itensDoMes, type ItemDia } from "@/lib/calendario/dados";
import { detalheDoDia } from "@/lib/calendario/dia";
import { DiaDoAtelier } from "@/components/dashboard/dia-do-atelier";

const tituloMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const diaLongo = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" });
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MAX_ITENS = 3;

function rotuloItem(i: ItemDia): string {
  if (i.tipo === "casamento") return `♥ ${i.noivaNome ?? "Casamento"}`;
  return `${i.hora}h ${i.tipo === "prova" ? "prova" : "atend."}`;
}

export async function AbaMes({ lojaId, refParam, dia }: { lojaId: string; refParam?: string; dia?: string }) {
  const sc = await getSessaoComLoja();
  const podeFinanceiro = sc ? await podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "ver") : false;

  const hoje = hojeYMD();
  const { ano, mes0 } = mesDeRef(refParam, hoje);
  const dias = gradeDoMes(ano, mes0, hoje);
  const inicio = dias[0].data;
  const fim = new Date(dias[41].data.getTime());
  fim.setUTCDate(fim.getUTCDate() + 1);

  const porDia = await itensDoMes(lojaId, inicio, fim, { financeiro: podeFinanceiro });

  const ant = mesVizinho(ano, mes0, -1);
  const prox = mesVizinho(ano, mes0, +1);
  const link = (a: { ano: number; mes0: number }) => `/loja/${lojaId}/calendario?aba=mes&ref=${refDoMes(a.ano, a.mes0)}`;
  const linkDia = (ymd: string) => `/loja/${lojaId}/calendario?aba=mes&ref=${refDoMes(ano, mes0)}&dia=${ymd}`;

  const diaSel = dia ?? null;
  const detalhe = diaSel ? await detalheDoDia(lojaId, diaSel, { financeiro: podeFinanceiro }) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <h2 className="font-display text-[18px] font-light text-tinta first-letter:uppercase">
          {tituloMes.format(dias.find((d) => d.noMes)!.data)}
        </h2>
        <div className="flex items-center gap-1">
          <Link href={link(ant)} aria-label="Mês anterior" className="rounded-md px-2 py-1 text-[14px] text-grafite hover:bg-papel-suave hover:text-tinta">‹</Link>
          <Link href={link(prox)} aria-label="Próximo mês" className="rounded-md px-2 py-1 text-[14px] text-grafite hover:bg-papel-suave hover:text-tinta">›</Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[var(--mn-radius-md)] border border-borda-suave bg-borda-suave">
        {SEMANA.map((d) => (
          <div key={d} className="bg-papel-elevado py-2 text-center text-[11px] uppercase tracking-[0.1em] text-cinza-fumo">{d}</div>
        ))}
        {dias.map((d) => {
          const info = porDia.get(d.ymd);
          const itens = info?.itens ?? [];
          const extra = itens.length - MAX_ITENS;
          const selecionado = d.ymd === diaSel;
          return (
            <Link
              key={d.ymd}
              href={linkDia(d.ymd)}
              className={`flex min-h-24 flex-col gap-1 p-1.5 text-left transition-colors duration-150 hover:bg-papel-suave focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-bordo ${d.hoje ? "bg-papel-suave" : "bg-papel-elevado"} ${d.noMes ? "" : "opacity-40"} ${selecionado ? "ring-2 ring-bordo ring-inset" : ""}`}
            >
              <span className="flex items-center justify-between">
                <span className={`text-[12px] tabular-nums ${d.hoje ? "flex h-5 w-5 items-center justify-center rounded-full bg-bordo text-papel-elevado" : info?.atencao ? "rounded-full px-1 font-medium text-bordo ring-1 ring-bordo/40" : "text-grafite"}`}>
                  {d.data.getUTCDate()}
                </span>
                {info?.temFinanceiro && <span className="text-[10px] text-champagne">R$</span>}
              </span>
              <span className="flex flex-col gap-0.5">
                {itens.slice(0, MAX_ITENS).map((i, idx) => (
                  <span key={idx} className={`truncate text-[10px] leading-tight ${i.tipo === "casamento" ? "text-bordo" : "text-grafite"}`}>
                    {rotuloItem(i)}
                  </span>
                ))}
                {extra > 0 && <span className="text-[10px] text-cinza-fumo">+{extra}</span>}
              </span>
            </Link>
          );
        })}
      </div>

      {detalhe && (
        <section className="flex flex-col gap-3 border-t border-borda-suave pt-5">
          <h3 className="font-display text-[16px] font-light text-tinta first-letter:uppercase">
            {diaLongo.format(new Date(`${diaSel}T00:00:00.000Z`))}
          </h3>
          <DiaDoAtelier lojaId={lojaId} dia={detalhe} />
        </section>
      )}
    </div>
  );
}
