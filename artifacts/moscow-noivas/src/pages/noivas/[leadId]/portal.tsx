import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetPortalLead,
  getGetPortalLeadQueryKey,
  useCriarPortalLead,
  useRevogarPortalLead,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { podeNoModulo } from "@/lib/permissoes";
import { portalVivo, portalVencido, linkDoPortal } from "@/lib/portal";
import { DoorOpen, Copy, Ban } from "lucide-react";
import { useState } from "react";
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
import { instanteDiaMes } from "@/lib/formatos";
import { mensagemApi } from "@/lib/erro-api";

/**
 * Portal da noiva (E78) — o card na ficha: gerar/copiar/revogar o link único
 * que substitui gradualmente os links soltos de orçamento e lookbook. O
 * "último acesso há X" é o sinal de que ela abriu; regenerar mata o link
 * antigo na hora.
 */


/** "há 3 dias" / "há 2 horas" / "agora há pouco" — vocabulário de card. */
function haQuanto(instante: string): string {
  const ms = Date.now() - new Date(instante).getTime();
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${horas} hora${horas > 1 ? "s" : ""}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias > 1 ? "s" : ""}`;
}

export function PortalNoiva({ leadId, noivaNome }: { leadId: string; noivaNome?: string }) {
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [revogandoAberto, setRevogandoAberto] = useState(false);
  const podeEditar = podeNoModulo(acessosModulos, "leads", "editar");

  const portalQ = useGetPortalLead(activeLojaId!, leadId, {
    query: {
      queryKey: getGetPortalLeadQueryKey(activeLojaId!, leadId),
      enabled: !!activeLojaId,
      retry: false, // 404 = nunca gerado; não é falha transitória
    },
  });
  const gerar = useCriarPortalLead();
  const revogar = useRevogarPortalLead();

  const invalidar = () =>
    queryClient.invalidateQueries({
      queryKey: getGetPortalLeadQueryKey(activeLojaId!, leadId),
    });

  // 404 é estado ("nunca gerado"), não erro de rede. A régua do "vivo" é a
  // MESMA das mensagens (E84): lib/portal.
  const portal = portalQ.data ?? null;
  const nuncaGerado = portalQ.isError;
  const vivo = portalVivo(portal);
  // F38: a régua do "venceu" também virou uma só — a fila de mensagens precisa
  // do MESMO veredito para dizer que a mensagem vai sair sem o link.
  const expirado = portalVencido(portal);

  async function copiar(token: string) {
    try {
      await navigator.clipboard.writeText(linkDoPortal(token));
      toast({
        title: "Link copiado",
        description: "É só colar no WhatsApp da noiva.",
      });
    } catch {
      toast({
        title: "Não deu para copiar automaticamente",
        description: linkDoPortal(token),
      });
    }
  }

  async function onGerar() {
    try {
      const criado = await gerar.mutateAsync({ lojaId: activeLojaId!, leadId });
      await invalidar();
      await copiar(criado.token);
    } catch (err) {
      toast({
        title: "Não deu para gerar o link",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  async function onRevogar() {
    try {
      await revogar.mutateAsync({ lojaId: activeLojaId!, leadId });
      await invalidar();
      toast({
        title: "Portal revogado",
        description: "O link parou de funcionar.",
      });
    } catch (err) {
      toast({
        title: "Não deu para revogar",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DoorOpen className="h-4 w-4" />
          Portal da noiva
          {vivo && <Badge variant="secondary">Ativo</Badge>}
          {expirado && <Badge variant="outline">Expirado</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {portalQ.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Um link só para tudo dela: proposta, lookbook, próximas provas e —
              depois do contrato — as parcelas. Vale 30 dias.
            </p>

            {vivo && (
              <p className="text-sm">
                {portal!.ultimoAcessoEm ? (
                  <>Ela abriu {haQuanto(String(portal!.ultimoAcessoEm))}.</>
                ) : (
                  <>Ela ainda não abriu.</>
                )}{" "}
                <span className="text-muted-foreground">
                  Válido até {instanteDiaMes(portal!.expiraEm)}.
                </span>
              </p>
            )}

            {podeEditar && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={onGerar}
                  disabled={gerar.isPending}
                  data-testid="gerar-portal"
                >
                  {gerar.isPending
                    ? "Gerando…"
                    : nuncaGerado
                      ? "Gerar link"
                      : vivo
                        ? "Regenerar (mata o antigo)"
                        : "Gerar link novo"}
                </Button>
                {vivo && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copiar(portal!.token)}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copiar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRevogandoAberto(true)}
                      disabled={revogar.isPending}
                    >
                      <Ban className="mr-1.5 h-3.5 w-3.5" />
                      Revogar
                    </Button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* E10/E99 — revogar é irreversível para o link que a noiva TEM.
          Gerar outro é possível; recuperar o que ela guardou no favorito, não.
          O diálogo nomeia de quem é o portal, porque este card mora numa ficha
          e quem clica pode ter chegado por uma aba aberta há meia hora. */}
      <AlertDialog open={revogandoAberto} onOpenChange={setRevogandoAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar o portal?</AlertDialogTitle>
            <AlertDialogDescription>
              O link que <span className="font-medium">{noivaNome ?? "esta noiva"}</span>{" "}
              tem guardado para de funcionar na hora, e as mensagens de cobrança
              passam a sair sem ele. Você pode gerar um novo, mas terá de enviá-lo
              de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onRevogar}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
