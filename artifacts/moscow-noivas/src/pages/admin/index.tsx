import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import {
  useListLojas,
  getListLojasQueryKey,
  useCreateLoja,
  useListUsuarios,
  getListUsuariosQueryKey,
  useCreateUsuario,
} from "@workspace/api-client-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Building2, Users } from "lucide-react";
import { EstadoErro } from "@/components/estado-erro";

const novaLojaSchema = z.object({
  nome: z.string().min(1, "Nome da loja é obrigatório"),
});
type NovaLojaValues = z.infer<typeof novaLojaSchema>;

const novoUsuarioSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  isSuperAdmin: z.boolean(),
});
type NovoUsuarioValues = z.infer<typeof novoUsuarioSchema>;

/** Console superadmin — rota top-level /admin, fora do escopo /loja/:lojaId. */
export default function AdminConsole() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: lojas,
    isLoading: loadingLojas,
    isError: erroLojas,
    error: errLojas,
    refetch: refetchLojas,
  } = useListLojas({
    query: { queryKey: getListLojasQueryKey() },
  });
  const {
    data: usuarios,
    isLoading: loadingUsuarios,
    isError: erroUsuarios,
    error: errUsuarios,
    refetch: refetchUsuarios,
  } = useListUsuarios({
    query: { queryKey: getListUsuariosQueryKey() },
  });

  const createLoja = useCreateLoja();
  const createUsuario = useCreateUsuario();

  const formLoja = useForm<NovaLojaValues>({
    resolver: zodResolver(novaLojaSchema),
    defaultValues: { nome: "" },
  });
  const formUsuario = useForm<NovoUsuarioValues>({
    resolver: zodResolver(novoUsuarioSchema),
    defaultValues: { nome: "", email: "", senha: "", isSuperAdmin: false },
  });

  const onCriarLoja = async (values: NovaLojaValues) => {
    try {
      await createLoja.mutateAsync({ data: { nome: values.nome } });
      await queryClient.invalidateQueries({ queryKey: getListLojasQueryKey() });
      toast({ title: "Loja criada" });
      formLoja.reset();
    } catch (err) {
      toast({
        title: "Erro ao criar loja",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const onCriarUsuario = async (values: NovoUsuarioValues) => {
    try {
      await createUsuario.mutateAsync({ data: values });
      await queryClient.invalidateQueries({ queryKey: getListUsuariosQueryKey() });
      toast({ title: "Usuário cadastrado" });
      formUsuario.reset();
    } catch (err) {
      toast({
        title: "Erro ao cadastrar usuário",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <AdminShell>
      {/* ── Lojas ── */}
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-serif flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Lojas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lojas ? `${lojas.length} ${lojas.length === 1 ? "loja" : "lojas"} no sistema.` : "Lojas do sistema."}
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-6">
            {erroLojas ? (
              <EstadoErro
                titulo="Erro ao carregar as lojas"
                erro={errLojas}
                onTentarNovamente={() => refetchLojas()}
              />
            ) : loadingLojas ? (
              <div className="animate-pulse space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-10 bg-muted rounded-md" />
                ))}
              </div>
            ) : lojas?.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma loja cadastrada.</p>
            ) : (
              <ul className="divide-y border rounded-md">
                {lojas?.map((loja) => (
                  <li
                    key={loja.id}
                    className="flex items-center justify-between px-4 py-3 text-sm"
                  >
                    <span className="font-medium">{loja.nome}</span>
                    {!loja.ativo && <Badge variant="secondary">inativa</Badge>}
                  </li>
                ))}
              </ul>
            )}

            <Form {...formLoja}>
              <form
                onSubmit={formLoja.handleSubmit(onCriarLoja)}
                className="flex items-end gap-3"
              >
                <FormField
                  control={formLoja.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Nome da loja</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex.: Moscow Noivas — Filial Centro"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" variant="outline" disabled={createLoja.isPending}>
                  {createLoja.isPending ? "Criando…" : "Criar loja"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </section>

      {/* ── Usuários / Admins ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-serif flex items-center gap-2">
            <Users className="h-5 w-5" /> Usuários
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Usuários da plataforma. O vínculo com lojas e perfis é feito na Equipe de
            cada loja.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-6">
            {erroUsuarios ? (
              <EstadoErro
                titulo="Erro ao carregar os usuários"
                erro={errUsuarios}
                onTentarNovamente={() => refetchUsuarios()}
              />
            ) : loadingUsuarios ? (
              <div className="animate-pulse space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-10 bg-muted rounded-md" />
                ))}
              </div>
            ) : usuarios?.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum usuário cadastrado.</p>
            ) : (
              <ul className="divide-y border rounded-md">
                {usuarios?.map((u) => (
                  <li key={u.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <span className="truncate">{u.nome}</span>
                        {u.isSuperAdmin && <Badge className="text-[10px]">Superadmin</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                      {/* GAP Onda 2+: lojas vinculadas do usuário — listUsuarios
                          devolve apenas o Usuario, sem os vínculos por loja que a
                          tela do orcamentos exibia ("Loja A, Loja B" / "sem loja"). */}
                    </div>
                    <Badge variant={u.ativo ? "outline" : "secondary"}>
                      {u.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}

            <Form {...formUsuario}>
              <form
                onSubmit={formUsuario.handleSubmit(onCriarUsuario)}
                className="space-y-4 max-w-md"
              >
                <FormField
                  control={formUsuario.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input autoComplete="name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={formUsuario.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={formUsuario.control}
                  name="senha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Senha inicial (mín. 6 caracteres)</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={formUsuario.control}
                  name="isSuperAdmin"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 rounded-md border p-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(v) => field.onChange(v === true)}
                        />
                      </FormControl>
                      <FormLabel className="mb-0 font-normal">
                        Superadmin da plataforma
                      </FormLabel>
                    </FormItem>
                  )}
                />

                {/* GAP-ENDPOINT Onda 2+: criação composta "admin + vínculos de loja"
                    do orcamentos (fieldset "Lojas deste admin"). O UsuarioInput do
                    client gerado aceita apenas nome/email/senha/isSuperAdmin — sem
                    lojaIds. O vínculo hoje é feito por loja em Equipe
                    (/loja/:lojaId/equipe). */}

                <Button type="submit" disabled={createUsuario.isPending}>
                  {createUsuario.isPending ? "Cadastrando…" : "Cadastrar usuário"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </section>

      <Link
        to="/admin/perfis"
        className="text-sm text-primary underline underline-offset-4 w-fit"
      >
        Gerenciar perfis (modelos globais) →
      </Link>
    </AdminShell>
  );
}
