import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useExpurgarLeadsPerdidos,
  usePreviaExpurgoLeadsPerdidos,
  getPreviaExpurgoLeadsPerdidosQueryKey,
  getListLeadsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck } from "lucide-react";
import { mensagemApi } from "@/lib/erro-api";

/**
 * E77 (LGPD) — dado pessoal sem propósito é passivo. Anonimiza as noivas
 * PERDIDAS há mais de 24 meses: a linha fica (funil e conversão continuam
 * contando), nome/contato/local somem. Irreversível por desenho — daí a
 * confirmação explícita — e a ação deixa rastro na auditoria.
 */
export function PrivacidadeLgpd() {
  const { activeLojaId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const expurgar = useExpurgarLeadsPerdidos();
  // E128/C7: a contagem só chegava no toast, DEPOIS do clique irreversível —
  // a dona confirmava às cegas se eram 3 ou 300. A prévia (read-only, o MESMO
  // recorte do expurgo no servidor) responde ANTES; só é pedida com o diálogo
  // aberto, e o refetch a cada abertura evita confirmar uma contagem velha.
  const previa = usePreviaExpurgoLeadsPerdidos(activeLojaId!, undefined, {
    query: {
      queryKey: getPreviaExpurgoLeadsPerdidosQueryKey(activeLojaId!, undefined),
      enabled: !!activeLojaId && confirmando,
      refetchOnMount: "always",
      staleTime: 0,
    },
  });
  const contagem = previa.data?.aAnonimizar;

  const rodar = async () => {
    try {
      const r = await expurgar.mutateAsync({ lojaId: activeLojaId!, data: {} });
      await queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey(activeLojaId!) });
      toast({
        title:
          r.anonimizadas === 0
            ? "Nada a anonimizar"
            : `${r.anonimizadas} noiva${r.anonimizadas === 1 ? "" : "s"} anonimizada${r.anonimizadas === 1 ? "" : "s"}`,
        description:
          r.anonimizadas === 0
            ? "Nenhuma noiva perdida há mais de 24 meses."
            : "Os números do funil e da conversão não mudam.",
      });
    } catch (err) {
      toast({
        title: "Não deu para anonimizar",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Privacidade (LGPD)
        </CardTitle>
        <CardDescription>
          Noivas perdidas há mais de 24 meses não precisam continuar com nome e contato no
          sistema. A anonimização remove os dados pessoais e preserva os números.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          onClick={() => setConfirmando(true)}
          disabled={expurgar.isPending}
          data-testid="anonimizar-perdidas"
        >
          {expurgar.isPending ? "Anonimizando…" : "Anonimizar noivas perdidas antigas"}
        </Button>

        <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Anonimizar noivas perdidas?</AlertDialogTitle>
              <AlertDialogDescription data-testid="texto-previa-lgpd">
                {/* E121: enquanto a prévia conta, o diálogo não afirma número
                    nenhum; se ela falhar, a frase antiga (sem contagem) fica —
                    a prévia enriquece, não bloqueia. */}
                {previa.isLoading
                  ? "Contando quantas noivas entram no corte…"
                  : contagem === 0
                    ? "Nenhuma noiva perdida há mais de 24 meses — nada a anonimizar hoje."
                    : contagem !== undefined
                      ? `Isto vai anonimizar ${contagem} noiva${contagem === 1 ? "" : "s"}: nome, contato e local do casamento saem DE FORMA IRREVERSÍVEL. O funil e os relatórios continuam contando essas linhas.`
                      : "Nome, contato e local do casamento das noivas perdidas há mais de 24 meses serão removidos DE FORMA IRREVERSÍVEL. O funil e os relatórios continuam contando essas linhas."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={rodar} disabled={previa.isLoading || contagem === 0}>
                Anonimizar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
