import { useParams } from "react-router";
import { CalendarX } from "lucide-react";
import { getGetDisponibilidadeQueryKey, useGetDisponibilidade } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  provaForaDaJanela,
  PROVA_FORA_DA_JANELA_EXPLICACAO,
  PROVA_FORA_DA_JANELA_SELO,
  type AtendimentoParaJanela,
} from "@/lib/prova-fora-da-janela";

/**
 * S-O97 — o selo da prova que ficou para trás quando a reserva mudou de data.
 *
 * Ele vive ao lado do selo da prova órfã, nas MESMAS quatro telas — grade,
 * semana, fila de provas e ficha da noiva —, porque as duas perguntas são a
 * mesma da noiva: *"o vestido vai estar aqui no meu horário?"*.
 *
 * **A régua da loja é buscada AQUI, não em cada tela.** São quatro sítios e uma
 * lista de vinte provas em cada um; o `useGetDisponibilidade` é a mesma
 * `queryKey` para todos, então o react-query devolve o cache e a rede vê uma
 * requisição. Plantar o hook em quatro páginas seria quatro chances de esquecer
 * a quinta.
 */
export function SeloProvaForaDaJanela({
  atendimento,
  compacto = false,
}: {
  atendimento: AtendimentoParaJanela | null | undefined;
  compacto?: boolean;
}) {
  const { lojaId } = useParams();
  // Sem `lojaId!`: o hook não pode ficar atrás de um `if` (regra dos hooks), e a
  // asserção seria a dívida da S-O66/S-O84 crescendo por conveniência. O `?? ""`
  // é inerte porque `enabled` desliga a consulta, e o selo já não aparece sem a
  // régua carregada.
  const daRota = lojaId ?? "";
  const regra = useGetDisponibilidade(daRota, {
    query: { queryKey: getGetDisponibilidadeQueryKey(daRota), enabled: !!lojaId },
  });

  const caso = provaForaDaJanela(atendimento, regra.data);
  if (!caso) return null;

  const selo = (
    <Badge
      variant="outline"
      className={
        compacto
          ? "gap-0.5 border-amber-500/60 px-1 py-0 text-[10px] font-normal text-amber-700 dark:text-amber-400"
          : "gap-1 border-amber-500/60 text-amber-700 dark:text-amber-400"
      }
      data-testid="selo-prova-fora-da-janela"
    >
      <CalendarX className={compacto ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} aria-hidden />
      {PROVA_FORA_DA_JANELA_SELO[caso]}
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{selo}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{PROVA_FORA_DA_JANELA_EXPLICACAO[caso]}</TooltipContent>
    </Tooltip>
  );
}
