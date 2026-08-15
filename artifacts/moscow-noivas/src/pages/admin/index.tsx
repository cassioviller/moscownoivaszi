import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cnpjValido } from "@workspace/financeiro-core";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import {
  useListLojas,
  getListLojasQueryKey,
  useCreateLoja,
  useUpdateLoja,
  useListUsuarios,
  getListUsuariosQueryKey,
  useCreateUsuario,
  useUpdateUsuario,
  useGetConsolidado,
  getGetConsolidadoQueryKey,
  type Loja,
  type Usuario,
} from "@workspace/api-client-react";
import { brl } from "@/lib/formatos";
import { useAuth } from "@/hooks/use-auth";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Building2, Users, BarChart3 } from "lucide-react";
import { Erro } from "@/components/estado";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { mensagemApi } from "@/lib/erro-api";

const novaLojaSchema = z.object({
  nome: z.string().min(1, "Informe o nome da loja"),
});
type NovaLojaValues = z.infer<typeof novaLojaSchema>;

const novoUsuarioSchema = z.object({
  nome: z.string().min(1, "Informe o nome"),
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  isSuperAdmin: z.boolean(),
});
type NovoUsuarioValues = z.infer<typeof novoUsuarioSchema>;

const editarLojaSchema = z.object({
  nome: z.string().min(1, "Informe o nome da loja"),
  // E233: a mesma régua da porta — vazio passa, errado não.
  cnpj: z.string().refine((v) => !v.trim() || cnpjValido(v), {
    message: "Os dígitos verificadores deste CNPJ não fecham — confira o número.",
  }),
  endereco: z.string(),
  telefone: z.string(),
  ativo: z.boolean(),
});
type EditarLojaValues = z.infer<typeof editarLojaSchema>;

const editarUsuarioSchema = z.object({
  nome: z.string().min(1, "Informe o nome"),
  email: z.string().email("E-mail inválido"),
  senha: z
    .string()
    .refine((v) => v === "" || v.length >= 6, "Senha deve ter no mínimo 6 caracteres"),
  ativo: z.boolean(),
  isSuperAdmin: z.boolean(),
});
type EditarUsuarioValues = z.infer<typeof editarUsuarioSchema>;

/**
 * E76: a rede numa tela — uma linha por loja ativa com o essencial. A dona de
 * rede parava de navegar loja a loja para saber como o mês está indo.
 */
function ConsolidadoRede() {
  const consolidado = useGetConsolidado({
    query: { queryKey: getGetConsolidadoQueryKey() },
  });
  const linhas = consolidado.data ?? [];
  if (consolidado.isError || linhas.length < 2) return null;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-serif flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> A rede neste mês
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Uma linha por loja — funil, contratos, o que entrou e o que há em aberto.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b text-left text-xs text-muted-foreground">
                <TableHead className="py-2 pr-3 font-normal">Loja</TableHead>
                <TableHead className="py-2 px-3 font-normal text-right">Noivas no funil</TableHead>
                <TableHead className="py-2 px-3 font-normal text-right">Contratos ativos</TableHead>
                <TableHead className="py-2 px-3 font-normal text-right">Recebido no mês</TableHead>
                <TableHead className="py-2 pl-3 font-normal text-right">A receber (aberto)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.lojaId} className="border-b last:border-0">
                  <TableCell className="py-2.5 pr-3 font-medium">{l.nome}</TableCell>
                  <TableCell className="py-2.5 px-3 text-right tabular-nums">{l.leadsAtivos}</TableCell>
                  <TableCell className="py-2.5 px-3 text-right tabular-nums">{l.contratosAtivos}</TableCell>
                  <TableCell className="py-2.5 px-3 text-right tabular-nums text-positivo">
                    {brl(l.recebidoNoMes)}
                  </TableCell>
                  <TableCell className="py-2.5 pl-3 text-right tabular-nums">
                    {brl(l.aReceberAberto)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}

