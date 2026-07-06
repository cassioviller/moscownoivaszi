import { useAuth } from "@/hooks/use-auth";
import { useGetLead, getGetLeadQueryKey } from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function LeadDetail() {
  const { activeLojaId } = useAuth();
  const [, params] = useRoute("/leads/:id");
  const id = params?.id;

  const { data: lead, isLoading } = useGetLead(activeLojaId!, id!, {
    query: {
      queryKey: getGetLeadQueryKey(activeLojaId!, id!),
      enabled: !!activeLojaId && !!id,
    }
  });

  if (isLoading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-12 w-64 bg-muted rounded"></div>
      <div className="h-64 bg-muted rounded"></div>
    </div>;
  }

  if (!lead) return <div>Lead não encontrado.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif">{lead.noivaNome}</h1>
        <Badge className="text-sm px-3 py-1">{lead.etapa}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="font-semibold">Noivo(a):</span> {lead.noivoNome || 'Não informado'}
            </div>
            <div>
              <span className="font-semibold">WhatsApp:</span> {lead.whatsapp || 'Não informado'}
            </div>
            <div>
              <span className="font-semibold">Data do Casamento:</span> {lead.casamentoData ? new Date(lead.casamentoData).toLocaleDateString() : 'Não informada'}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
