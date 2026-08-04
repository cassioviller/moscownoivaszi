import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateVestido,
  getListVestidosQueryKey,
  useListAtributos,
  getListAtributosQueryKey,
} from "@workspace/api-client-react";
import type { VestidoAtributo } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { VestidoForm, type VestidoFormValues } from "./vestido-form";
import { podeNoModulo } from "@/lib/permissoes";
import { CACHE_ESTAVEL } from "@/lib/cache";
import { mensagemApi } from "@/lib/erro-api";

/** Cadastro completo de vestido (com características do catálogo) — portado de vestidos/novo do orcamentos. */
export default function NovoVestido() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const podeCriar = podeNoModulo(acessosModulos, "vestidos", "criar");

  const catalogoQuery = useListAtributos(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListAtributosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const createVestido = useCreateVestido();

  async function onSubmit(values: VestidoFormValues, atributos: VestidoAtributo[]) {
    try {
      const criado = await createVestido.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          codigo: values.codigo,
          nome: values.nome,
          precoBase: values.precoBase,
          // E157: só vai quando existe — o POST não tem o que apagar.
          ...(values.precoRealuguel != null ? { precoRealuguel: values.precoRealuguel } : {}),
          tamanho: values.tamanho || undefined,
          categoria: values.categoria || undefined,
          observacoes: values.observacoes || undefined,
          atributos: atributos.length > 0 ? atributos : undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListVestidosQueryKey(activeLojaId!) });
      toast({ title: "Vestido cadastrado" });
      navigate(`/loja/${lojaId}/vestidos/${criado.id}`);
    } catch (err) {
      toast({
        title: "Não deu para cadastrar vestido",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          to={`/loja/${lojaId}/vestidos`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Vestidos
        </Link>
        <h1 className="mt-1 text-3xl font-serif">Novo vestido</h1>
      </div>

      {!podeCriar ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sem acesso</AlertTitle>
          <AlertDescription>Você não tem permissão para cadastrar vestidos.</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Dados do vestido</CardTitle>
          </CardHeader>
          <CardContent>
            {catalogoQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              // Catálogo com erro não bloqueia o cadastro: o form abre sem as características.
              <VestidoForm
                catalogo={catalogoQuery.data ?? []}
                submitLabel="Cadastrar vestido"
                onSubmit={onSubmit}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
