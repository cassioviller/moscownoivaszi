// src/app/(app)/loja/[lojaId]/financeiro/page.tsx
// Fluxo de caixa — a consolidação do financeiro: o que entrou e saiu do caixa do atelier no
// mês (realizado, pela data do movimento), uma faixa de tendência dos últimos meses, a linha
// do tempo dos movimentos e o horizonte do que ainda está em aberto. Leitura pura (nenhuma
// ação muda dado). Não é extrato bancário. Gate ver=financeiro:ver.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { resumoCaixa, movimentosDoMes, tendenciaCaixa, horizonteAberto } from "@/lib/financeiro/fluxo";
import { competenciaValida, hojeYMD } from "@/lib/financeiro/datas";
import { brl, dataFmt, Card } from "./ui";

export const dynamic = "force-dynamic";

const competenciaAtual = () => hojeYMD().slice(0, 7);
const rotuloMes = (c: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${c}-01T00:00:00Z`));
const rotuloMesCurto = (c: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${c}-01T00:00:00Z`));

function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-cinza-fumo">{children}</h2>;
}

export default async function FluxoDeCaixaPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ competencia?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "ver"))) redirect(`/loja/${sc.loja.id}`);

  const { lojaId } = await params;
  const sp = await searchParams;
  const competencia = competenciaValida(sp.competencia ?? "") ? sp.competencia! : competenciaAtual();

  const [resumo, movimentos, tendencia, horizonte] = await Promise.all([
    resumoCaixa(sc.loja.id, competencia),
    movimentosDoMes(sc.loja.id, competencia),
    tendenciaCaixa(sc.loja.id, { meses: 6, ate: competencia }),
    horizonteAberto(sc.loja.id),
  ]);
  const saldoNegativo = Number(resumo.saldo) < 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
          ← {sc.loja.nome}
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Fluxo de caixa</h1>
        <p className="text-[14px] text-cinza-fumo">O que entrou e saiu do caixa do atelier — pelo que foi registrado aqui, não é o extrato do banco.</p>
      </header>

      <form method="get" className="flex items-end gap-2">
        <input
          name="competencia"
          type="month"
          defaultValue={competencia}
          aria-label="Competência"
          className="w-44 rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta focus:border-tinta focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        />
        <button type="submit" className="inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">
          Ver
        </button>
      </form>

      {/* — Caixa do mês — */}
      <section className="flex flex-wrap gap-3">
        <Card rotulo="Entradas" valor={resumo.entradas} />
        <Card rotulo="Saídas" valor={resumo.saidas} />
        <Card rotulo="Saldo" valor={resumo.saldo} destaque={saldoNegativo} />
      </section>

      {/* — Tendência dos últimos meses (sem gráfico, DESIGN §13) — */}
      <section className="flex flex-col gap-3">
        <SecaoTitulo>Últimos meses</SecaoTitulo>
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-borda-suave text-left text-[11px] uppercase tracking-[0.14em] text-cinza-fumo">
              <th className="py-2 font-medium">Mês</th>
              <th className="py-2 text-right font-medium">Entradas</th>
              <th className="py-2 text-right font-medium">Saídas</th>
              <th className="py-2 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {tendencia.map((p) => {
              const atual = p.competencia === competencia;
              const neg = Number(p.saldo) < 0;
              return (
                <tr key={p.competencia} className={`border-b border-borda-suave ${atual ? "bg-bordo/5" : ""}`}>
                  <td className={`py-2 ${atual ? "text-bordo" : "text-tinta"}`}>{rotuloMesCurto(p.competencia)}</td>
                  <td className="py-2 text-right tabular-nums text-grafite">{brl(p.entradas)}</td>
                  <td className="py-2 text-right tabular-nums text-grafite">{brl(p.saidas)}</td>
                  <td className={`py-2 text-right tabular-nums ${neg ? "text-bordo" : "text-tinta"}`}>{brl(p.saldo)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* — Linha do tempo do mês — */}
      <section className="flex flex-col gap-3">
        <SecaoTitulo>Movimentos de {rotuloMes(competencia)}</SecaoTitulo>
        {movimentos.length === 0 ? (
          <p className="text-[14px] text-cinza-fumo">Nenhum movimento em {rotuloMes(competencia)}.</p>
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
