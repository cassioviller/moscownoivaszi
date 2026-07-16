import { useState } from "react";
import { Link } from "react-router";
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
  type MembroEquipe,
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
import { podeNoModulo } from "@/lib/permissoes";

const novoMembroSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  perfilId: z.string().min(1, "Selecione um perfil"),
});
type NovoMembroValues = z.infer<typeof novoMembroSchema>;

const editarMembroSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  perfilId: z.string().min(1, "Selecione um perfil"),
  ativo: z.boolean(),
});
type EditarMembroValues = z.infer<typeof editarMembroSchema>;

export default function Equipe() {
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [novoAberto, setNovoAberto] = useState(false);
  const [editando, setEditando] = useState<MembroEquipe | null>(null);
  const [removendo, setRemovendo] = useState<MembroEquipe | null>(null);

  // Gate flat por módulo (padrão do sidebar): sem mapa (superadmin) → liberado.
  const podeGerir = podeNoModulo(acessosModulos, "admin", "editar");

  const { data: equipe, isLoading: loadingEquipe } = useListEquipe(activeLojaId!, {
    query: { queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const { data: perfis, isLoading: loadingPerfis } = useListPerfis({
    query: { queryKey: getListPerfisQueryKey(), enabled: !!activeLojaId },
  });

  const addMembro = useAddMembroEquipe();
  const updateMembro = useUpdateMembroEquipe();
  const removeMembro = useRemoveMembroEquipe();

  const invalidarEquipe = () =>
    queryClient.invalidateQueries({ queryKey: getListEquipeQueryKey(activeLojaId!) });

  const formNovo = useForm<NovoMembroValues>({
    resolver: zodResolver(novoMembroSchema),
    defaultValues: { nome: "", email: "", senha: "", perfilId: "" },
  });

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
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo membro
          </Button>
        )}
      </div>

      {/* GAP Onda 2+: preview de comissão do mês por membro (orcamentos usava
          previewComissao) — sem endpoint no client gerado. */}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Membros da Equipe</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingEquipe ? (
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
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary">{membro.perfilNome}</Badge>
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
                      {Object.entries(perfil.acessosModulos)
                        .filter(([, v]) => v)
                        .map(([m]) => m)
                        .join(", ") || "sem acessos"}
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

      {/* Cadastrar membro */}
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
