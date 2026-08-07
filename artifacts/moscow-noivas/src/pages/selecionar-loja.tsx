import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSelecionarLoja, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useStoreStore } from "@/lib/store";
import { useNavigate } from "react-router";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Building2, Search, SearchX, Store } from "lucide-react";
import { mensagemApi } from "@/lib/erro-api";

// S35: a cópia local (`toLocaleLowerCase("pt-BR")` antes do NFD, sem trim)
// produzia o mesmo resultado da régua da casa — consolidada.
import { normalizar } from "@/lib/formatos";

export default function SelecionarLoja() {
  // As lojas vêm da sessão (/auth/me): é exatamente o que o usuário pode acessar.
  // A rota /admin/lojas é exclusiva de superadmin e não serve à seleção da vendedora.
  const { user, activeLojaId, session, isLoading } = useAuth();
  const lojas = session?.lojas;
  const { setActiveLojaId } = useStoreStore();
  const queryClient = useQueryClient();
  const selecionarLoja = useSelecionarLoja();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busca, setBusca] = useState("");

  const buscaAtiva = busca.trim().length > 0;

  const lojasFiltradas = useMemo(() => {
    if (!lojas) return [];
    if (!buscaAtiva) return lojas;
    const termo = normalizar(busca.trim());
    return lojas.filter((loja) => {
      const nome = normalizar(loja.nome ?? "");
      const endereco = normalizar(loja.endereco ?? "");
      return nome.includes(termo) || endereco.includes(termo);
    });
  }, [lojas, busca, buscaAtiva]);

  const handleSelect = async (lojaId: string) => {
    try {
      await selecionarLoja.mutateAsync({ data: { lojaId } });
      // Sem isto o AppLayout lê o activeLojaId stale do getMe e devolve a
      // usuária para cá (A1). Atualiza o store na hora e refaz a sessão.
      setActiveLojaId(lojaId);
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      navigate(`/loja/${lojaId}/dashboard`);
    // E96/E104: `mensagemApi` recebe `unknown` — o `any` era resquício do
    // padrão antigo, e era o ÚLTIMO do frontend inteiro.
    } catch (error) {
      toast({
        title: "Não deu para selecionar loja",
        description: mensagemApi(error, "Não foi possível entrar na loja. Tente novamente."),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-muted"></div>
          <div className="h-4 w-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  const temLojas = (lojas?.length ?? 0) > 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-3xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-serif text-primary">Bem-vindo, {user?.nome}</h1>
          <p className="text-muted-foreground">Selecione a loja em que deseja operar</p>
        </div>

        {temLojas && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder="Buscar loja por nome ou endereço..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
                aria-label="Buscar loja por nome ou endereço"
                data-testid="input-busca-loja"
              />
            </div>
            {buscaAtiva && (
              <p className="text-sm text-muted-foreground" data-testid="text-contagem-busca">
                {lojasFiltradas.length === 0
                  ? "Nenhum resultado"
                  : lojasFiltradas.length === 1
                    ? "1 loja encontrada"
                    : `${lojasFiltradas.length} lojas encontradas`}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lojasFiltradas.map((loja) => (
            <Card
              key={loja.id}
              className={`hover-elevate cursor-pointer transition-colors border-2 ${activeLojaId === loja.id ? 'border-primary' : 'border-transparent'}`}
              onClick={() => handleSelect(loja.id)}
            >
              <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <Store className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle>{loja.nome}</CardTitle>
                  <CardDescription>{loja.endereco || "Sem endereço cadastrado"}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Button
                  variant={activeLojaId === loja.id ? "default" : "outline"}
                  className="w-full"
                >
                  {selecionarLoja.isPending ? "Selecionando..." : activeLojaId === loja.id ? "Continuar na loja atual" : "Entrar nesta loja"}
                </Button>
              </CardContent>
            </Card>
          ))}

          {temLojas && buscaAtiva && lojasFiltradas.length === 0 && (
            <div
              className="col-span-full text-center p-12 border rounded-lg bg-card"
              data-testid="empty-busca-loja"
            >
              <SearchX className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhuma loja corresponde à busca</h3>
              <p className="text-muted-foreground">
                Ajuste o termo digitado ou limpe a busca para ver todas as lojas.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => setBusca("")}>
                Limpar busca
              </Button>
            </div>
          )}

          {!temLojas && (
            <div className="col-span-full text-center p-12 border rounded-lg bg-card">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhuma loja encontrada</h3>
              <p className="text-muted-foreground">Você não tem acesso a nenhuma loja no momento.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
