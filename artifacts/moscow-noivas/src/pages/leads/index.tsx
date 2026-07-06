import { useAuth } from "@/hooks/use-auth";
import { useListLeads, getListLeadsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function Leads() {
  const { activeLojaId } = useAuth();
  const { data: leads, isLoading } = useListLeads(activeLojaId!, {
    query: {
      queryKey: getListLeadsQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-serif">Leads</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-32"></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif">Leads</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Lead
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {leads?.map((lead) => (
          <Link key={lead.id} href={`/leads/${lead.id}`}>
            <Card className="hover-elevate cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>{lead.noivaNome}</span>
                  <Badge variant="secondary">{lead.etapa}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Data: {lead.casamentoData ? new Date(lead.casamentoData).toLocaleDateString() : 'Não informada'}
                </p>
                {lead.whatsapp && (
                  <p className="text-sm text-muted-foreground mt-1">
                    WhatsApp: {lead.whatsapp}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}

        {leads?.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Nenhum lead encontrado.
          </div>
        )}
      </div>
    </div>
  );
}
