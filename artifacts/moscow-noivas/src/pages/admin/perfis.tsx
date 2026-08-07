import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  useListPerfis,
  getListPerfisQueryKey,
  useUpdatePerfil,
  useCreatePerfil,
  type AcessosModulos,
} from "@workspace/api-client-react";
import { AdminShell } from "@/components/layout/admin-shell";
import {
  MatrizPermissoes,
  ehPerfilAdmin,
} from "@/components/permissoes/matriz-permissoes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Erro, Vazio } from "@/components/estado";
import { CACHE_ESTAVEL } from "@/lib/cache";
import { SEM_PERFIS_TITULO, SEM_PERFIS_DESCRICAO } from "@/lib/perfis-do-sistema";
import { MODULOS_ROTULOS } from "@/lib/permissoes";
import { mensagemApi } from "@/lib/erro-api";

/**
 * S-D36 — o perfil novo nasce com TUDO desligado, e é a matriz que liga.
 *
 * O default fechado é o seguro: um perfil recém-criado não dá acesso a nada
 * até o superadmin marcar, na mesma matriz que já edita os existentes. Os
 * módulos vêm do rótulo oficial — o mesmo conjunto que a matriz desenha.
 */
function acessosZerados(): AcessosModulos {
  return Object.fromEntries(
    Object.keys(MODULOS_ROTULOS).map((m) => [m, { ver: false, criar: false, editar: false }]),
  );
}

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
  const createPerfil = useCreatePerfil();

  // S-D36 — a tela listava e editava, e não tinha por onde REPOR: o
  // `POST /admin/perfis` existia no servidor com zero usos no app, e o vazio
  // da S-D9 era um beco. Decidido em 2026-08-07: a tela ganha o botão.
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoNome, setNovoNome] = useState("");

  const criar = async () => {
    const nome = novoNome.trim();
    if (!nome) return;
    try {
      await createPerfil.mutateAsync({ data: { nome, acessosModulos: acessosZerados() } });
      await queryClient.invalidateQueries({ queryKey: getListPerfisQueryKey() });
      setNovoOpen(false);
      setNovoNome("");
      toast({
        title: "Perfil criado",
        description: `"${nome}" nasce sem acesso nenhum — marque na matriz o que ele pode.`,
      });
    } catch (err) {
      toast({
        title: "Não deu para criar o perfil",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

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
        <div className="flex flex-wrap items-end justify-between gap-3">
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
          {/* Fora do ramo da lista de propósito: no vazio da S-D9 é onde ele
              mais faz falta — era o beco que a S-D36 nomeou. */}
          <Button onClick={() => setNovoOpen(true)} data-testid="novo-perfil">
            Novo perfil
          </Button>
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

        <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo perfil global</DialogTitle>
              <DialogDescription>
                O perfil nasce sem acesso nenhum — depois de criar, marque na matriz o que
                ele pode. Toda loja o herda como modelo.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void criar();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="novo-perfil-nome">Nome do perfil</Label>
                <Input
                  id="novo-perfil-nome"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Ex.: Costureira"
                  autoFocus
                />
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setNovoOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={!novoNome.trim() || createPerfil.isPending}>
                  {createPerfil.isPending ? "Criando…" : "Criar perfil"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </section>
    </AdminShell>
  );
}
