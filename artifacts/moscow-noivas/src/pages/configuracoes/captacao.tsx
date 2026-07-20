import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetCaptacaoToken,
  getGetCaptacaoTokenQueryKey,
  useRotacionarCaptacaoToken,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

/**
 * Captação externa (E19): o card que liga o formulário do site/Instagram à
 * loja. Mostra a URL do endpoint com o token vigente; rotacionar mata o
 * formulário antigo na hora — por isso a confirmação.
 */

const urlDoEndpoint = (token: string) =>
  `${window.location.origin}/api/captacao/leads?token=${token}`;

const EXEMPLO_CORPO = `{ "noivaNome": "...", "whatsapp": "...", "origem": "SITE" }`;

export function CaptacaoExterna() {
  const { activeLojaId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);

  const tokenQ = useGetCaptacaoToken(activeLojaId!, {
    query: {
      queryKey: getGetCaptacaoTokenQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });
  const rotacionar = useRotacionarCaptacaoToken();

  const token = tokenQ.data?.token ?? null;

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ title: "Copiado" });
    } catch {
      toast({ title: "Não deu para copiar automaticamente", description: texto });
    }
  }

  async function gerar() {
    try {
      await rotacionar.mutateAsync({ lojaId: activeLojaId! });
      await queryClient.invalidateQueries({ queryKey: getGetCaptacaoTokenQueryKey(activeLojaId!) });
      toast({
        title: token ? "Token rotacionado" : "Captação ligada",
        description: token ? "O formulário antigo parou de funcionar — atualize a URL." : undefined,
      });
    } catch (err) {
      toast({
        title: "Erro ao gerar o token",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>Captação externa</CardTitle>
        <CardDescription>
          Formulário do site ou do Instagram cria o lead direto aqui, como NOVO e com a origem
          marcada — ninguém mais digita à mão o que a noiva já preencheu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tokenQ.isError ? (
          <p className="text-sm text-muted-foreground">
            Falha ao buscar o token.{" "}
            <button className="underline" onClick={() => tokenQ.refetch()}>
              Tentar de novo
            </button>
          </p>
        ) : tokenQ.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : token ? (
          <>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Endpoint do formulário (POST, corpo JSON — ex.: <code>{EXEMPLO_CORPO}</code>)
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly value={urlDoEndpoint(token)} onFocus={(e) => e.target.select()} />
                <Button type="button" variant="outline" onClick={() => copiar(urlDoEndpoint(token))}>
                  Copiar
                </Button>
              </div>
            </div>
            <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={rotacionar.isPending}>
                  Rotacionar token
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Rotacionar o token da captação?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O token atual morre na hora: o formulário que usa a URL antiga para de criar
                    leads até ser atualizado com a nova.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={gerar}>Rotacionar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Captação desligada — gere o token para ligar o formulário externo.
            </p>
            <Button size="sm" onClick={gerar} disabled={rotacionar.isPending}>
              {rotacionar.isPending ? "Gerando…" : "Gerar token"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
