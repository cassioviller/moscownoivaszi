// src/app/(app)/loja/[lojaId]/page.tsx
import Link from "next/link";
import { getSessaoComLoja } from "@/lib/auth";
import { carregarPainel } from "@/lib/loja/painel";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { IndicadorDia } from "@/components/dashboard/indicador-dia";
import { PainelJornadaNoiva } from "@/components/dashboard/painel-jornada-noiva";
import { PainelCasamentos } from "@/components/dashboard/lista-casamentos";
import { PainelAtencoes } from "@/components/dashboard/painel-atencoes";
import { DestaqueAtelier } from "@/components/dashboard/destaque-atelier";
import { CardMetrica } from "@/components/dashboard/card-metrica";
import { PainelVazio } from "@/components/dashboard/painel-vazio";
import { detalheDoDia } from "@/lib/calendario/dia";
import { vencidasDaLoja } from "@/lib/financeiro/vencidas";
import { hojeYMD, hojeUTC } from "@/lib/tempo";
import { DiaDoAtelier } from "@/components/dashboard/dia-do-atelier";
import { AvisoVencidas } from "@/components/dashboard/aviso-vencidas";
import { iconeNav } from "@/components/layout/icones-nav";

export const dynamic = "force-dynamic";

export default async function DashboardLoja() {
  const sc = await getSessaoComLoja();
  if (!sc) return null;

  const podeFinanceiro = await podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "ver");
  const [painel, podeVerNoivas, diaHoje, vencidas] = await Promise.all([
    carregarPainel(sc.loja.id),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"),
    detalheDoDia(sc.loja.id, hojeYMD(), { financeiro: podeFinanceiro }),
    podeFinanceiro ? vencidasDaLoja(sc.loja.id, hojeUTC()) : Promise.resolve(null),
  ]);

  const vestidosHref = `/loja/${sc.loja.id}/vestidos`;
  const noivasHref = `/loja/${sc.loja.id}/noivas`;

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-10 px-6 py-10">
      {vencidas && <AvisoVencidas lojaId={sc.loja.id} vencidas={vencidas} />}

      {/* Indicadores do dia — números grandes, leitura em segundos (DESIGN §8.3).
          Strip voltado à operação da noiva; sem leads.ver, o foco vai pro acervo abaixo. */}
      {podeVerNoivas && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <IndicadorDia
            rotulo="Noivas"
            valor={painel.noivasAtivas}
            descricao="em acompanhamento"
            icone="noivas"
          />
          <IndicadorDia
            rotulo="Acervo"
            valor={painel.vestidos}
            descricao={painel.vestidos === 1 ? "vestido" : "vestidos"}
            icone="acervo"
          />
          <IndicadorDia
            rotulo="Casamentos"
            valor={painel.casamentosProximos}
            descricao="nos próximos 30 dias"
            icone="casamentos"
          />
          <IndicadorDia
            rotulo="Em provas"
            valor={painel.emProvas}
            descricao="ajustes em andamento"
            atencao
            icone="ajustes"
          />
          <Link
            href={`/loja/${sc.loja.id}/calendario`}
            className="col-span-2 flex flex-col items-center justify-center gap-2 rounded-[var(--mn-radius-lg)] border border-bordo bg-[rgba(122,24,54,0.03)] px-5 py-5 text-center text-bordo transition hover:-translate-y-[2px] hover:bg-[rgba(122,24,54,0.06)] hover:shadow-[var(--mn-shadow-hover)] lg:col-span-1"
          >
            {iconeNav("agenda")}
            <span className="max-w-[11ch] text-[13px] font-semibold">Ver agenda completa</span>
          </Link>
        </div>
      )}

      {/* Centro operacional — agenda de hoje, próximos casamentos e atenções lado a
          lado (mockup .ops). A agenda é sempre exibida; casamentos/atenções só
          aparecem quando há permissão e dado — gating preservado, sem inventar
          estado vazio para eles aqui (se não há o quê mostrar, a coluna some). */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr_1fr]">
        <DiaDoAtelier
          lojaId={sc.loja.id}
          dia={diaHoje}
          titulo="Hoje no atelier"
          hrefDiaCompleto={`/loja/${sc.loja.id}/calendario?aba=mes&ref=${diaHoje.ymd.slice(0, 7)}&dia=${diaHoje.ymd}`}
        />
        {podeVerNoivas && painel.proximosCasamentos.length > 0 && (
          <PainelCasamentos lojaId={sc.loja.id} casamentos={painel.proximosCasamentos} />
        )}
        {podeVerNoivas && painel.atencoes.length > 0 && (
          <PainelAtencoes lojaId={sc.loja.id} atencoes={painel.atencoes} />
        )}
      </section>

      {/* Jornada da noiva + destaque do atelier lado a lado (mockup .lower) — a
          noiva ativa com casamento mais próximo ganha a linha do tempo; o vestido
          em destaque (com foto) fecha a mesa do atelier (§8.6). */}
      <section className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        {podeVerNoivas ? (
          painel.destaqueJornada ? (
            <PainelJornadaNoiva
              passos={painel.destaqueJornada.passos}
              encerrada={painel.destaqueJornada.encerrada}
              noivaNome={painel.destaqueJornada.noivaNome}
              casamentoData={painel.destaqueJornada.casamentoData}
              diasRestantes={painel.destaqueJornada.diasRestantes}
            />
          ) : (
            <PainelVazio
              titulo="Jornada do atelier"
              mensagem="Quando uma noiva for recebida, a jornada dela aparece aqui — etapa por etapa, do primeiro encontro ao grande dia."
              acao={{ href: noivasHref, label: "Receber primeira noiva" }}
            />
          )
        ) : // Sem acesso a noivas: foco no acervo, sem expor dado de jornada.
        painel.vestidos > 0 ? (
          <CardMetrica
            rotulo="Acervo"
            valor={painel.vestidos}
            descricao={painel.vestidos === 1 ? "vestido no acervo" : "vestidos no acervo"}
            acao={{ href: vestidosHref, label: "Ver acervo" }}
          />
        ) : (
          <PainelVazio
            titulo="Acervo"
            mensagem="Nenhum vestido no acervo ainda."
            acao={{ href: vestidosHref, label: "Cadastrar vestido" }}
          />
        )}

        {/* Destaque do atelier — vestido do acervo com foto; só quando há (§8.6) */}
        {painel.destaque && <DestaqueAtelier lojaId={sc.loja.id} destaque={painel.destaque} />}
      </section>
    </div>
  );
}
