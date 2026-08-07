import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  getListAjustesQueryKey,
  getListAtendimentosQueryKey,
  useUpdateAjuste,
  useUpdateChecklistItem,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { mensagemApi } from "@/lib/erro-api";

/**
 * S-A17 — as ações do trabalho da costureira, num lugar só.
 *
 * Concluir/reabrir e marcar peça do checklist nasceram na fila (E14/F24);
 * quando a ficha do trabalho (`/ajustes/:ajusteId`) passou a oferecer as
 * mesmas, os handlers virariam a segunda grafia do mesmo cuidado — inclusive a
 * invalidação DUPLA, que é a parte que se esquece: ajustes também aninham
 * dentro dos atendimentos, então toda mudança invalida as duas listas.
 */
export function useAcoesDeAjuste() {
  const { activeLojaId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateAjuste = useUpdateAjuste();
  const updateChecklist = useUpdateChecklistItem();

  const invalidar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListAjustesQueryKey(activeLojaId!) }),
      queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) }),
    ]);

  /** F24: o mesmo botão nos dois sentidos — concluir e reabrir. */
  const mudarStatus = async (ajusteId: string, status: "FEITO" | "PENDENTE") => {
    try {
      await updateAjuste.mutateAsync({ lojaId: activeLojaId!, ajusteId, data: { status } });
      await invalidar();
      toast({ title: status === "FEITO" ? "Ajuste concluído" : "Ajuste reaberto" });
    } catch (err) {
      toast({
        title: status === "FEITO" ? "Não deu para concluir o ajuste" : "Não deu para reabrir o ajuste",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const marcarPeca = async (itemId: string, feito: boolean) => {
    try {
      await updateChecklist.mutateAsync({
        lojaId: activeLojaId!,
        itemId,
        data: { feito },
      });
      await invalidar();
    } catch (err) {
      toast({
        title: "Não deu para marcar a peça",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  return {
    mudarStatus,
    marcarPeca,
    mudandoStatus: updateAjuste.isPending,
    marcandoPeca: updateChecklist.isPending,
  };
}
