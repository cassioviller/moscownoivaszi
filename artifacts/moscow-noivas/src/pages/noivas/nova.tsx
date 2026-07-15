import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useCreateLead, getListLeadsQueryKey } from "@workspace/api-client-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { diaParaISO } from "@/lib/formatos";
import { NoivaForm, type NoivaFormValues } from "./noiva-form";
import { podeLeads } from "./helpers";

/** Adicionar noiva (porte da /noivas/nova) — ao criar, navega ao perfil. */
export default function NovaNoiva() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const createLead = useCreateLead();

  // TODO Onda 4: nível-ação "criar" — hoje o gate é flat por módulo.
  const podeCriar = podeLeads(acessosModulos);

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
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey(activeLojaId!) });
      toast({ title: "Noiva adicionada" });
      navigate(`/loja/${lojaId}/noivas/${criada.id}`);
    } catch (err) {
      toast({
        title: "Erro ao adicionar noiva",
        description: err instanceof Error ? err.message : "Tente novamente.",
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
