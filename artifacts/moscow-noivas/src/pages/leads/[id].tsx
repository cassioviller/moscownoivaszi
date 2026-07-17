import { Link } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useGetLead, getGetLeadQueryKey } from "@workspace/api-client-react";
import { useRoute } from "@/lib/router-compat";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, ArrowRight } from "lucide-react";
import { etapaLabel } from "@/lib/formatos";
import { dataLongaFmt } from "@/pages/noivas/helpers";

export default function LeadDetail() {
  const { activeLojaId } = useAuth();
  const [, params] = useRoute("/leads/:id");
  const id = params?.id;

  const { data: lead, isLoading, isError, refetch } = useGetLead(activeLojaId!, id!, {
    query: {
      queryKey: getGetLeadQueryKey(activeLojaId!, id!),
      enabled: !!activeLojaId && !!id,
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar</AlertTitle>
        <AlertDescription className="flex items-center gap-3">
          <span>Tente novamente em instantes.</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!lead) {
    return (
      <div className="max-w-md space-y-4 text-center mx-auto py-12">
        <h1 className="text-2xl font-serif">Noiva não encontrada</h1>
        <p className="text-muted-foreground">Este cadastro pode ter sido removido.</p>
        <Button asChild variant="outline">
          <Link to="/leads">Voltar à lista</Link>
        </Button>
      </div>
    );
  }

  const casamento = lead.casamentoData ? dataLongaFmt.format(new Date(lead.casamentoData)) : "Não informada";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-serif">{lead.noivaNome}</h1>
        <Badge variant="secondary" className="text-sm px-3 py-1">
          {etapaLabel(lead.etapa)}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Noivo(a):</span>{" "}
              {lead.noivoNome || <span className="text-muted-foreground">Não informado</span>}
            </div>
            <div>
              <span className="font-medium">WhatsApp:</span>{" "}
              {lead.whatsapp || <span className="text-muted-foreground">Não informado</span>}
            </div>
            <div>
              <span className="font-medium">Data do casamento:</span> {casamento}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Esta é a visão enxuta; o perfil completo (jornada, orçamentos, provas)
          vive na tela de Noivas. Um caminho, não um beco sem saída. */}
      <Button asChild>
        <Link to={`/loja/${activeLojaId}/noivas/${lead.id}`}>
          Ver perfil completo da noiva
          <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
