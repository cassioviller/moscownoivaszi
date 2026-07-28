import type { QueryClient } from "@tanstack/react-query";
import { chavesDoCaixa } from "@/lib/financeiro/cache";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Erro } from "@/components/estado";
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
 * Um movimento de caixa invalida TUDO o que ele muda (D9/E93) — a lista das
 * chaves e o porquê moram em `lib/financeiro/cache.ts`, com teste. Chamada por
 * receber, estornar, pagar, estornar-pagamento, lançar e remover conta.
 */
export function invalidarCaixa(queryClient: QueryClient, lojaId: string): Promise<void> {
  return Promise.all(
    chavesDoCaixa(lojaId).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  ).then(() => undefined);
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
        {/* E6: o degrau maior da escala. Era `text-2xl font-serif tabular-nums`
            escrito à mão aqui e com outras quatro combinações nas telas vizinhas. */}
        <p className={`money-lg ${destaque && valor > 0 ? "text-destructive" : ""}`}>
          {brl(valor)}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * E99: o desenho saiu daqui e virou `<Erro>` em `@/components/estado`. Esta
 * função continua como porta fina para as seis telas do financeiro que já a
 * chamam com a mensagem PRONTA — reescrever os seis call-sites para passar o
 * erro cru seria mexer em código correto para trocar de nome, e o cuidado (a)
 * do épico é explícito: poda e adoção onde a divergência já custou, nada mais.
 *
 * O que importa é que agora existe UM desenho, não três.
 */
export function ErroListagem({ mensagem, onRetry }: { mensagem: string; onRetry: () => void }) {
  // A mensagem já veio traduzida pela tela; `detalhe` faz o `<Erro>` respeitá-la.
  return <Erro titulo="Erro ao carregar" erro={{ data: { detalhe: mensagem } }} onTentarNovamente={onRetry} />;
}

/**
 * E92/E4: a régua de erro subiu para `@/lib/erro-api`. Ela deixou de ser
 * "coisa do financeiro" quando as telas de noiva, vestido e reserva passaram a
 * precisar dela — e lá tem teste próprio, então a perna que devolvia
 * `err.message` (e com ela o "HTTP 404 Not Found" no toast) não volta sem a
 * suíte reclamar.
 */
