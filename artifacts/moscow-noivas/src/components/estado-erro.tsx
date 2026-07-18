import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Estado de erro de carregamento — o mesmo desenho que já estava inline em
 * leads/vestidos/orçamentos, extraído para que as telas que ainda ficavam em
 * branco na falha (admin, equipe, configurações) tenham saída e possam
 * "Tentar novamente" sem recarregar a página inteira.
 */
export function EstadoErro({
  titulo,
  erro,
  onTentarNovamente,
}: {
  titulo: string;
  erro?: unknown;
  onTentarNovamente?: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{titulo}</AlertTitle>
      <AlertDescription className="flex items-center gap-3">
        <span>{erro instanceof Error ? erro.message : "Falha inesperada."}</span>
        {onTentarNovamente && (
          <Button variant="outline" size="sm" onClick={onTentarNovamente}>
            Tentar novamente
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
