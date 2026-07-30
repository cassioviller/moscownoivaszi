import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  useListPerfis,
  getListPerfisQueryKey,
  useListPerfilOverrides,
  getListPerfilOverridesQueryKey,
  useSetPerfilOverride,
  useDeletePerfilOverride,
  type AcessosModulos,
} from "@workspace/api-client-react";
import {
  MatrizPermissoes,
  ehPerfilAdmin,
} from "@/components/permissoes/matriz-permissoes";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Erro } from "@/components/estado";
import { estadoDasConsultas } from "@/lib/estado-consulta";
import { podeNoModulo } from "@/lib/permissoes";
import { CACHE_ESTAVEL } from "@/lib/cache";

/**
 * Permissões por perfil na loja ativa: matriz FLAT (um boolean por módulo).
 * Sem personalização, o perfil segue o modelo global; salvar cria um override
 * da loja (PUT /admin/lojas/:lojaId/overrides).
 */
export default function Permissoes() {
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const podeGerir = podeNoModulo(acessosModulos, "admin", "editar");

  // E121/C3 — as queries inteiras: com uma delas falhada, a tela ficava com o
  // título e uma página em branco (`perfis === undefined` não caía em ramo
  // nenhum) — nem erro, nem saída.
  const perfisQuery = useListPerfis({
    query: { ...CACHE_ESTAVEL, queryKey: getListPerfisQueryKey(), enabled: !!activeLojaId && podeGerir },
  });
  const overridesQuery = useListPerfilOverrides(
    activeLojaId!,
    {
      query: {
        queryKey: getListPerfilOverridesQueryKey(activeLojaId!),
        enabled: !!activeLojaId && podeGerir,
      },
    },
  );
  const perfis = perfisQuery.data;
  const overrides = overridesQuery.data;
  const estado = estadoDasConsultas(perfisQuery, overridesQuery);

  const setOverride = useSetPerfilOverride();
  const deleteOverride = useDeletePerfilOverride();

  const restaurarPadrao = async (perfilId: string) => {
    try {
      await deleteOverride.mutateAsync({ lojaId: activeLojaId!, perfilId });
      await queryClient.invalidateQueries({
        queryKey: getListPerfilOverridesQueryKey(activeLojaId!),
      });
      toast({
        title: "Padrão restaurado",
        description: "O perfil volta a seguir o modelo global.",
      });
    } catch (err) {
      toast({
        title: "Erro ao restaurar o padrão",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const salvar = async (perfilId: string, acessos: AcessosModulos) => {
    try {
      await setOverride.mutateAsync({
        lojaId: activeLojaId!,
        data: { perfilId, acessosModulos: acessos },
      });
      await queryClient.invalidateQueries({
        queryKey: getListPerfilOverridesQueryKey(activeLojaId!),
      });
      toast({ title: "Permissões salvas", description: "Personalização aplicada a esta loja." });
    } catch (err) {
      toast({
        title: "Erro ao salvar permissões",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  if (!podeGerir) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Sem acesso</AlertTitle>
        <AlertDescription>
          Apenas perfis com o módulo de administração liberado gerenciam as permissões da
          loja.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif">Permissões</h1>
        <p className="text-sm text-muted-foreground mt-1">
          O que cada perfil pode fazer nesta loja. Sem personalização, segue o modelo
          global.
        </p>
      </div>

      {estado === "erro" ? (
        <Erro
          titulo="As permissões não carregaram"
          erro={perfisQuery.error ?? overridesQuery.error}
          onTentarNovamente={() => {
            void perfisQuery.refetch();
            void overridesQuery.refetch();
          }}
        />
      ) : estado === "carregando" ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse h-48" />
          ))}
        </div>
      ) : perfis?.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum perfil encontrado.</p>
      ) : (
        <div className="space-y-6">
          {perfis?.map((perfil) => {
            const override = overrides?.find((o) => o.perfilId === perfil.id) ?? null;
            const efetivo = (override?.acessosModulos ??
              perfil.acessosModulos) as AcessosModulos;
            const readonly = ehPerfilAdmin(perfil);
            return (
              <MatrizPermissoes
                // key com assinatura → remonta a matriz quando o servidor devolve novos valores
                key={`${perfil.id}-${override ? "o" : "p"}-${JSON.stringify(efetivo)}`}
                perfilNome={perfil.nome}
                valores={efetivo}
                modo={readonly ? "readonly" : "editavel"}
                estado={readonly ? undefined : override ? "personalizado" : "padrao"}
                salvando={setOverride.isPending || deleteOverride.isPending}
                onSalvar={(acessos) => salvar(perfil.id, acessos)}
                onRestaurarPadrao={() => restaurarPadrao(perfil.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
