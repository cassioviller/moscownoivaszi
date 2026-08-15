import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateAjuste,
  getListAjustesQueryKey,
  getListAtendimentosQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { mensagemApi } from "@/lib/erro-api";

/**
 * S-O140 — **o prazo próprio tem porta (`PATCH /ajustes/:id`, E240) e não
 * tinha tela de EDIÇÃO.** A única tela que o escrevia era o diálogo de Nova
 * confecção; a ficha o MOSTRAVA como fato e não o editava — o formato do E222
 * (1 porta, 0 telas), medido em 3 sítios de `prazoProprio` em `pages/`, todos
 * de leitura ou criação.
 *
 * O mesmo campo do diálogo da criação, agora sobre o trabalho que já existe:
 * uma data para fixar, e "Limpar" para voltar à régua derivada (prova →
 * casamento). O `PATCH` já aceita `null` para limpar desde o E240.
 */
export function AlterarPrazoProprio({
  ajusteId,
  prazoAtual,
}: {
  ajusteId: string;
  prazoAtual: string | null | undefined;
}) {
  const { activeLojaId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const atualizar = useUpdateAjuste();
  const [aberto, setAberto] = useState(false);
  const [prazo, setPrazo] = useState(prazoAtual ?? "");

  const invalidar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListAjustesQueryKey(activeLojaId!) }),
      queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) }),
    ]);

  const gravar = async (valor: string | null) => {
    try {
      await atualizar.mutateAsync({
        lojaId: activeLojaId!,
        ajusteId,
        data: { prazoProprio: valor },
      });
      await invalidar();
      toast({
        title: valor ? "Prazo próprio alterado" : "Prazo próprio limpo",
        description: valor
          ? undefined
          : "Volta a valer a prova marcada e, sem prova, o casamento da noiva.",
      });
      setAberto(false);
    } catch (err) {
      toast({
        title: "Não deu para alterar o prazo",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) setPrazo(prazoAtual ?? "");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="link" size="sm" className="h-auto p-0" data-testid="alterar-prazo-proprio">
          {prazoAtual ? "Alterar" : "Definir prazo próprio"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prazo próprio desta peça</DialogTitle>
          <DialogDescription>
            O dia em que esta peça precisa estar pronta. Em branco, vale o casamento da noiva —
            e a prova marcada manda sobre os dois.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="prazo-proprio-input">Prazo próprio</Label>
          <Input
            id="prazo-proprio-input"
            type="date"
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
            data-testid="prazo-proprio-input"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          {prazoAtual && (
            <Button
              variant="outline"
              onClick={() => gravar(null)}
              disabled={atualizar.isPending}
              data-testid="limpar-prazo-proprio"
            >
              Limpar
            </Button>
          )}
          <Button
            onClick={() => gravar(prazo)}
            disabled={!prazo || atualizar.isPending}
            data-testid="salvar-prazo-proprio"
          >
            {atualizar.isPending ? "Gravando…" : "Gravar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
