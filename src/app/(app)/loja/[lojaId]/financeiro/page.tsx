// src/app/(app)/loja/[lojaId]/financeiro/page.tsx
// Fluxo de caixa — a consolidação do financeiro: o que entrou e saiu do caixa do atelier no
// mês (realizado, pela data do movimento), uma faixa de tendência dos últimos meses, a linha
// do tempo dos movimentos e o horizonte do que ainda está em aberto. Leitura pura (nenhuma
// ação muda dado). Não é extrato bancário. Gate ver=financeiro:ver.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { resumoCaixaIntervalo, movimentosNoIntervalo, tendenciaCaixa, horizonteAberto } from "@/lib/financeiro/fluxo";
import { competenciaAtual } from "@/lib/financeiro/datas";
import { resolverIntervalo } from "@/lib/financeiro/intervalo";
import { brl, dataFmt, rotuloCompetencia, SecaoTitulo, Card, FiltroIntervalo } from "./ui";

export const dynamic = "force-dynamic";

const rotuloMes = (c: string) => rotuloCompetencia(c);

export default async function FluxoDeCaixaPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ ini?: string; fim?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "ver"))) redirect(`/loja/${sc.loja.id}`);

  const { lojaId } = await params;
  const { ini, fim } = await searchParams;
  const intervalo = resolverIntervalo(ini, fim);
  const janela = { gte: intervalo.gte, lt: intervalo.lt };
  const competenciaHoje = competenciaAtual();

  const [resumo, movimentos, tendencia, horizonte] = await Promise.all([
    resumoCaixaIntervalo(sc.loja.id, janela),
    movimentosNoIntervalo(sc.loja.id, janela),
    tendenciaCaixa(sc.loja.id, { meses: 6, ate: competenciaHoje }),
    horizonteAberto(sc.loja.id),
  ]);
  const saldoNegativo = Number(resumo.saldo) < 0;
  const periodoFmt = `${dataFmt.format(intervalo.gte)} – ${dataFmt.format(new Date(intervalo.lt.getTime() - 86_400_000))}`;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
          ← {sc.loja.nome}
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Fluxo de caixa</h1>
        <p className="text-[14px] text-cinza-fumo">O que entrou e saiu do caixa do atelier — pelo que foi registrado aqui, não é o extrato do banco.</p>
      </header>

      <FiltroIntervalo iniYMD={intervalo.iniYMD} fimYMD={intervalo.fimYMD} />

      {/* — Caixa no período — */}
      <section className="flex flex-wrap gap-3">
        <Card rotulo="Entradas" valor={resumo.entradas} />
        <Card rotulo="Saídas" valor={resumo.saidas} />
        <Card rotulo="Saldo" valor={resumo.saldo} destaque={saldoNegativo} />
      </section>

      {/* — Tendência dos últimos meses (sem gráfico, DESIGN §13): o ritmo do caixa como
          lista quieta — saldo é o ponto; entradas/saídas ficam na sub-linha. — */}
      <section className="flex flex-col gap-3">
        <SecaoTitulo>O ritmo dos últimos meses</SecaoTitulo>
        <ol className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
          {tendencia.map((p) => {
            const atual = p.competencia === competenciaHoje;
            const neg = Number(p.saldo) < 0;
            return (
              <li key={p.competencia} className={`flex items-center justify-between gap-4 px-4 py-3 ${atual ? "bg-bordo/5" : ""}`}>
                <div className="flex min-w-0 flex-col">
                  <span className={`text-[14px] capitalize ${atual ? "text-bordo" : "text-tinta"}`}>{rotuloMes(p.competencia)}</span>
                  <span className="text-[12px] tabular-nums text-cinza-fumo">+{brl(p.entradas)} · −{brl(p.saidas)}</span>
                </div>
                <span className={`shrink-0 font-display text-[16px] font-light tabular-nums ${neg ? "text-bordo" : "text-tinta"}`}>{brl(p.saldo)}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* — Linha do tempo do período — */}
      <section className="flex flex-col gap-3">
        <SecaoTitulo>Movimentos · {periodoFmt}</SecaoTitulo>
        {movimentos.length === 0 ? (
          <p className="text-[14px] text-cinza-fumo">Nenhum movimento neste período.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {movimentos.map((m) => {
              const entrada = m.tipo === "ENTRADA";
              return (
                <li key={m.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <span aria-hidden className={`shrink-0 text-[13px] tabular-nums ${entrada ? "text-grafite" : "text-cinza-fumo"}`}>
                      {dataFmt.format(m.data)}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      {m.href ? (
                        <Link href={m.href} className="w-fit text-[15px] text-tinta transition-colors duration-150 hover:text-bordo">
                          {m.descricao}
                        </Link>
                      ) : (
                        <span className="text-[15px] text-tinta">{m.descricao}</span>
                      )}
                      {m.rotulo && <span className="text-[12px] text-cinza-fumo">{m.rotulo}</span>}
                    </div>
                  </div>
                  <span className={`shrink-0 font-display text-[15px] font-light tabular-nums ${entrada ? "text-tinta" : "text-cinza-fumo"}`}>
                    {entrada ? "+" : "−"} {brl(m.valor)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* — Horizonte em aberto (previsão, não caixa) — */}
      <section className="flex flex-col gap-3">
        <SecaoTitulo>Em aberto</SecaoTitulo>
        <div className="flex flex-wrap gap-3">
          <Link href={`/loja/${lojaId}/financeiro/receber`} className="flex flex-1 flex-col gap-1 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4 transition-colors duration-150 hover:border-cinza-fumo">
            <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">A receber</span>
            <span className="font-display text-[20px] font-light tabular-nums text-tinta">{brl(horizonte.aReceber)}</span>
            {Number(horizonte.aReceberAtraso) > 0 && <span className="text-[12px] text-bordo">{brl(horizonte.aReceberAtraso)} em atraso</span>}
          </Link>
          <Link href={`/loja/${lojaId}/financeiro/pagar`} className="flex flex-1 flex-col gap-1 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4 transition-colors duration-150 hover:border-cinza-fumo">
            <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">A pagar</span>
            <span className="font-display text-[20px] font-light tabular-nums text-tinta">{brl(horizonte.aPagar)}</span>
            {Number(horizonte.aPagarAtraso) > 0 && <span className="text-[12px] text-bordo">{brl(horizonte.aPagarAtraso)} em atraso</span>}
          </Link>
        </div>
        <p className="text-[12px] text-cinza-fumo">Previsão pelo vencimento — ainda não passou pelo caixa.</p>
      </section>
    </main>
  );
}
