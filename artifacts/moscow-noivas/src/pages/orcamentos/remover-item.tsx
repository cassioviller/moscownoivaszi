import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { recusaAoRemoverItem, type OrcamentoComDesconto } from "@/lib/financeiro/desconto-e-itens";

/**
 * S-O49 (E181) — a confirmação de remover item, com a recusa do servidor dita
 * ANTES do clique.
 *
 * Saiu de dentro de `[id].tsx` (1.814 linhas) pelo mesmo motivo que a
 * `FilaFaltaProcurar` saiu de `agenda/index.tsx` no E168: o que decide se o
 * gesto é oferecido precisa ser montável num teste, e nenhuma régua de tela
 * cabe numa página inteira.
 */
export function DialogoRemoverItem({
  item,
  orcamento,
  onConfirmar,
  onFechar,
}: {
  item: { id: string; descricao: string } | null;
  orcamento: OrcamentoComDesconto;
  onConfirmar: (itemId: string) => void;
  onFechar: () => void;
}) {
  // A pergunta é feita com o item AINDA na lista: é a simulação do que o
  // servidor vai responder ao `DELETE`, não o estado de agora.
  const recusa = item ? recusaAoRemoverItem(orcamento, item.id) : null;

  return (
    <AlertDialog open={!!item} onOpenChange={(aberto) => !aberto && onFechar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover este item?</AlertDialogTitle>
          <AlertDialogDescription>
            {recusa ? (
              <span data-testid="recusa-remover-item">
                {recusa.detalhe} Baixe o desconto primeiro — o preço da noiva é decisão
                sua, e o sistema não vai mexer nele sozinho.
              </span>
            ) : (
              <>
                {item?.descricao} sai do orçamento e o total é recalculado. Não dá para
                desfazer — se foi engano, o item precisa ser lançado de novo.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{recusa ? "Entendi" : "Cancelar"}</AlertDialogCancel>
          <AlertDialogAction
            data-testid="confirmar-remover-item"
            disabled={!!recusa}
            onClick={() => {
              if (item) onConfirmar(item.id);
              onFechar();
            }}
          >
            Remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
