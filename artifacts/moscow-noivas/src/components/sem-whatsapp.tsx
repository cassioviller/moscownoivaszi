import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

/**
 * F3 — "Sem WhatsApp" deixa de ser um beco.
 *
 * As quatro filas de mensagem do sistema (confirmar presença, cobrar, orçamento
 * vencendo e a cobrança do financeiro) mostravam um `<Badge>` cinza no lugar do
 * botão de WhatsApp. Ele diz o que falta e não leva a lugar nenhum: a pessoa que
 * está justamente varrendo a fila do dia tinha de sair para /noivas, procurar o
 * nome, abrir a ficha e clicar em editar — quatro passos para colar um telefone
 * que ela tem na mão naquele instante.
 *
 * O selo continua sendo um selo (não vira ação primária: quem está na fila quer
 * mandar mensagem, não cadastrar), mas agora é clicável e diz o que acontece.
 */
export function SemWhatsApp({ leadId }: { leadId?: string | null }) {
  // A loja vem da rota, como nas telas que usam este selo — `useCaminhoDaLoja`
  // mora em `pages/financeiro/helpers` e arrastá-lo para um componente
  // compartilhado é o que a sobra A9 (E99) existe para resolver.
  const { lojaId } = useParams();

  // Sem lead não há ficha para abrir — a fila de inadimplentes tem linhas que
  // vêm por contrato, e `leadId` pode faltar. Aí o selo volta a ser só um selo.
  if (!lojaId || !leadId) {
    return (
      <span className="bg-secondary text-secondary-foreground shrink-0 rounded-md px-2 py-0.5 text-xs">
        Sem WhatsApp
      </span>
    );
  }

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="text-muted-foreground shrink-0"
      data-testid={`sem-whatsapp-${leadId}`}
    >
      <Link to={`/loja/${lojaId}/noivas/${leadId}/editar`} title="Cadastrar o WhatsApp dela">
        <Pencil className="mr-1 h-3.5 w-3.5" />
        Sem WhatsApp
      </Link>
    </Button>
  );
}
