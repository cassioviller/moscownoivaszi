import { Link, useParams } from "react-router";
import { useCaminhoDaLoja } from "@/hooks/use-caminho-da-loja";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { whatsappUtilizavel, WHATSAPP_NAO_ABRE_SELO } from "@/lib/whatsapp";

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
export function SemWhatsApp({
  leadId,
  whatsapp,
}: {
  leadId?: string | null;
  /**
   * S-O44 — o número que EXISTE e não abre é outra história.
   *
   * O selo dizia "Sem WhatsApp" nos dois casos, e a diferença importa para quem
   * está na fila: se a noiva nunca deu o número, a loja pede; se ela deu um
   * número torto — e ele entra pela captação pública, que aceita de propósito
   * para não perder o lead — a loja **corrige**. Dizer "sem WhatsApp" sobre um
   * campo preenchido faz a vendedora abrir a ficha, ver o número lá e não
   * entender nada.
   *
   * Opcional: quem não passa mantém a frase antiga, que continua certa para a
   * linha vinda por contrato (sem `leadId` e sem ficha).
   */
  whatsapp?: string | null;
}) {
  // A régua vem do `funil-core` — a mesma que o servidor usa na porta da loja.
  const numeroTorto = !!whatsapp?.trim() && !whatsappUtilizavel(whatsapp);
  const rotulo = numeroTorto ? WHATSAPP_NAO_ABRE_SELO : "Sem WhatsApp";
  const titulo = numeroTorto ? "Corrigir o número dela" : "Cadastrar o WhatsApp dela";
  // A9/E99: o hook saiu de `pages/financeiro/helpers` para `@/hooks` justamente
  // por causa deste componente — antes ele reimplementava a montagem do caminho
  // com `useParams`, porque um componente compartilhado não deve importar uma
  // página.
  const naLoja = useCaminhoDaLoja();
  const { lojaId } = useParams();

  // Sem lead não há ficha para abrir — a fila de inadimplentes tem linhas que
  // vêm por contrato, e `leadId` pode faltar. Aí o selo volta a ser só um selo.
  if (!lojaId || !leadId) {
    return (
      <span className="bg-secondary text-secondary-foreground shrink-0 rounded-md px-2 py-0.5 text-xs">
        {rotulo}
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
      <Link to={naLoja(`/noivas/${leadId}/editar`)} title={titulo}>
        <Pencil className="mr-1 h-3.5 w-3.5" />
        {rotulo}
      </Link>
    </Button>
  );
}