/** Console superadmin — rota top-level /admin, fora do escopo /loja/:lojaId. */
export default function AdminConsole() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

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
  const updateLoja = useUpdateLoja();
  const updateUsuario = useUpdateUsuario();

  const [lojaEmEdicao, setLojaEmEdicao] = useState<Loja | null>(null);
  const [usuarioEmEdicao, setUsuarioEmEdicao] = useState<Usuario | null>(null);
  // Desativar-se ou revogar o próprio superadmin trancaria a porta por dentro:
  // a tela não oferece, e o hint explica o porquê.
  const editandoASiMesmo = usuarioEmEdicao?.id === user?.id;

  const formLoja = useForm<NovaLojaValues>({
    resolver: zodResolver(novaLojaSchema),
    defaultValues: { nome: "" },
  });
  const formUsuario = useForm<NovoUsuarioValues>({
    resolver: zodResolver(novoUsuarioSchema),
    defaultValues: { nome: "", email: "", senha: "", isSuperAdmin: false },
  });
  const formEditarLoja = useForm<EditarLojaValues>({
    resolver: zodResolver(editarLojaSchema),
    defaultValues: { nome: "", cnpj: "", endereco: "", telefone: "", ativo: true },
  });
  const formEditarUsuario = useForm<EditarUsuarioValues>({
    resolver: zodResolver(editarUsuarioSchema),
    defaultValues: { nome: "", email: "", senha: "", ativo: true, isSuperAdmin: false },
  });

  const abrirEdicaoLoja = (loja: Loja) => {
    formEditarLoja.reset({
      nome: loja.nome,
      cnpj: loja.cnpj ?? "",
      endereco: loja.endereco ?? "",
      telefone: loja.telefone ?? "",
      ativo: loja.ativo,
    });
    setLojaEmEdicao(loja);
  };

  const abrirEdicaoUsuario = (usuario: Usuario) => {
    formEditarUsuario.reset({
      nome: usuario.nome,
      email: usuario.email,
      senha: "",
      ativo: usuario.ativo,
      isSuperAdmin: usuario.isSuperAdmin,
    });
    setUsuarioEmEdicao(usuario);
  };

  const onSalvarLoja = async (values: EditarLojaValues) => {
    if (!lojaEmEdicao) return;
    try {
      await updateLoja.mutateAsync({ lojaId: lojaEmEdicao.id, data: values });
      await queryClient.invalidateQueries({ queryKey: getListLojasQueryKey() });
      toast({ title: "Loja atualizada" });
      setLojaEmEdicao(null);
    } catch (err) {
      toast({
        title: "Não deu para salvar a loja",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const onSalvarUsuario = async (values: EditarUsuarioValues) => {
    if (!usuarioEmEdicao) return;
    try {
      const { senha, ...resto } = values;
      await updateUsuario.mutateAsync({
        usuarioId: usuarioEmEdicao.id,
        // Senha em branco = não mexer; preenchida entra como reset (e o
        // servidor cobra a troca na próxima entrada, E57).
        data: senha === "" ? resto : { ...resto, senha },
      });
      await queryClient.invalidateQueries({ queryKey: getListUsuariosQueryKey() });
      toast({
        title: "Usuário atualizado",
        description:
          senha !== "" ? "A pessoa deverá trocar a senha na próxima entrada." : undefined,
      });
      setUsuarioEmEdicao(null);
    } catch (err) {
      toast({
        title: "Não deu para salvar o usuário",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const onCriarLoja = async (values: NovaLojaValues) => {
    try {
      await createLoja.mutateAsync({ data: { nome: values.nome } });
      await queryClient.invalidateQueries({ queryKey: getListLojasQueryKey() });
      toast({ title: "Loja criada" });
      formLoja.reset();
    } catch (err) {
      toast({
        title: "Não deu para criar loja",
        description: mensagemApi(err, "Tente novamente."),
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
        title: "Não deu para cadastrar usuário",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  return (
    <AdminShell>
      {/* ── E76: a rede numa tela ── */}
      <ConsolidadoRede />

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
              <Erro
                titulo="Não deu para carregar as lojas"
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
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <span className="font-medium truncate">{loja.nome}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      {!loja.ativo && <Badge variant="secondary">inativa</Badge>}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => abrirEdicaoLoja(loja)}
                        data-testid={`editar-loja-${loja.id}`}
                      >
                        Editar
                      </Button>
                    </span>
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
              <Erro
                titulo="Não deu para carregar os usuários"
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
                      <span className="block text-xs text-muted-foreground">
                        {u.lojas.length > 0
                          ? u.lojas.map((l) => l.nome).join(", ")
                          : "Sem loja vinculada"}
                      </span>
                    </div>
                    <span className="flex items-center gap-2 shrink-0">
                      <Badge variant={u.ativo ? "outline" : "secondary"}>
                        {u.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => abrirEdicaoUsuario(u)}
                        data-testid={`editar-usuario-${u.id}`}
                      >
                        Editar
                      </Button>
                    </span>
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
        className="text-sm text-primary-texto underline underline-offset-4 w-fit"
      >
        Gerenciar perfis (modelos globais) →
      </Link>

      {/* ── Editar loja ── */}
      <Dialog
        open={lojaEmEdicao !== null}
        onOpenChange={(aberto) => !aberto && setLojaEmEdicao(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar loja</DialogTitle>
          </DialogHeader>
          <Form {...formEditarLoja}>
            <form
              onSubmit={formEditarLoja.handleSubmit(onSalvarLoja)}
              className="space-y-4"
            >
              <FormField
                control={formEditarLoja.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da loja</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={formEditarLoja.control}
                  name="cnpj"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CNPJ</FormLabel>
                      <FormControl>
                        <Input placeholder="00.000.000/0000-00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={formEditarLoja.control}
                  name="telefone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone</FormLabel>
                      <FormControl>
                        <Input placeholder="(11) 99999-9999" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={formEditarLoja.control}
                name="endereco"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={formEditarLoja.control}
                name="ativo"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div className="space-y-0.5 pr-4">
                      <FormLabel className="mb-0">Loja ativa</FormLabel>
                      <FormDescription>
                        Uma loja inativa some da seleção de lojas; ninguém entra nela.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLojaEmEdicao(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateLoja.isPending}>
                  {updateLoja.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Editar usuário ── */}
      <Dialog
        open={usuarioEmEdicao !== null}
        onOpenChange={(aberto) => !aberto && setUsuarioEmEdicao(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
          </DialogHeader>
          <Form {...formEditarUsuario}>
            <form
              onSubmit={formEditarUsuario.handleSubmit(onSalvarUsuario)}
              className="space-y-4"
            >
              <FormField
                control={formEditarUsuario.control}
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
                control={formEditarUsuario.control}
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
                control={formEditarUsuario.control}
                name="senha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nova senha (opcional)</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormDescription>
                      Em branco, a senha atual segue valendo. Preenchida, a pessoa
                      será obrigada a trocá-la na próxima entrada.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={formEditarUsuario.control}
                name="ativo"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div className="space-y-0.5 pr-4">
                      <FormLabel className="mb-0">Usuário ativo</FormLabel>
                      <FormDescription>
                        {editandoASiMesmo
                          ? "Você não pode desativar a si mesmo."
                          : "Inativo não entra no sistema."}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={editandoASiMesmo}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={formEditarUsuario.control}
                name="isSuperAdmin"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 rounded-md border p-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                        disabled={editandoASiMesmo}
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel className="mb-0 font-normal">
                        Superadmin da plataforma
                      </FormLabel>
                      {editandoASiMesmo && (
                        <FormDescription>
                          Você não pode revogar o próprio superadmin.
                        </FormDescription>
                      )}
                    </div>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setUsuarioEmEdicao(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateUsuario.isPending}>
                  {updateUsuario.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
