import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  useListEquipe,
  getListEquipeQueryKey,
  useListPerfis,
  getListPerfisQueryKey,
  useAddMembroEquipe,
  useUpdateMembroEquipe,
  useRemoveMembroEquipe,
  useListConvitesEquipe,
  getListConvitesEquipeQueryKey,
  useCreateConviteEquipe,
  useReenviarConviteEquipe,
  useCancelarConviteEquipe,
  type MembroEquipe,
  type Convite,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Erro } from "@/components/estado";
import { podeNoModulo, resumoAcessos } from "@/lib/permissoes";
import { AtividadeEquipe } from "./atividade";
import { CACHE_ESTAVEL } from "@/lib/cache";

const novoMembroSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  perfilId: z.string().min(1, "Selecione um perfil"),
});
type NovoMembroValues = z.infer<typeof novoMembroSchema>;

const conviteSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  perfilId: z.string().min(1, "Selecione um perfil"),
});
type ConviteValues = z.infer<typeof conviteSchema>;

/** O link que a convidada abre — token no path do FRONT (SPA, não vaza em log). */
const linkDoConvite = (token: string) => `${window.location.origin}/convite/${token}`;

const ERROS_CONVITE: Record<string, string> = {
  CONVIDADO_JA_E_MEMBRO: "Este e-mail já é da equipe desta loja.",
  CONVITE_PENDENTE: "Já existe convite pendente para este e-mail — reenvie ou cancele o existente.",
};

const editarMembroSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  perfilId: z.string().min(1, "Selecione um perfil"),
  ativo: z.boolean(),
});
type EditarMembroValues = z.infer<typeof editarMembroSchema>;

