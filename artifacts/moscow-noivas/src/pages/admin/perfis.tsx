import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  useListPerfis,
  getListPerfisQueryKey,
  useUpdatePerfil,
  type AcessosModulos,
} from "@workspace/api-client-react";
import { AdminShell } from "@/components/layout/admin-shell";
import {
  MatrizPermissoes,
  ehPerfilAdmin,
} from "@/components/permissoes/matriz-permissoes";
import { Card } from "@/components/ui/card";
import { Erro, Vazio } from "@/components/estado";
import { CACHE_ESTAVEL } from "@/lib/cache";
import { SEM_PERFIS_TITULO, SEM_PERFIS_DESCRICAO } from "@/lib/perfis-do-sistema";
import { mensagemApi } from "@/lib/erro-api";

/** Templates globais de perfil — rota top-level /admin/perfis (fora de /loja). */
export default function AdminPerfis() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: perfis,
    isLoading,
    isError,
    error,
    refetch,
  } = useListPerfis({
    query: { ...CACHE_ESTAVEL, queryKey: getListPerfisQueryKey() },
  });
  const updatePerfil = useUpdatePerfil();

  const salvar = async (perfilId: string, acessos: AcessosModulos) => {
    try {
      await updatePerfil.mutateAsync({ perfilId, data: { acessosModulos: acessos } });
      await queryClient.invalidateQueries({ queryKey: getListPerfisQueryKey() });
      toast({
        title: "Perfil atualizado",
        description: "Novo padrão herdado pelas lojas sem personalização.",
      });
    } catch (err) {
      toast({
        title: "Não deu para atualizar perfil",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  return (
    <AdminShell>
      <section className="space-y-6">
        <div>
          <Link
            to="/admin"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Administração
          </Link>
          <h1 className="text-2xl font-serif mt-1">Perfis (modelos globais)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Permissões padrão herdadas por todas as lojas. Cada loja pode personalizar em
            Permissões.
          </p>
        </div>

        {isError ? (
          <Erro
            titulo="Não deu para carregar os perfis"
            erro={error}
            onTentarNovamente={() => refetch()}
          />
        ) : isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Card key={i} className="animate-pulse h-48" />
            ))}
          </div>
        ) : perfis?.length === 0 ? (
          // S-D9 — a MESMA lista da tela de Permissões, e a mesma notícia. Era
          // a cópia que a sobra não tinha visto: esta é justamente a tela do
          // superadmin, a única sessão que consegue chegar num vazio destes.
          <Vazio titulo={SEM_PERFIS_TITULO} descricao={SEM_PERFIS_DESCRICAO} />
        ) : (
          <div className="space-y-6">
            {perfis?.map((perfil) => {
              const readonly = ehPerfilAdmin(perfil);
              return (
                <MatrizPermissoes
                  // key com assinatura → remonta a matriz quando o servidor devolve novos valores
                  key={`${perfil.id}-${JSON.stringify(perfil.acessosModulos)}`}
                  perfilNome={perfil.nome}
                  valores={perfil.acessosModulos as AcessosModulos}
                  modo={readonly ? "readonly" : "editavel"}
                  salvando={updatePerfil.isPending}
                  onSalvar={(acessos) => salvar(perfil.id, acessos)}
                />
              );
            })}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
