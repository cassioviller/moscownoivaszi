import { useAuth } from "@/hooks/use-auth";
import { useListLojas, useSelecionarLoja } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Store } from "lucide-react";

export default function SelecionarLoja() {
  const { user, activeLojaId } = useAuth();
  const { data: lojas, isLoading } = useListLojas();
  const selecionarLoja = useSelecionarLoja();
  const [, setLocation] = useLocation();

  const handleSelect = async (lojaId: string) => {
    await selecionarLoja.mutateAsync({ data: { lojaId } });
    setLocation("/dashboard");
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-3xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-serif text-primary">Bem-vindo, {user?.nome}</h1>
          <p className="text-muted-foreground">Selecione a loja em que deseja operar</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lojas?.map((loja) => (
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
          
          {lojas?.length === 0 && (
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
