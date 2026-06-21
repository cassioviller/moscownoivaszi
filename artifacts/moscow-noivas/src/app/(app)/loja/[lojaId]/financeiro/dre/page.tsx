// src/app/(app)/loja/[lojaId]/financeiro/dre/page.tsx
// Resultado do mês (DRE simples, regime de caixa): receitas − despesas por categoria por
// competência selecionável. Leitura pura; gate financeiro:ver. Resultado negativo em bordô.
import Link from "next/link";
import { exigirAcesso } from "@/lib/server/acoes";
import { dreDoMes } from "@/lib/financeiro/dre";
import { competenciaValida, competenciaAtual } from "@/lib/financeiro/datas";
import { brl } from "@/lib/dinheiro";

export const dynamic = "force-dynamic";

const mesFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const comp2 = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

export default async function DREPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ comp?: string }>;
}) {
  const sc = await exigirAcesso("financeiro");
  const { lojaId } = await params;
  const sp = await searchParams;
  const comp = competenciaValida(sp.comp ?? "") ? sp.comp! : competenciaAtual();
  const dre = await dreDoMes(sc.loja.id, comp);

  const [y, m] = comp.split("-").map(Number);
  const prev = m === 1 ? comp2(y - 1, 12) : comp2(y, m - 1);
  const next = m === 12 ? comp2(y + 1, 1) : comp2(y, m + 1);
  const mesLabel = mesFmt.format(new Date(`${comp}-01T00:00:00.000Z`));
  const resultadoNegativo = Number(dre.resultado) < 0;
  const vazio = dre.receitas === "0.00" && dre.despesas.length === 0;

  const rotulo = "text-[11px] uppercase tracking-[0.18em] text-cinza-fumo";
  const navLink = "rounded-md px-2 py-1 text-[14px] text-grafite hover:bg-papel-suave hover:text-tinta";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <Link href={`/loja/${lojaId}/financeiro`} className="w-fit text-[13px] text-grafite hover:text-tinta">← Fluxo de caixa</Link>
        <h1 className="font-display text-[26px] font-light tracking-tight text-tinta">Resultado do mês</h1>
        <p className="text-[14px] text-cinza-fumo">O que entrou, para onde foi e quanto sobrou — pelo caixa.</p>
      </header>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-[18px] font-light text-tinta first-letter:uppercase">{mesLabel}</h2>
        <div className="flex items-center gap-1">
          <Link href={`/loja/${lojaId}/financeiro/dre?comp=${prev}`} aria-label="Mês anterior" className={navLink}>‹</Link>
          <Link href={`/loja/${lojaId}/financeiro/dre?comp=${next}`} aria-label="Próximo mês" className={navLink}>›</Link>
        </div>
      </div>

      {vazio ? (
        <p className="text-[15px] text-cinza-fumo">Nenhum movimento neste mês.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <section className="flex items-baseline justify-between border-b border-borda-suave pb-2">
            <span className={rotulo}>Recebimentos</span>
            <span className="font-display text-[16px] font-light tabular-nums text-tinta">{brl(dre.receitas)}</span>
          </section>

          <section className="flex flex-col gap-2">
            <span className={rotulo}>Despesas por categoria</span>
            {dre.despesas.length === 0 ? (
              <p className="text-[14px] text-cinza-fumo">Nenhuma despesa neste mês.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
                {dre.despesas.map((d) => (
                  <li key={d.rotulo} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <span className="text-[14px] text-tinta">{d.rotulo}</span>
                    <span className="shrink-0 text-[14px] tabular-nums text-grafite">− {brl(d.total)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <span className="text-[12px] uppercase tracking-[0.18em] text-cinza-fumo">Total de despesas</span>
                  <span className="shrink-0 text-[14px] font-light tabular-nums text-grafite">− {brl(dre.totalDespesas)}</span>
                </li>
              </ul>
            )}
          </section>

          <section className="flex items-baseline justify-between border-t border-borda-suave pt-3">
            <span className={rotulo}>Resultado do mês</span>
            <span className={`font-display text-[24px] font-light tabular-nums ${resultadoNegativo ? "text-bordo" : "text-tinta"}`}>{brl(dre.resultado)}</span>
          </section>
        </div>
      )}
    </main>
  );
}