export default function Equipe() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [novoAberto, setNovoAberto] = useState(false);
  const [convidandoAberto, setConvidandoAberto] = useState(false);
  // Token do convite recém-criado: o diálogo troca do form para o link copiável.
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [editando, setEditando] = useState<MembroEquipe | null>(null);
  const [removendo, setRemovendo] = useState<MembroEquipe | null>(null);

  // Gate flat por módulo (padrão do sidebar): sem mapa (superadmin) → liberado.
  const podeGerir = podeNoModulo(acessosModulos, "admin", "editar");

  const {
    data: equipe,
    isLoading: loadingEquipe,
    isError: erroEquipe,
    error: errEquipe,
    refetch: refetchEquipe,
  } = useListEquipe(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const { data: perfis, isLoading: loadingPerfis } = useListPerfis({
    query: { ...CACHE_ESTAVEL, queryKey: getListPerfisQueryKey(), enabled: !!activeLojaId },
  });

  // F43: os perfis já vêm para o seletor — a linha do membro passa a ler deles
  // o que a pessoa alcança, sem nenhuma consulta a mais.
  const acessosDoPerfil = useMemo(
    () => new Map((perfis ?? []).map((p) => [p.id, p.acessosModulos])),
    [perfis],
  );

  const addMembro = useAddMembroEquipe();
  const updateMembro = useUpdateMembroEquipe();
  const removeMembro = useRemoveMembroEquipe();

  // Convites pendentes — só o admin vê (a query nem roda sem o gate).
  const convites = useListConvitesEquipe(activeLojaId!, {
    query: {
      queryKey: getListConvitesEquipeQueryKey(activeLojaId!),
      enabled: !!activeLojaId && podeGerir,
    },
  });
  const criarConvite = useCreateConviteEquipe();
  const reenviarConvite = useReenviarConviteEquipe();
  const cancelarConvite = useCancelarConviteEquipe();

  const invalidarEquipe = () =>
    queryClient.invalidateQueries({ queryKey: getListEquipeQueryKey(activeLojaId!) });
  const invalidarConvites = () =>
    queryClient.invalidateQueries({ queryKey: getListConvitesEquipeQueryKey(activeLojaId!) });

  const formNovo = useForm<NovoMembroValues>({
    resolver: zodResolver(novoMembroSchema),
    defaultValues: { nome: "", email: "", senha: "", perfilId: "" },
  });

  const formConvite = useForm<ConviteValues>({
    resolver: zodResolver(conviteSchema),
    defaultValues: { nome: "", email: "", perfilId: "" },
  });

  async function copiarLink(token: string) {
    try {
      await navigator.clipboard.writeText(linkDoConvite(token));
      toast({ title: "Link copiado", description: "Cole no WhatsApp da convidada." });
    } catch {
      // Clipboard bloqueado (permissão/contexto): o link visível no diálogo
      // continua selecionável à mão.
      toast({ title: "Não deu para copiar automaticamente", description: "Selecione o link e copie.", variant: "destructive" });
    }
  }

  const onConvidar = async (values: ConviteValues) => {
    try {
      const criado = await criarConvite.mutateAsync({ lojaId: activeLojaId!, data: values });
      await invalidarConvites();
      formConvite.reset();
      setLinkGerado(criado.token);
    } catch (err) {
      const e = err as { data?: { error?: string } };
      toast({
        title: "Erro ao criar o convite",
        description:
          ERROS_CONVITE[e?.data?.error ?? ""] ?? (err instanceof Error ? err.message : "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const onReenviar = async (convite: Convite) => {
    try {
      const renovado = await reenviarConvite.mutateAsync({
        lojaId: activeLojaId!,
        conviteId: convite.id,
      });
      await invalidarConvites();
      await copiarLink(renovado.token);
    } catch (err) {
      toast({
        title: "Erro ao reenviar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const onCancelarConvite = async (convite: Convite) => {
    try {
      await cancelarConvite.mutateAsync({ lojaId: activeLojaId!, conviteId: convite.id });
      await invalidarConvites();
      toast({ title: "Convite cancelado", description: "O link deixou de valer." });
    } catch (err) {
      toast({
        title: "Erro ao cancelar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const formEditar = useForm<EditarMembroValues>({
    resolver: zodResolver(editarMembroSchema),
    defaultValues: { nome: "", perfilId: "", ativo: true },
  });

  const onCadastrar = async (values: NovoMembroValues) => {
    try {
      await addMembro.mutateAsync({ lojaId: activeLojaId!, data: values });
      await invalidarEquipe();
      toast({ title: "Membro cadastrado" });
      formNovo.reset();
      setNovoAberto(false);
    } catch (err) {
      toast({
        title: "Erro ao cadastrar membro",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const abrirEdicao = (membro: MembroEquipe) => {
    formEditar.reset({
      nome: membro.nome,
      perfilId: membro.perfilId,
      ativo: membro.ativo !== false,
    });
    setEditando(membro);
  };

  const onEditar = async (values: EditarMembroValues) => {
    if (!editando) return;
    try {
      await updateMembro.mutateAsync({
        lojaId: activeLojaId!,
        usuarioId: editando.usuarioId,
        data: values,
      });
      await invalidarEquipe();
      toast({ title: "Membro atualizado" });
      setEditando(null);
    } catch (err) {
      toast({
        title: "Erro ao atualizar membro",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const onRemover = async () => {
    if (!removendo) return;
    try {
      await removeMembro.mutateAsync({
        lojaId: activeLojaId!,
        usuarioId: removendo.usuarioId,
      });
      await invalidarEquipe();
      toast({ title: "Membro removido" });
      setRemovendo(null);
    } catch (err) {
      toast({
        title: "Erro ao remover membro",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const seletorPerfil = (
    field: { value: string; onChange: (v: string) => void },
  ) => (
    <Select value={field.value} onValueChange={field.onChange}>
      <FormControl>
        <SelectTrigger>
          <SelectValue placeholder={loadingPerfis ? "Carregando…" : "Selecione o perfil"} />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {perfis?.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif">Equipe</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vendedoras e demais membros vinculados a esta loja.
          </p>
        </div>
        {podeGerir && (
          <div className="flex flex-wrap gap-2">
            {/* Caminho primário: a própria pessoa define a senha. O cadastro
                com senha digitada continua como secundário na transição. */}
            <Button onClick={() => setConvidandoAberto(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Convidar por link
            </Button>
            <Button variant="outline" onClick={() => setNovoAberto(true)}>
              Cadastrar com senha
            </Button>
          </div>
        )}
      </div>

      {/* — Convites pendentes — só existe quando há algum. */}
      {podeGerir && (convites.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Convites pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {convites.data?.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 border rounded-md"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.nome}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {c.email} · {c.perfilNome ?? c.perfilId} · expira{" "}
                      {new Date(c.expiraEm).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => copiarLink(c.token)}>
                      Copiar link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={reenviarConvite.isPending}
                      onClick={() => onReenviar(c)}
                    >
                      Reenviar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={cancelarConvite.isPending}
                      onClick={() => onCancelarConvite(c)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* GAP Onda 2+: preview de comissão do mês por membro (orcamentos usava
          previewComissao) — sem endpoint no client gerado. */}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Membros da Equipe</CardTitle>
          </CardHeader>
          <CardContent>
            {erroEquipe ? (
              <Erro
                titulo="Erro ao carregar a equipe"
                erro={errEquipe}
                onTentarNovamente={() => refetchEquipe()}
              />
            ) : loadingEquipe ? (
              <div className="animate-pulse space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-12 bg-muted rounded-md" />
                ))}
              </div>
            ) : equipe?.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum membro cadastrado ainda.
                {podeGerir && " Cadastre a primeira vendedora em “Novo membro”."}
              </p>
            ) : (
              <ul className="space-y-4">
                {equipe?.map((membro) => (
                  <li
                    key={membro.usuarioId}
                    className="flex justify-between items-center gap-3 p-3 border rounded-md"
                  >
                    <div className="min-w-0">
                      <div className="font-medium flex items-center gap-2">
                        <span className="truncate">{membro.nome}</span>
                        {membro.ativo === false && (
                          <Badge variant="outline">Inativo</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {membro.email}
                      </div>
                      {/* F43: o nome do perfil não diz o que a pessoa ALCANÇA —
                          "Vendedora" e "Recepção" são rótulos, e quem precisa
                          conferir um acesso tinha de abrir /permissoes e cruzar
                          na cabeça. A frase já existia (`resumoAcessos`, E24) e
                          só era usada na lista de perfis, ao lado. */}
                      {acessosDoPerfil.get(membro.perfilId) !== undefined && (
                        <div className="text-xs text-muted-foreground truncate">
                          {resumoAcessos(acessosDoPerfil.get(membro.perfilId)!)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {podeGerir ? (
                        <Button asChild variant="ghost" size="sm" className="h-auto py-1">
                          <Link
                            to={`/loja/${lojaId}/permissoes`}
                            aria-label={`Ver o que o perfil ${membro.perfilNome} libera`}
                          >
                            <Badge variant="secondary">{membro.perfilNome}</Badge>
                          </Link>
                        </Button>
                      ) : (
                        <Badge variant="secondary">{membro.perfilNome}</Badge>
                      )}
                      {podeGerir && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar ${membro.nome}`}
                            onClick={() => abrirEdicao(membro)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remover ${membro.nome}`}
                            onClick={() => setRemovendo(membro)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Perfis de Acesso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingPerfis ? (
              <div className="animate-pulse space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-12 bg-muted rounded-md" />
                ))}
              </div>
            ) : perfis?.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum perfil encontrado.</p>
            ) : (
              <ul className="space-y-3">
                {perfis?.map((perfil) => (
                  <li key={perfil.id} className="border-b pb-2">
                    <span className="font-medium block">{perfil.nome}</span>
                    <span className="text-xs text-muted-foreground block truncate">
                      {resumoAcessos(perfil.acessosModulos)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {podeGerir && activeLojaId && (
              <Link
                to={`/loja/${activeLojaId}/permissoes`}
                className="text-sm text-primary underline underline-offset-4 block"
              >
                Gerenciar permissões desta loja →
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Log de atividade (E18): últimos acessos + ações sensíveis. */}
      <AtividadeEquipe />

      {/* Cadastrar membro */}
      {/* Convidar por link: o form vira o link copiável após criar. */}
      <Dialog
        open={convidandoAberto}
        onOpenChange={(aberto) => {
          setConvidandoAberto(aberto);
          if (!aberto) {
            setLinkGerado(null);
            formConvite.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{linkGerado ? "Convite criado" : "Convidar por link"}</DialogTitle>
          </DialogHeader>
          {linkGerado ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Mande este link para a convidada (WhatsApp serve). Ela define a
                própria senha ao aceitar. Vale por 7 dias, uso único.
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly value={linkDoConvite(linkGerado)} onFocus={(e) => e.target.select()} />
                <Button type="button" onClick={() => copiarLink(linkGerado)}>
                  Copiar
                </Button>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setConvidandoAberto(false);
                    setLinkGerado(null);
                  }}
                >
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <Form {...formConvite}>
              <form onSubmit={formConvite.handleSubmit(onConvidar)} className="space-y-4">
                <FormField
                  control={formConvite.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={formConvite.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail *</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={formConvite.control}
                  name="perfilId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Perfil *</FormLabel>
                      {seletorPerfil(field)}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setConvidandoAberto(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={criarConvite.isPending}>
                    {criarConvite.isPending ? "Criando…" : "Gerar link"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo membro</DialogTitle>
          </DialogHeader>
          <Form {...formNovo}>
            <form onSubmit={formNovo.handleSubmit(onCadastrar)} className="space-y-4">
              <FormField
                control={formNovo.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input autoComplete="name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={formNovo.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail *</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={formNovo.control}
                name="senha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha inicial (mín. 6 caracteres) *</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={formNovo.control}
                name="perfilId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Perfil *</FormLabel>
                    {seletorPerfil(field)}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setNovoAberto(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={addMembro.isPending}>
                  {addMembro.isPending ? "Cadastrando…" : "Cadastrar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Editar membro */}
      <Dialog open={!!editando} onOpenChange={(aberto) => !aberto && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar membro</DialogTitle>
          </DialogHeader>
          <Form {...formEditar}>
            <form onSubmit={formEditar.handleSubmit(onEditar)} className="space-y-4">
              <FormField
                control={formEditar.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={formEditar.control}
                name="perfilId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Perfil *</FormLabel>
                    {seletorPerfil(field)}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={formEditar.control}
                name="ativo"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <FormLabel className="mb-0">Ativo</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditando(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateMembro.isPending}>
                  {updateMembro.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Remover membro */}
      <AlertDialog open={!!removendo} onOpenChange={(aberto) => !aberto && setRemovendo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
            <AlertDialogDescription>
              {removendo?.nome} perderá o vínculo com esta loja. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onRemover} disabled={removeMembro.isPending}>
              {removeMembro.isPending ? "Removendo…" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
