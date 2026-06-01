// src/app/(app)/loja/[lojaId]/page.tsx
import { getSessaoComLoja } from "@/lib/auth";
import { carregarResumoLoja } from "@/lib/loja/resumo";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { SaudacaoDia } from "@/components/dashboard/saudacao-dia";
import { CardMetrica } from "@/components/dashboard/card-metrica";
import { PainelVazio } from "@/components/dashboard/painel-vazio";

export const dynamic = "force-dynamic";

export default async function DashboardLoja() {
  // Garantido pelo layout (sessão ok + espelhamento); narrow p/ tipagem.
  // Saudação, navegação e logout vivem na moldura (sidebar + topbar) do layout.
  const sc = await getSessaoComLoja();
  if (!sc) return null;

  // Único dado de tenant desta tela — segue passando pelo guard (resumo.ts).
  const resumo = await carregarResumoLoja(sc.loja.id);
  // Só liga o atalho da jornada se a pessoa puder ver noivas (não vira link morto).
  const podeVerNoivas = await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver");

  // Data REAL do servidor no fuso do salão. Única "novidade" de dado e é honesta:
  // nada de lead/agenda/prova fabricados. force-dynamic acima garante por-request.
  const agora = new Date();
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opts }).format(agora);
  const hora = Number(fmt({ hour: "numeric", hour12: false }));
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const dataFormatada = fmt({ weekday: "long", day: "numeric", month: "long" });

  const vestidosHref = `/loja/${sc.loja.id}/vestidos`;
  const primeiroNome = sc.usuario.nome.split(" ")[0];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <SaudacaoDia
        saudacao={saudacao}
        nome={primeiroNome}
        dataFormatada={dataFormatada}
        lojaNome={sc.loja.nome}
      />

      {/* Centro de operação: agenda (coração, vazio por ora) + acervo (único número real). */}
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
            descricao={resumo.vestidos === 1 ? "vestido no acervo" : "vestidos no acervo"}
            acao={{ href: vestidosHref, label: "Ver acervo" }}
          />
        ) : (
          <PainelVazio
            titulo="Acervo"
            mensagem="Nenhum vestido no acervo ainda."
            acao={{ href: vestidosHref, label: "Ver vestidos" }}
          />
        )}
      </div>

      {/* Atenções e jornada — ainda sem dado; estado vazio narrado, sem "0" frio. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PainelVazio
          titulo="Atenções imediatas"
          mensagem="Nenhuma atenção pendente por agora. Tudo no seu lugar."
        />
        <PainelVazio
          titulo="Jornada da noiva"
          mensagem="Quando uma noiva for recebida, a jornada dela aparece aqui — etapa por etapa, do primeiro encontro ao grande dia."
          acao={podeVerNoivas ? { href: `/loja/${sc.loja.id}/noivas`, label: "Ver noivas" } : undefined}
        />
      </div>
    </div>
  );
}
