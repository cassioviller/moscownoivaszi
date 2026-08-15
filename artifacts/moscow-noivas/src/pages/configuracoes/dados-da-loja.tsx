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
import { cnpjValido, cpfValido } from "@workspace/financeiro-core";

/**
 * E234 — os onze campos que a dona edita: os quatro de sempre e os sete que o
 * INSTRUMENTO imprime da LOCADORA (quem assina, o PIX, a cidade do foro). Tudo
 * texto; vazio apaga na porta.
 */
type DadosDaLojaForm = {
  nome: string;
  cnpj: string;
  endereco: string;
  telefone: string;
  cidade: string;
  uf: string;
  representanteNome: string;
  representanteRg: string;
  representanteCpf: string;
  pixChave: string;
  pixTitular: string;
};
const VAZIO: DadosDaLojaForm = {
  nome: "",
  cnpj: "",
  endereco: "",
  telefone: "",
  cidade: "",
  uf: "",
  representanteNome: "",
  representanteRg: "",
  representanteCpf: "",
  pixChave: "",
  pixTitular: "",
};

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

  const form = useForm<DadosDaLojaForm>({
    defaultValues: VAZIO,
    values: loja
      ? {
          nome: loja.nome,
          cnpj: loja.cnpj ?? "",
          endereco: loja.endereco ?? "",
          telefone: loja.telefone ?? "",
          cidade: loja.cidade ?? "",
          uf: loja.uf ?? "",
          representanteNome: loja.representanteNome ?? "",
          representanteRg: loja.representanteRg ?? "",
          representanteCpf: loja.representanteCpf ?? "",
          pixChave: loja.pixChave ?? "",
          pixTitular: loja.pixTitular ?? "",
        }
      : undefined,
    // O mesmo D13/E93 da tela de horário: campo intocado acompanha o servidor,
    // campo sujo é da pessoa até ela salvar.
    resetOptions: { keepDirtyValues: true },
  });

  useConfirmarSaida(sujoParaConfirmar(form.formState));

  const telefone = form.watch("telefone");
  // E233: a MESMA régua da porta (`cnpjValido` do core) — a tela avisa antes,
  // e a API recusa depois; nenhuma das duas copia a outra.
  const cnpj = form.watch("cnpj");
  const cnpjFecha = !cnpj.trim() || cnpjValido(cnpj);
  // E234: o CPF de quem assina pela loja, pela mesma régua.
  const cpfRep = form.watch("representanteCpf");
  const cpfRepFecha = !cpfRep.trim() || cpfValido(cpfRep);
  const telefoneVira = !telefone.trim() || linkWhatsApp(telefone, "") !== null;

  async function onSubmit(valores: DadosDaLojaForm) {
    try {
      await salvar.mutateAsync({
        lojaId: activeLojaId!,
        data: { ...valores },
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
                {!cnpjFecha && (
                  <p className="text-aviso text-sm" data-testid="aviso-cnpj-invalido">
                    Os dígitos verificadores deste CNPJ não fecham — confira o número. Ele sai
                    impresso no cabeçalho de todo contrato.
                  </p>
                )}
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
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="loja-cidade">Cidade</Label>
                <Input id="loja-cidade" placeholder="São José dos Campos" {...form.register("cidade")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loja-uf">UF</Label>
                <Input id="loja-uf" placeholder="SP" maxLength={2} {...form.register("uf")} />
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              A cidade e a UF nomeiam o foro do contrato (cláusula 21ª) e a linha de local e data.
              O endereço acima continua saindo por inteiro na identificação da loja.
            </p>

            {/* E234 — quem assina pela loja: sai na 1ª página do instrumento. */}
            <h3 className="pt-2 text-sm font-medium">Quem assina pela loja</h3>
            <p className="text-muted-foreground text-sm">
              O representante legal, como sai na identificação das partes do contrato. Em branco, o
              papel imprime a lacuna para preencher à mão.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="loja-representante-nome">Nome</Label>
                <Input id="loja-representante-nome" {...form.register("representanteNome")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loja-representante-rg">RG</Label>
                <Input id="loja-representante-rg" placeholder="00.000.000-0" {...form.register("representanteRg")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="loja-representante-cpf">CPF</Label>
                <Input id="loja-representante-cpf" placeholder="000.000.000-00" {...form.register("representanteCpf")} />
                {!cpfRepFecha && (
                  <p className="text-aviso text-sm" data-testid="aviso-cpf-representante-invalido">
                    Os dígitos verificadores deste CPF não fecham — confira o número.
                  </p>
                )}
              </div>
            </div>

            {/* E234 — como a noiva paga: a linha do PIX ao pé da assinatura, no contrato e no recibo. */}
            <h3 className="pt-2 text-sm font-medium">Como a noiva paga</h3>
            <p className="text-muted-foreground text-sm">
              A chave PIX e o titular saem ao pé da assinatura do contrato e no recibo de cada
              pagamento. Sem chave, a linha não sai.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="loja-pix-chave">Chave PIX</Label>
                <Input id="loja-pix-chave" placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" {...form.register("pixChave")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loja-pix-titular">Titular da chave</Label>
                <Input id="loja-pix-titular" {...form.register("pixTitular")} />
              </div>
            </div>

            <Button
              type="submit"
              disabled={form.formState.isSubmitting || !telefoneVira || !cnpjFecha || !cpfRepFecha}
            >
              {form.formState.isSubmitting ? "Salvando…" : "Salvar dados"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
