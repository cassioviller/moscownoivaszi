import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  provaPerdeuOVestido,
  PROVA_ORFA_EXPLICACAO,
  PROVA_ORFA_SELO,
  type AtendimentoParaOrfandade,
} from "@/lib/prova-orfa";

/**
 * S-O5/R8 — o selo da prova que perdeu o vestido, num componente só.
 *
 * Ele aparece na grade do dia, na semana, na fila de provas e na ficha da
 * noiva. A frase e a regra moram em `lib/prova-orfa.ts`; aqui mora só o
 * desenho — quatro cópias de uma frase em quatro telas é a S-M9 na letra, e
 * quatro cópias da REGRA seria a S-M9 com juros.
 *
 * Renderiza `null` quando não há o que dizer, para o chamador poder plantá-lo
 * sem `&&` em cada sítio.
 */
export function SeloProvaOrfa({
  atendimento,
  compacto = false,
}: {
  atendimento: AtendimentoParaOrfandade | null | undefined;
  compacto?: boolean;
}) {
  if (!provaPerdeuOVestido(atendimento)) return null;

  const selo = (
    <Badge
      variant="destructive"
      className={compacto ? "gap-0.5 px-1 py-0 text-[10px] font-normal" : "gap-1"}
      data-testid="selo-prova-orfa"
    >
      <AlertTriangle className={compacto ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} aria-hidden />
      {PROVA_ORFA_SELO}
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{selo}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{PROVA_ORFA_EXPLICACAO}</TooltipContent>
    </Tooltip>
  );
}
