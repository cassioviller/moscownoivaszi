import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetLead,
  getGetLeadQueryKey,
  useUpdateLead,
  getListLeadsQueryKey,
} from "@workspace/api-client-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { diaParaISO } from "@/lib/formatos";
import { NoivaForm, type NoivaFormValues } from "../noiva-form";
import { isoParaDia } from "../helpers";
import { podeNoModulo } from "@/lib/permissoes";
import { converteu } from "@/lib/funil";
import { mensagemApi } from "@/lib/erro-api";

/** Editar dados da noiva (porte da /noivas/[leadId]/editar) — volta ao perfil. */
export default function EditarNoiva() {
  const { lojaId, leadId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: lead, isLoading, isError, error, refetch } = useGetLead(activeLojaId!, leadId!, {
    query: {
      queryKey: getGetLeadQueryKey(activeLojaId!, leadId!),
      enabled: !!activeLojaId && !!leadId,
    },
  });
  const updateLead = useUpdateLead();
  const podeEditar = podeNoModulo(acessosModulos, "leads", "editar");

  const onSubmit = async (values: NoivaFormValues) => {
    try {
      // F2: a origem passou a viajar no PATCH — é o único caminho de correção de
      // um canal errado, e a rota recusa (422 ORIGEM_IMUTAVEL) depois que a
      // noiva converte. Textos vazios seguem como "" para permitir limpar; data
      // vazia não limpa.
      await updateLead.mutateAsync({
        lojaId: activeLojaId!,
        leadId: leadId!,
        data: {
          noivaNome: values.noivaNome,
          noivoNome: values.noivoNome ?? "",
          whatsapp: values.whatsapp ?? "",
          cerimonialista: values.cerimonialista ?? "",
          casamentoData: values.casamentoData ? diaParaISO(values.casamentoData) : undefined,
          casamentoHorario: values.casamentoHorario ?? "",
          casamentoLocal: values.casamentoLocal ?? "",
          origem: values.origem,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(activeLojaId!, leadId!) }),
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey(activeLojaId!) }),
      ]);
      toast({ title: "Dados da noiva salvos" });
      navigate(`/loja/${lojaId}/noivas/${leadId}`);
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <Link
          to={`/loja/${lojaId}/noivas/${leadId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {lead?.noivaNome ?? "Noiva"}
        </Link>
        <h1 className="text-3xl font-serif mt-1">Editar noiva</h1>
        {lead && <p className="text-sm text-muted-foreground mt-1">{lead.noivaNome}</p>}
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar a noiva</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>{mensagemApi(error, "Falha inesperada ao buscar a noiva.")}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : !podeEditar ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sem acesso</AlertTitle>
          <AlertDescription>
            Seu perfil não tem acesso ao módulo de noivas nesta loja.
          </AlertDescription>
        </Alert>
      ) : isLoading || !lead ? (
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-96 max-w-full bg-muted rounded" />
          <div className="h-64 w-96 max-w-full bg-muted rounded" />
        </div>
      ) : (
        <NoivaForm
          submitLabel="Salvar alterações"
          pending={updateLead.isPending}
          onSubmit={onSubmit}
          origemTravada={converteu(lead.etapa)}
          defaults={{
            noivaNome: lead.noivaNome,
            noivoNome: lead.noivoNome ?? "",
            whatsapp: lead.whatsapp ?? "",
            cerimonialista: lead.cerimonialista ?? "",
            casamentoData: lead.casamentoData ? isoParaDia(lead.casamentoData) : "",
            casamentoHorario: lead.casamentoHorario ?? "",
            casamentoLocal: lead.casamentoLocal ?? "",
            origem: lead.origem,
          }}
        />
      )}
    </div>
  );
}
