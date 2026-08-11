import { useMemo } from "react";
import { Link } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useCaminhoDaLoja } from "@/hooks/use-caminho-da-loja";
import {
  useListAtendimentos,
  getListAtendimentosQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { CircleDot } from "lucide-react";
import { podeNoModulo } from "@/lib/permissoes";
import { hojeLocal } from "@/lib/financeiro/datas";
import { instanteHora } from "@/lib/formatos";
import { atendimentoEmCurso } from "@/lib/atendimento-em-curso";

/**
 * F13/E98 — a barra do atendimento em curso.
 *
 * Enquanto existir um atendimento `EM_ATENDIMENTO` da pessoa logada, TODA tela
 * do app diz de quem é e oferece os três caminhos que ela vai querer:
 * interesses, lookbook e voltar para a fila (onde se conclui).
 *
 * `pages/atendimentos/index.tsx` era o único lugar do sistema que conhecia esse
 * estado. A vendedora saía da fila para preencher interesses com a noiva do
 * lado, e a partir daí nada no app sabia que havia um atendimento acontecendo —
 * nem para lembrar de concluí-lo. Um atendimento iniciado e nunca concluído fica
 * `EM_ATENDIMENTO` para sempre, e a fila continua mostrando-o em "Hoje" dias
 * depois, porque o corte dela é por `inicio`.
 *
 * **Custo de rede zero, e isso não é acaso:** a janela pedida é exatamente a do
 * sino (`hoje..hoje`, o mesmo `useListAtendimentos`), então o cache do
 * react-query deduplica com ele e com o dashboard. Foi o que o achado previu ao
 * dizer "o dado já existe; o que não existe é um componente que o leia fora da
 * fila".
 */
export function BarraAtendimento() {
  const { activeLojaId, acessosModulos, user } = useAuth();
  const naLoja = useCaminhoDaLoja();

  const veAgenda = podeNoModulo(acessosModulos, "agenda", "ver");
  // Só HOJE. O atendimento esquecido de ontem não vira uma barra que acompanha
  // a pessoa para sempre: ele é estado sujo, e o lugar de limpá-lo é a fila.
  const janela = { de: hojeLocal(), ate: hojeLocal() };
  const atendimentos = useListAtendimentos(activeLojaId!, janela, {
    query: {
      queryKey: getListAtendimentosQueryKey(activeLojaId!, janela),
      enabled: !!activeLojaId && veAgenda,
      retry: false,
    },
  });

  const emCurso = useMemo(
    () => atendimentoEmCurso(atendimentos.data, user?.id),
    [atendimentos.data, user?.id],
  );

  if (!emCurso) return null;

  const nome = emCurso.lead?.noivaNome ?? "a noiva";
  const desde = emCurso.atendidoEm ?? emCurso.inicio;

  return (
    <div
      className="border-primary/30 bg-primary/10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2 text-sm"
      data-testid="barra-atendimento"
    >
      <CircleDot className="text-primary h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        Atendendo <span className="font-medium">{nome}</span>
        <span className="text-muted-foreground"> desde {instanteHora(desde)}</span>
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-1">
        {/* Os dois que ela preenche COM a noiva do lado. Não dependem de
            `agenda:editar` — quem registra interesse é o módulo de noivas. */}
        <Button asChild variant="ghost" size="sm">
          <Link to={naLoja(`/noivas/${emCurso.leadId}/interesses`)}>Interesses</Link>
        </Button>
        {/* S-O38: o lookbook é um CARD da ficha, não uma tela — este botão
            apontava `/noivas/:leadId/lookbook`, rota que nunca existiu, e caía
            em "Não encontramos esta página" com a noiva do lado. */}
        <Button asChild variant="ghost" size="sm">
          <Link to={naLoja(`/noivas/${emCurso.leadId}#lookbook`)}>Lookbook</Link>
        </Button>
        {/* "Concluir" leva à FILA e não conclui daqui, de propósito: concluir
            exige escolher o desfecho (RESERVOU / VAI_PENSAR / NAO_SERVIU), que é
            o dado que alimenta a conversão. Um botão que conclui sem desfecho
            trocaria o buraco do F13 por um buraco pior. */}
        <Button asChild variant="outline" size="sm" data-testid="barra-atendimento-concluir">
          <Link to={naLoja("/atendimentos")}>Concluir</Link>
        </Button>
      </span>
    </div>
  );
}
