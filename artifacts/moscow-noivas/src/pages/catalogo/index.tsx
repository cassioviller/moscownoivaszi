import { Link, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useListAtributos, getListAtributosQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { podeNoModulo } from "@/lib/permissoes";
import { tipoAtributoLabel } from "@/lib/formatos";
import { CACHE_ESTAVEL } from "@/lib/cache";
import { Erro } from "@/components/estado";

export default function Catalogo() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();

  // No main o backend gateia /atributos pelo módulo "vestidos" (catalogo.ts).
  // TODO Onda 4: o orcamentos distinguia ver/criar/editar dentro de "config";
  // hoje o gate é flat por módulo.
  const podeGerir = podeNoModulo(acessosModulos, "vestidos", "editar");

  const { data: atributos, isLoading, isError, error, refetch } = useListAtributos(activeLojaId!, {
    query: { ...CACHE_ESTAVEL,
      queryKey: getListAtributosQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });

  const ordenados = [...(atributos ?? [])].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif">Catálogo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            As características que descrevem vestidos e interesses — e conectam um ao outro.
          </p>
        </div>
        {podeGerir && (
          <Button asChild data-testid="button-novo-atributo">
            <Link to={`/loja/${lojaId}/catalogo/novo`}>
              <Plus className="h-4 w-4 mr-2" />
              Novo atributo
            </Link>
          </Button>
        )}
      </div>

      {isError ? (
        <Erro titulo="Não deu para carregar o catálogo" erro={error} onTentarNovamente={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-16" />
          ))}
        </div>
      ) : ordenados.length === 0 ? (
        <div className="text-center py-12 space-y-1">
          <p className="text-muted-foreground">Nenhum atributo no catálogo ainda.</p>
          <p className="text-sm text-muted-foreground">
            {podeGerir
              ? "Crie o primeiro — ele passará a aparecer no cadastro de vestidos e de interesses."
              : "Peça à administração para configurar o catálogo."}
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {ordenados.map((a) => {
                const ativas = (a.opcoes ?? [])
                  .filter((o) => o.ativo)
                  .sort((x, y) => x.ordem - y.ordem);
                const resumo = ativas.map((o) => o.valor).join(" · ") || "sem opções ativas";
                const conteudo = (
                  <>
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">{a.nome}</span>
                        <span className="text-xs text-muted-foreground">{tipoAtributoLabel(a.tipo)}</span>
                        {!a.ativo && (
                          <Badge variant="outline" className="text-xs">
                            inativo
                          </Badge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">{resumo}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {ativas.length} {ativas.length === 1 ? "opção" : "opções"}
                    </span>
                  </>
                );
                return (
                  <li key={a.id}>
                    {podeGerir ? (
                      <Link
                        to={`/loja/${lojaId}/catalogo/${a.id}/editar`}
                        className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/50 transition-colors"
                        data-testid={`link-atributo-${a.id}`}
                      >
                        {conteudo}
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-4 px-4 py-3">{conteudo}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
