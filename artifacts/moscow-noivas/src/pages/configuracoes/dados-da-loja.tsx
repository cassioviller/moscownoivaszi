import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getGetMeQueryKey, useUpdateDadosDaLoja } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { mensagemApi } from "@/lib/erro-api";
import { useConfirmarSaida, sujoParaConfirmar } from "@/hooks/use-confirmar-saida";
import { linkWhatsApp } from "@/lib/whatsapp";

/**
 * S17 — os dados da loja, editáveis por quem administra a loja.
 *
 * `endereco` e `telefone` só tinham formulário no console de SUPERADMIN, que é
 * rota top-level fora de `/loja/:lojaId`: trocar o telefone virava chamado para
 * quem tem o console. E os dois aparecem para a NOIVA — no rodapé do portal e
 * na linha "Endereço:" da mensagem de confirmação.
 *
 * **O aviso do telefone é o ponto da tela.** `linkWhatsApp` devolve `null` para
 * número fora de 10–13 dígitos, e o botão do portal simplesmente não é
 * renderizado: telefone errado degrada tão calado quanto telefone vazio. Aqui a
 * pessoa vê, ENQUANTO digita, se aquele número vira link — em vez de descobrir
 * pelo botão que nunca apareceu.
 */
export function DadosDaLoja() {
  const { activeLojaId, session, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /**
   * A loja sai da SESSÃO, e não de `GET /admin/lojas` — aquela rota é de
   * superadmin, e a dona levaria 403 num card feito para ela. O `/auth/me` já
   * devolve as lojas da pessoa com `endereco` e `telefone` (`auth.ts:110-120`),
   * que é exatamente o que este formulário edita.
   */
  const loja = session?.lojas?.find((l) => l.id === activeLojaId);
  const salvar = useUpdateDadosDaLoja();

  const form = useForm<{ nome: string; cnpj: string; endereco: string; telefone: string }>({
    defaultValues: { nome: "", cnpj: "", endereco: "", telefone: "" },
    values: loja
      ? {
          nome: loja.nome,
          cnpj: loja.cnpj ?? "",
          endereco: loja.endereco ?? "",
          telefone: loja.telefone ?? "",
        }
      : undefined,
    // O mesmo D13/E93 da tela de horário: campo intocado acompanha o servidor,
    // campo sujo é da pessoa até ela salvar.
    resetOptions: { keepDirtyValues: true },
  });

  useConfirmarSaida(sujoParaConfirmar(form.formState));

  const telefone = form.watch("telefone");
  const telefoneVira = !telefone.trim() || linkWhatsApp(telefone, "") !== null;

  async function onSubmit(valores: { nome: string; cnpj: string; endereco: string; telefone: string }) {
    try {
      await salvar.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          nome: valores.nome,
          cnpj: valores.cnpj,
          endereco: valores.endereco,
          telefone: valores.telefone,
        },
      });
      // A sessão é a fonte: invalidar `/auth/me` é o que faz o card e o rodapé
      // do portal passarem a ver o valor novo.
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      form.reset(valores);
      toast({ title: "Dados da loja salvos" });
    } catch (err) {
      toast({
        title: "Não deu para salvar os dados",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados da loja</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <p className="text-muted-foreground text-sm">
              O endereço e o telefone aparecem para a noiva — no rodapé do portal dela e na
              mensagem de confirmação do atendimento.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="loja-nome">Nome</Label>
                <Input id="loja-nome" {...form.register("nome")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loja-cnpj">CNPJ</Label>
                <Input id="loja-cnpj" placeholder="00.000.000/0000-00" {...form.register("cnpj")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loja-endereco">Endereço</Label>
              <Input
                id="loja-endereco"
                placeholder="Rua, número, cidade"
                {...form.register("endereco")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loja-telefone">Telefone / WhatsApp</Label>
              <Input id="loja-telefone" placeholder="(11) 98888-7777" {...form.register("telefone")} />
              {/* O aviso existe porque a falha é MUDA: sem link, o botão do
                  portal não é renderizado e ninguém fica sabendo. */}
              {!telefoneVira && (
                <p className="text-aviso text-sm">
                  Este número não vira link de WhatsApp — informe DDD + número. Sem isso, o botão
                  some do portal da noiva sem avisar.
                </p>
              )}
            </div>
            <Button type="submit" disabled={form.formState.isSubmitting || !telefoneVira}>
              {form.formState.isSubmitting ? "Salvando…" : "Salvar dados"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
