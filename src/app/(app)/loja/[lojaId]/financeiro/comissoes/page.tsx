// src/app/(app)/loja/[lojaId]/financeiro/comissoes/page.tsx
// Comissões — o ranking ao vivo do atelier: quanto cada vendedora já fez no mês e o que
// isso vira de comissão, pela faixa vigente. O valor acumula em tempo real (preview, não
// grava); no dia 01 o gerente "Fecha o mês" anterior e cada vendedora vira uma conta a
// pagar. Fechamento idempotente. Gate ver=financeiro:ver, mutar=financeiro:editar.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { previewComissaoIntervalo, listarFechamentos } from "@/lib/financeiro/comissao";
import { competenciaAtual } from "@/lib/financeiro/datas";
import { resolverIntervalo } from "@/lib/financeiro/intervalo";
import { botaoSuave, botaoPrincipal, brl, dataFmt, rotuloCompetencia, SecaoTitulo, Card, FiltroIntervalo } from "../ui";
import { fecharCompetenciaAction } from "./actions";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = {
  regra: "Regra de comissão salva.",
  regra_removida: "Regra removida.",
  competencia_invalida: "Competência inválida.",
  competencia_corrente: "Só dá para fechar um mês já encerrado.",
};

export default async function ComissoesPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ ini?: string; fim?: string; ok?: string; erro?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const [podeVer, podeEditar] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "editar"),
  ]);
  if (!podeVer) redirect(`/loja/${sc.loja.id}`);

  const { lojaId } = await params;
  const sp = await searchParams;

  // Lente de visualização por intervalo (ex.: "as comissões da semana"). O ranking abaixo
  // reflete só este período. O FECHAMENTO, porém, segue mensal — derivamos a competência do
  // INÍCIO do intervalo (não se fecha meio mês). Faixas/degraus acumulam sobre o período
  // escolhido (aproximação intencional — ver previewComissaoIntervalo em comissao.ts).
  const intervalo = resolverIntervalo(sp.ini, sp.fim);
  const competencia = intervalo.iniYMD.slice(0, 7);
  const qsIntervalo = `?ini=${intervalo.iniYMD}&fim=${intervalo.fimYMD}`;

  const [ranking, fechamentos] = await Promise.all([
    previewComissaoIntervalo(sc.loja.id, { gte: intervalo.gte, lt: intervalo.lt }),
    listarFechamentos(sc.loja.id, { competencia }),
  ]);

  const totalAPagar = ranking.reduce((s, l) => s + Number(l.total), 0).toFixed(2);
  const temEstorno = ranking.some((l) => Number(l.estornoPendente) > 0);
  const jaFechada = fechamentos.length > 0;
  const ehCorrente = competencia >= competenciaAtual();
  const aviso =
    (sp.ok && (sp.ok.startsWith("fechado_") ? `Mês fechado: ${sp.ok.slice(8)} vendedora(s) com comissão.` : AVISOS[sp.ok])) ||
    (sp.erro && AVISOS[sp.erro]) ||
    null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
          ← {sc.loja.nome}
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Comissões</h1>
        <p className="text-[14px] text-cinza-fumo">Quanto cada vendedora fez no período — e o que isso vira de comissão.</p>
      </header>

      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FiltroIntervalo iniYMD={intervalo.iniYMD} fimYMD={intervalo.fimYMD} />
        <Link href={`/loja/${lojaId}/financeiro/comissoes/regras`} className={botaoSuave}>
          Faixas por vendedora
        </Link>
      </div>

      <p className="text-[12px] text-cinza-fumo">
        O ranking reflete o período selecionado — as faixas acumulam sobre ele, então é uma prévia. O fechamento é sempre mensal.
      </p>

      <section className="flex flex-wrap gap-3">
        <Card rotulo="Comissão no período" valor={totalAPagar} destaque />
        <div className="flex flex-1 flex-col gap-1 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4">
          <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Vendedoras</span>
          <span className="font-display text-[20px] font-light tabular-nums text-tinta">{ranking.length}</span>
        </div>
      </section>

      {/* Fechar mês — sempre mensal (competência derivada do início do intervalo); só mês já
          encerrado; deliberado em dois passos (Concierge calmo). */}
      {podeEditar && (
        jaFechada ? (
          <p className="text-[13px] text-grafite">
            {rotuloCompetencia(competencia)} já foi fechada — as comissões viraram contas a pagar.{" "}
            <Link href={`/loja/${lojaId}/financeiro/pagar?filtro=todas`} className="underline decoration-borda underline-offset-2 hover:text-bordo">
              ver em contas a pagar
            </Link>
            .
          </p>
        ) : ehCorrente ? (
          <p className="text-[13px] text-cinza-fumo">{rotuloCompetencia(competencia)} ainda está em curso — o mês fecha quando encerrar.</p>
        ) : (
          <details className="rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            <summary className="cursor-pointer list-none px-4 py-3 text-[14px] text-tinta marker:content-['']">
              Fechar competência {rotuloCompetencia(competencia)}
            </summary>
            <form action={fecharCompetenciaAction} className="flex flex-col gap-3 border-t border-borda-suave px-4 py-4">
              <input type="hidden" name="competencia" value={competencia} />
              <input type="hidden" name="voltar" value={`/loja/${lojaId}/financeiro/comissoes${qsIntervalo}`} />
              <p className="text-[13px] text-grafite">
                Fecha o mês inteiro de {rotuloCompetencia(competencia)} (não o período acima): gera uma conta a pagar de comissão por
                vendedora, com a faixa do mês completo. A ação é definitiva — o mês fechado não é reescrito.
              </p>
              <button type="submit" className={botaoPrincipal}>Confirmar fechamento</button>
            </form>
          </details>
        )
      )}

      <section className="flex flex-col gap-3">
        <SecaoTitulo>Ranking do período</SecaoTitulo>
        {ranking.length === 0 ? (
        <p className="text-[15px] text-tinta">Nenhuma venda fechada de {dataFmt.format(intervalo.gte)} a {dataFmt.format(new Date(intervalo.lt.getTime() - 1))}.</p>
      ) : (
        // Ranking como lista curada (não planilha): posição · vendedora em destaque ·
        // linha discreta (vendas/%/bônus) · comissão como número-herói à direita.
        <ol className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
          {ranking.map((l, i) => (
            <li key={l.vendedoraId} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 items-baseline gap-3">
                <span className="w-4 shrink-0 text-center font-display text-[13px] tabular-nums text-champagne">{i + 1}</span>
                <div className="flex min-w-0 flex-col">
                  <span className="text-[15px] text-tinta">{l.nome}</span>
                  <span className="text-[12px] text-cinza-fumo">
                    {brl(l.totalVendas)} em vendas
                    {l.percentual !== null && ` · ${Number(l.percentual)}%`}
                    {Number(l.bonus) > 0 && ` · bônus ${brl(l.bonus)}`}
                  </span>
                  {Number(l.estornoPendente) > 0 && (
                    <span className="text-[11px] text-cinza-fumo">estorno pendente: {brl(l.estornoPendente)}</span>
                  )}
                </div>
              </div>
              <span className="shrink-0 font-display text-[18px] font-light tabular-nums text-tinta">{brl(l.total)}</span>
            </li>
          ))}
        </ol>
        )}
      </section>

      {temEstorno && (
        <p className="text-[12px] text-cinza-fumo">
          Estorno pendente: contratos cancelados de meses já fechados, descontados aqui antes de calcular a comissão.
        </p>
      )}

      {jaFechada && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-cinza-fumo">Fechamento de {rotuloCompetencia(competencia)}</h2>
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {fechamentos.map((f) => (
              <li key={f.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[14px] text-tinta">{f.vendedoraNome}</span>
                  <span className="text-[12px] text-cinza-fumo">
                    {brl(f.totalVendas)} em vendas{f.percentualAplicado === null ? "" : ` · ${Number(f.percentualAplicado)}%`} · fechado em {dataFmt.format(f.fechadoEm)}
                  </span>
                </div>
                <span className="shrink-0 font-display text-[15px] font-light tabular-nums text-tinta">{brl(f.valorTotal)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
