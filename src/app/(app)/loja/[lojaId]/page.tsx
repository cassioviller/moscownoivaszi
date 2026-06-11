// src/app/(app)/loja/[lojaId]/page.tsx
import { getSessaoComLoja } from "@/lib/auth";
import { carregarPainel } from "@/lib/loja/painel";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { SaudacaoDia } from "@/components/dashboard/saudacao-dia";
import { IndicadorDia } from "@/components/dashboard/indicador-dia";
import { PainelJornada } from "@/components/dashboard/painel-jornada";
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

  const agora = new Date();
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opts }).format(agora);
  const hora = Number(fmt({ hour: "numeric", hour12: false }));
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const dataFormatada = fmt({ weekday: "long", day: "numeric", month: "long" });

  const vestidosHref = `/loja/${sc.loja.id}/vestidos`;
  const noivasHref = `/loja/${sc.loja.id}/noivas`;
  const primeiroNome = sc.usuario.nome.split(" ")[0];

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-10 px-6 py-10">
      <SaudacaoDia
        saudacao={saudacao}
        nome={primeiroNome}
        dataFormatada={dataFormatada}
        lojaNome={sc.loja.nome}
      />

      {/* Divisória atmosférica — champagne como linha institucional, não decoração */}
      <div aria-hidden className="h-px bg-champagne/40" />

      {/* Hoje no atelier — o coração do dia (agenda + financeiro, este só com permissão) */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-[18px] font-light text-tinta">Hoje no atelier</h2>
        <DiaDoAtelier lojaId={sc.loja.id} dia={diaHoje} />
      </section>

      {vencidas && <AvisoVencidas lojaId={sc.loja.id} vencidas={vencidas} />}

      {/* Indicadores do dia — números grandes, leitura em segundos (DESIGN §8.3).
          Strip voltado à operação da noiva; sem leads.ver, o foco vai pro acervo abaixo. */}
      {podeVerNoivas && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <IndicadorDia rotulo="Noivas" valor={painel.noivasAtivas} descricao="em acompanhamento" />
          <IndicadorDia
            rotulo="Acervo"
            valor={painel.vestidos}
            descricao={painel.vestidos === 1 ? "vestido" : "vestidos"}
          />
          <IndicadorDia
            rotulo="Casamentos"
            valor={painel.casamentosProximos}
            descricao="nos próximos 30 dias"
          />
          <IndicadorDia
            rotulo="Em provas"
            valor={painel.emProvas}
            descricao="ajustes em andamento"
            atencao
          />
        </div>
      )}

      {/* Atenções imediatas — só aparece quando há cuidado pendente; a ausência é a calma */}
      {podeVerNoivas && painel.atencoes.length > 0 && (
        <PainelAtencoes atencoes={painel.atencoes} />
      )}

      {/* Centro de operação: jornada (coração) + casamentos próximos */}
      {podeVerNoivas ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {painel.jornada.length > 0 ? (
            <PainelJornada etapas={painel.jornada} href={noivasHref} />
          ) : (
            <PainelVazio
              titulo="Jornada do atelier"
              mensagem="Quando uma noiva for recebida, a jornada dela aparece aqui — etapa por etapa, do primeiro encontro ao grande dia."
              acao={{ href: noivasHref, label: "Receber primeira noiva" }}
            />
          )}

          {painel.proximosCasamentos.length > 0 ? (
            <PainelCasamentos casamentos={painel.proximosCasamentos} />
          ) : (
            <PainelVazio
              titulo="Casamentos próximos"
              mensagem="Nenhum casamento marcado nos próximos dias. As datas confirmadas aparecem aqui, da mais próxima à mais distante."
            />
          )}
        </div>
      ) : (
        // Sem acesso a noivas: foco no acervo, sem expor dado de jornada.
        <div className="grid grid-cols-1 gap-5">
          {painel.vestidos > 0 ? (
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
        </div>
      )}

      {/* Destaque do atelier — vestido do acervo com foto; só quando há (§8.6) */}
      {painel.destaque && <DestaqueAtelier lojaId={sc.loja.id} destaque={painel.destaque} />}
    </div>
  );
}
