// src/app/(app)/loja/[lojaId]/page.tsx
import { getSessaoComLoja } from "@/lib/auth";
import { carregarResumoLoja } from "@/lib/loja/resumo";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { SaudacaoDia } from "@/components/dashboard/saudacao-dia";
import { CardMetrica } from "@/components/dashboard/card-metrica";
import { PainelVazio } from "@/components/dashboard/painel-vazio";

export const dynamic = "force-dynamic";

export default async function DashboardLoja() {
  const sc = await getSessaoComLoja();
  if (!sc) return null;

  const resumo = await carregarResumoLoja(sc.loja.id);
  const podeVerNoivas = await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver");

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

      {/* Centro de operação: agenda (coração, vazio por ora) + acervo */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PainelVazio
            titulo="Agenda de hoje"
            mensagem="A agenda do atelier aparece aqui quando os atendimentos do dia começarem a ser marcados."
          />
        </div>
        {resumo.vestidos > 0 ? (
          <CardMetrica
            rotulo="Acervo"
            valor={resumo.vestidos}
            descricao={resumo.vestidos === 1 ? "vestido" : "vestidos"}
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

      {/* Atenções e jornada */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PainelVazio
          titulo="Atenções imediatas"
          mensagem="Nenhuma atenção pendente por agora. Tudo no seu lugar."
        />
        {podeVerNoivas && resumo.noivas > 0 ? (
          <CardMetrica
            rotulo="Jornada da noiva"
            valor={resumo.noivas}
            descricao={resumo.noivas === 1 ? "noiva em acompanhamento" : "noivas em acompanhamento"}
            acao={{ href: noivasHref, label: "Ver noivas" }}
          />
        ) : (
          <PainelVazio
            titulo="Jornada da noiva"
            mensagem="Quando uma noiva for recebida, a jornada dela aparece aqui — etapa por etapa, do primeiro encontro ao grande dia."
            acao={podeVerNoivas ? { href: noivasHref, label: "Receber primeira noiva" } : undefined}
          />
        )}
      </div>
    </div>
  );
}
