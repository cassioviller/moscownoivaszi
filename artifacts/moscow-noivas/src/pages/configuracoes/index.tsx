import { useAuth } from "@/hooks/use-auth";
import { useListAtributos, useListCabines, useGetDisponibilidade, useListLojas, useListUsuarios, getListAtributosQueryKey, getListCabinesQueryKey, getGetDisponibilidadeQueryKey, getListLojasQueryKey, getListUsuariosQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Settings2, Users } from "lucide-react";
import { tipoAtributoLabel } from "@/lib/formatos";

export default function Configuracoes() {
  const { activeLojaId, user } = useAuth();
  
  // Loja specific queries
  const { data: atributos } = useListAtributos(activeLojaId!, { query: { queryKey: getListAtributosQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const { data: cabines } = useListCabines(activeLojaId!, { query: { queryKey: getListCabinesQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const { data: disponibilidade } = useGetDisponibilidade(activeLojaId!, { query: { queryKey: getGetDisponibilidadeQueryKey(activeLojaId!), enabled: !!activeLojaId } });

  // Admin/Superadmin queries
  const { data: lojas } = useListLojas({ query: { queryKey: getListLojasQueryKey(), enabled: !!user?.isSuperAdmin } });
  const { data: usuarios } = useListUsuarios({ query: { queryKey: getListUsuariosQueryKey(), enabled: !!user?.isSuperAdmin } });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-serif">Configurações</h1>

      <Tabs defaultValue="loja" className="space-y-4">
        <TabsList>
          <TabsTrigger value="loja" className="gap-2"><Settings2 className="h-4 w-4"/> Loja Atual</TabsTrigger>
          {user?.isSuperAdmin && (
            <TabsTrigger value="admin" className="gap-2"><Building2 className="h-4 w-4"/> Administração</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="loja" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Atributos de Vestido</CardTitle>
              </CardHeader>
              <CardContent>
                {atributos?.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhum atributo configurado.</p>
                ) : (
                  <ul className="space-y-3">
                    {atributos?.map(attr => (
                      <li key={attr.id} className="flex justify-between items-center border-b pb-2">
                        <div>
                          <span className="font-medium">{attr.nome}</span>
                          <span className="text-xs text-muted-foreground ml-2">({tipoAtributoLabel(attr.tipo)})</span>
                        </div>
                        <Badge variant={attr.ativo ? "default" : "secondary"}>{attr.ativo ? 'Ativo' : 'Inativo'}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Disponibilidade e Regras</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {disponibilidade ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Provas (dias antes)</span>
                      <span className="font-medium">{disponibilidade.provaDiasAntes} dias</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duração Prova</span>
                      <span className="font-medium">{disponibilidade.provaDuracao} min</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Uso (dias antes)</span>
                      <span className="font-medium">{disponibilidade.usoDiasAntes} dias</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Devolução (dias depois)</span>
                      <span className="font-medium">{disponibilidade.usoDiasDepois} dias</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Regras de disponibilidade não configuradas.</p>
                )}
              </CardContent>
            </Card>
            
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Cabines</CardTitle>
              </CardHeader>
              <CardContent>
                 {cabines?.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhuma cabine configurada.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {cabines?.map(cabine => (
                      <div key={cabine.id} className="p-3 border rounded-md text-center">
                        <div className="font-medium">{cabine.nome}</div>
                        <Badge variant={cabine.ativo ? "default" : "secondary"} className="mt-2 text-[10px]">
                          {cabine.ativo ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {user?.isSuperAdmin && (
          <TabsContent value="admin" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" /> Lojas do Sistema
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {lojas?.map(loja => (
                      <li key={loja.id} className="flex justify-between items-center border-b pb-2">
                        <div>
                          <span className="font-medium">{loja.nome}</span>
                          <span className="text-xs text-muted-foreground ml-2 block">{loja.cnpj || 'Sem CNPJ'}</span>
                        </div>
                        <Badge variant={loja.ativo ? "default" : "secondary"}>{loja.ativo ? 'Ativa' : 'Inativa'}</Badge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" /> Usuários Globais
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {usuarios?.map(u => (
                      <li key={u.id} className="flex justify-between items-center border-b pb-2">
                        <div>
                          <span className="font-medium flex items-center gap-2">
                            {u.nome}
                            {u.isSuperAdmin && <Badge variant="default" className="text-[10px]">Admin</Badge>}
                          </span>
                          <span className="text-xs text-muted-foreground">{u.email}</span>
                        </div>
                        <Badge variant={u.ativo ? "outline" : "secondary"}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
