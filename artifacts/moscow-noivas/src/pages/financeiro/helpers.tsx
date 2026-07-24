import { useParams } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { brl } from "@/lib/formatos";

/**
 * O que as telas do financeiro compartilham entre si. A lógica de dinheiro e
 * data mora em `@/lib/financeiro`; aqui fica só o que é de borda: falar do
 * erro e mostrar um número.
 */

/**
 * Datas de NEGÓCIO (vencimento) — o dia já é o dia, e lê-lo em UTC não o
 * escorrega. Instantes (recebidoEm, pagamento.data) NÃO passam por aqui: eles
 * só têm dia dentro de um fuso, e o de São Paulo é o da loja (ver datas.ts).
 */
export const dataFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Caminho dentro da loja atual. As rotas reais vivem sob `/loja/:lojaId/…`; um
 * link absoluto tipo `/contratos/x` só chega lá pelo catch-all LegacyRedirect,
 * que é compatibilidade transitória para deep-links antigos — e uma ida e volta
 * de navegação a cada clique. Mesma montagem da sidebar.
 */
export function useCaminhoDaLoja(): (caminho: string) => string {
  const { lojaId } = useParams();
  return (caminho) => `/loja/${lojaId}${caminho}`;
}

export function ResumoCard({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <Card className="min-w-[9rem] flex-1">
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        {/* Destaque só fica vermelho quando HÁ o quê alarmar (valor > 0). "Em
            atraso: R$ 0,00" é a boa notícia — vermelho ali seria alarme falso. */}
        <p className={`text-2xl font-serif tabular-nums ${destaque && valor > 0 ? "text-destructive" : ""}`}>
          R$ {brl(valor)}
        </p>
      </CardContent>
    </Card>
  );
}

export function ErroListagem({ mensagem, onRetry }: { mensagem: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Erro ao carregar</AlertTitle>
      <AlertDescription className="flex items-center gap-3">
        <span>{mensagem}</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Traduz o erro da API. O mapa de códigos é por tela — cada uma conhece as
 * falhas do seu endpoint — mas a ordem de fallback é a mesma em todas:
 * código conhecido → detalhe do servidor → mensagem crua → texto da tela.
 */
export function mensagemApi(
  err: unknown,
  fallback: string,
  mensagens: Record<string, string> = {},
): string {
  const e = err as { data?: { error?: string; detalhe?: string } } | undefined;
  const codigo = e?.data?.error;
  if (codigo && mensagens[codigo]) return mensagens[codigo];
  if (e?.data?.detalhe) return e.data.detalhe;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
