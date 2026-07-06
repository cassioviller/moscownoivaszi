import { useAuth } from "@/hooks/use-auth";
import { useListEquipe, useListPerfis, getListEquipeQueryKey, getListPerfisQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Equipe() {
  const { activeLojaId } = useAuth();
  const { data: equipe, isLoading: loadingEquipe } = useListEquipe(activeLojaId!, { query: { queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const { data: perfis, isLoading: loadingPerfis } = useListPerfis({ query: { queryKey: getListPerfisQueryKey(), enabled: !!activeLojaId } });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-serif">Equipe e Perfis</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Membros da Equipe</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingEquipe ? (
              <div className="animate-pulse space-y-4">
                {[1, 2].map(i => <div key={i} className="h-12 bg-muted rounded-md" />)}
              </div>
            ) : equipe?.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum membro encontrado.</p>
            ) : (
              <ul className="space-y-4">
                {equipe?.map(membro => (
                  <li key={membro.usuarioId} className="flex justify-between items-center p-3 border rounded-md">
                    <div>
                      <div className="font-medium">{membro.nome}</div>
                      <div className="text-sm text-muted-foreground">{membro.email}</div>
                    </div>
                    <Badge variant="secondary">{membro.perfilNome}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Perfis de Acesso</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPerfis ? (
              <div className="animate-pulse space-y-4">
                {[1, 2].map(i => <div key={i} className="h-12 bg-muted rounded-md" />)}
              </div>
            ) : perfis?.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum perfil encontrado.</p>
            ) : (
              <ul className="space-y-3">
                {perfis?.map(perfil => (
                  <li key={perfil.id} className="border-b pb-2">
                    <span className="font-medium block">{perfil.nome}</span>
                    <span className="text-xs text-muted-foreground block truncate">
                      {Object.keys(perfil.acessosModulos).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
