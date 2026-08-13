import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useCreateLead, getListLeadsQueryKey } from "@workspace/api-client-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { diaParaISO } from "@/lib/formatos";
import { NoivaForm, type NoivaFormValues } from "./noiva-form";
import { podeNoModulo } from "@/lib/permissoes";
import { mensagemApi } from "@/lib/erro-api";

/** Adicionar noiva (porte da /noivas/nova) — ao criar, navega ao perfil. */
export default function NovaNoiva() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const createLead = useCreateLead();

  const podeCriar = podeNoModulo(acessosModulos, "leads", "criar");

  const onSubmit = async (values: NoivaFormValues) => {
    try {
      const criada = await createLead.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          noivaNome: values.noivaNome,
          noivoNome: values.noivoNome || undefined,
          whatsapp: values.whatsapp || undefined,
          cerimonialista: values.cerimonialista || undefined,
          casamentoData: values.casamentoData ? diaParaISO(values.casamentoData) : undefined,
          casamentoHorario: values.casamentoHorario || undefined,
          casamentoLocal: values.casamentoLocal || undefined,
          origem: values.origem,
          // E215 — a qualificação de quem assina. `undefined` e não `null`
          // aqui: no POST o campo ausente é "não preenchi", e a coluna nasce
          // nula sozinha — mandar `null` explícito diria a mesma coisa por um
          // caminho a mais.
          cpf: values.cpf || undefined,
          rg: values.rg || undefined,
          estadoCivil: values.estadoCivil,
          profissao: values.profissao || undefined,
          nascimento: values.nascimento ? diaParaISO(values.nascimento) : undefined,
          email: values.email || undefined,
          enderecoLogradouro: values.enderecoLogradouro || undefined,
          enderecoNumero: values.enderecoNumero || undefined,
          enderecoComplemento: values.enderecoComplemento || undefined,
          enderecoBairro: values.enderecoBairro || undefined,
          enderecoCep: values.enderecoCep || undefined,
          enderecoCidade: values.enderecoCidade || undefined,
          enderecoEstado: values.enderecoEstado || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey(activeLojaId!) });
      toast({ title: "Noiva adicionada" });
      navigate(`/loja/${lojaId}/noivas/${criada.id}`);
    } catch (err) {
      toast({
        title: "Não deu para adicionar noiva",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <Link
          to={`/loja/${lojaId}/noivas`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Noivas
        </Link>
        <h1 className="text-3xl font-serif mt-1">Adicionar noiva</h1>
      </div>

      {!podeCriar ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sem acesso</AlertTitle>
          <AlertDescription>
            Seu perfil não tem acesso ao módulo de noivas nesta loja.
          </AlertDescription>
        </Alert>
      ) : (
        <NoivaForm submitLabel="Adicionar noiva" pending={createLead.isPending} onSubmit={onSubmit} />
      )}
    </div>
  );
}
