import { Link } from "react-router";
import { useCaminhoDaLoja } from "@/hooks/use-caminho-da-loja";
import { Button } from "@/components/ui/button";
import { LinkIcon } from "lucide-react";

/**
 * F38/E100 — a mensagem que sai sem o link para de sair calada.
 *
 * O E84 fecha cobrança, confirmação e lembrete de orçamento com o link do
 * portal — quando ele está vivo. Quando venceu, `portalUrls.get()` devolve
 * `undefined`, a mensagem é montada sem a última linha e **ninguém fica
 * sabendo**: nem a noiva, que vai receber uma cobrança sem o extrato que a
 * explica, nem a vendedora, que acha que mandou o link.
 *
 * O selo é o do F3 (`<SemWhatsApp>`), pelo mesmo motivo: quem está varrendo a
 * fila do dia quer mandar mensagem, não administrar tokens — então ele avisa e
 * leva ao lugar onde se gera outro, sem virar ação primária e sem regenerar
 * daqui. Regenerar MATA o link antigo; é um gesto para quem está olhando a
 * ficha, não para quem está a um clique de distância do botão errado.
 */
export function PortalVencido({ leadId }: { leadId?: string | null }) {
  const naLoja = useCaminhoDaLoja();

  if (!leadId) return null;

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="text-muted-foreground shrink-0"
      data-testid={`portal-vencido-${leadId}`}
    >
      <Link
        to={naLoja(`/noivas/${leadId}`)}
        title="O link do portal dela venceu — esta mensagem vai sair sem ele"
      >
        <LinkIcon className="mr-1 h-3.5 w-3.5" />
        Portal vencido
      </Link>
    </Button>
  );
}
