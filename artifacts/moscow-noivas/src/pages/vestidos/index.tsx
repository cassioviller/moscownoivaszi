import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { podeNoModulo } from "@/lib/permissoes";
import {
  useListVestidos,
  getListVestidosQueryKey,
  useCreateVestido,
  useCheckDisponibilidadeVestidos,
  getCheckDisponibilidadeVestidosQueryKey,
  getGetVestidoFotoUrl,
} from "@workspace/api-client-react";
import type { Vestido, DisponibilidadeVestidosItensItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useSearchParams } from "@/lib/router-compat";
import { format } from "date-fns";
import { ptBR } from "react-day-picker/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, ClipboardPlus, Image as ImageIcon, CalendarIcon, X, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const novoVestidoSchema = z.object({
  codigo: z.string().min(1, { message: "Código é obrigatório" }),
  nome: z.string().min(1, { message: "Nome é obrigatório" }),
  precoBase: z.coerce.number({ invalid_type_error: "Informe um preço válido" }).nonnegative({ message: "Preço deve ser positivo" }),
  tamanho: z.string().optional(),
  cor: z.string().optional(),
  categoria: z.string().optional(),
  observacoes: z.string().optional(),
});

type NovoVestidoValues = z.infer<typeof novoVestidoSchema>;

/** Sentinela do item "Todos" nos Selects (Radix não aceita value=""). */
const TODOS = "__todos__";

/** Comparação case/acentos-insensitive para a busca. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Converte "YYYY-MM-DD" em Date local (new Date(string) cairia em UTC e erraria o dia). */
function parseDia(dia: string): Date {
  const [ano, mes, diaMes] = dia.split("-").map(Number);
  return new Date(ano, mes - 1, diaMes);
}

/** Ordem da foto de capa (menor `ordem`), ou null se o vestido não tem fotos. */
function ordemCapa(vestido: Vestido): number | null {
  if (!vestido.fotos || vestido.fotos.length === 0) return null;
  return vestido.fotos.reduce((min, f) => Math.min(min, f.ordem), vestido.fotos[0].ordem);
}

/** Badge do status cadastral do vestido — rótulo tratado, nunca o valor cru. */
function BadgeStatusVestido({ status }: { status: string }) {
  return status === "ativo" ? (
    <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm shadow-sm">Ativo</Badge>
  ) : (
    <Badge variant="outline" className="bg-background/80 backdrop-blur-sm shadow-sm">Inativo</Badge>
  );
}

/** Badge de disponibilidade para a data escolhida, com tooltip do motivo quando ocupado. */
function BadgeDisponibilidade({ item }: { item: DisponibilidadeVestidosItensItem }) {
  if (item.status === "DISPONIVEL") {
    return <Badge className="shadow-sm">Disponível</Badge>;
  }
  if (item.status === "INATIVO") {
    return <Badge variant="outline" className="bg-background/80 backdrop-blur-sm shadow-sm">Inativo</Badge>;
  }
  const badge =
    item.status === "MANUTENCAO" ? (
      <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm shadow-sm">Manutenção</Badge>
    ) : (
      <Badge variant="destructive" className="shadow-sm">Indisponível</Badge>
    );
  if (!item.motivo) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{badge}</span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-64">{item.motivo}</TooltipContent>
    </Tooltip>
  );
}

export default function Vestidos() {
  const { activeLojaId, acessosModulos } = useAuth();
  const podeCriar = podeNoModulo(acessosModulos, "vestidos", "criar");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const {
    data: vestidos,
    isLoading,
    isError,
    error,
    refetch,
  } = useListVestidos(activeLojaId!, { query: { queryKey: getListVestidosQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const createVestido = useCreateVestido();

  // Filtros client-side simples (busca + selects) — só a data vai para a URL.
  const [busca, setBusca] = useState("");
  const [tamanho, setTamanho] = useState(TODOS);
  const [cor, setCor] = useState(TODOS);
  const [categoria, setCategoria] = useState(TODOS);

  // Data do casamento na URL (?data=YYYY-MM-DD) para link compartilhável.
  const [searchParams, setSearchParams] = useSearchParams();
  const dataParam = searchParams.get("data");
  const dataSelecionada = dataParam && /^\d{4}-\d{2}-\d{2}$/.test(dataParam) ? dataParam : null;

  function definirData(proxima: string | null) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (proxima) params.set("data", proxima);
        else params.delete("data");
        return params;
      },
      { replace: true },
    );
  }

  const disponibilidade = useCheckDisponibilidadeVestidos(
    activeLojaId!,
    { data: dataSelecionada ?? "" },
    {
      query: {
        queryKey: getCheckDisponibilidadeVestidosQueryKey(activeLojaId!, { data: dataSelecionada ?? "" }),
        enabled: !!activeLojaId && !!dataSelecionada,
      },
    },
  );

  const dispPorVestido = useMemo(() => {
    const mapa = new Map<string, DisponibilidadeVestidosItensItem>();
    for (const item of disponibilidade.data?.itens ?? []) mapa.set(item.vestidoId, item);
    return mapa;
  }, [disponibilidade.data]);

  const opcoes = useMemo(() => {
    const derivar = (extrair: (v: Vestido) => string | null | undefined) =>
      [...new Set((vestidos ?? []).map(extrair).filter((valor): valor is string => !!valor))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      );
    return {
      tamanhos: derivar((v) => v.tamanho),
      cores: derivar((v) => v.cor),
      categorias: derivar((v) => v.categoria),
    };
  }, [vestidos]);

  const filtrados = useMemo(() => {
    const consulta = normalizar(busca.trim());
    return (vestidos ?? []).filter((v) => {
      if (consulta && !normalizar(v.nome).includes(consulta) && !normalizar(v.codigo).includes(consulta)) return false;
      if (tamanho !== TODOS && v.tamanho !== tamanho) return false;
      if (cor !== TODOS && v.cor !== cor) return false;
      if (categoria !== TODOS && v.categoria !== categoria) return false;
      return true;
    });
  }, [vestidos, busca, tamanho, cor, categoria]);

  const temFiltrosAtivos = busca.trim() !== "" || tamanho !== TODOS || cor !== TODOS || categoria !== TODOS || !!dataSelecionada;

  function limparFiltros() {
    setBusca("");
    setTamanho(TODOS);
    setCor(TODOS);
    setCategoria(TODOS);
    definirData(null);
  }

  function renderBadgeDoCard(vestido: Vestido) {
    if (!dataSelecionada) return <BadgeStatusVestido status={vestido.status} />;
    if (disponibilidade.isLoading) return <Skeleton className="h-5 w-24 rounded-full bg-background/80" />;
    const item = dispPorVestido.get(vestido.id);
    if (!item) return <BadgeStatusVestido status={vestido.status} />;
    return <BadgeDisponibilidade item={item} />;
  }

  const form = useForm<NovoVestidoValues>({
    resolver: zodResolver(novoVestidoSchema),
    defaultValues: {
      codigo: "",
      nome: "",
      precoBase: 0,
      tamanho: "",
      cor: "",
      categoria: "",
      observacoes: "",
    },
  });

  async function onSubmit(values: NovoVestidoValues) {
    try {
      await createVestido.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          codigo: values.codigo,
          nome: values.nome,
          precoBase: values.precoBase,
          tamanho: values.tamanho || undefined,
          cor: values.cor || undefined,
          categoria: values.categoria || undefined,
          observacoes: values.observacoes || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListVestidosQueryKey(activeLojaId!) });
      toast({ title: "Vestido cadastrado com sucesso" });
      form.reset();
      setOpen(false);
    } catch (err) {
      toast({
        title: "Erro ao cadastrar vestido",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif">Catálogo de Vestidos</h1>
        <div className="flex items-center gap-2">
          {/* Cadastro completo (com características do catálogo) na página dedicada;
              o dialog continua como atalho rápido. Link (role=link) não colide com o
              botão "Novo Vestido" (role=button) exercitado pelo E2E. */}
          {podeCriar && (
            <Button variant="outline" asChild>
              <Link href="/vestidos/novo">
                <ClipboardPlus className="h-4 w-4 mr-2" />
                Novo vestido (completo)
              </Link>
            </Button>
          )}
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) form.reset(); }}>
          {podeCriar && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Vestido
            </Button>
          )}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Vestido</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="codigo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código</FormLabel>
                        <FormControl>
                          <Input placeholder="VST-001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="precoBase"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preço Base</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0,00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome do vestido" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="tamanho"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tamanho</FormLabel>
                        <FormControl>
                          <Input placeholder="M" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor</FormLabel>
                        <FormControl>
                          <Input placeholder="Branco" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="categoria"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoria</FormLabel>
                        <FormControl>
                          <Input placeholder="Princesa" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="observacoes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Observações adicionais" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="w-full sm:w-64"
          placeholder="Buscar nome ou código…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Select value={tamanho} onValueChange={setTamanho}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Tamanho" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos</SelectItem>
            {opcoes.tamanhos.map((opcao) => (
              <SelectItem key={opcao} value={opcao}>{opcao}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={cor} onValueChange={setCor}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Cor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas</SelectItem>
            {opcoes.cores.map((opcao) => (
              <SelectItem key={opcao} value={opcao}>{opcao}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas</SelectItem>
            {opcoes.categorias.map((opcao) => (
              <SelectItem key={opcao} value={opcao}>{opcao}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dataSelecionada ? format(parseDia(dataSelecionada), "dd/MM/yyyy") : "Data do casamento"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                locale={ptBR}
                selected={dataSelecionada ? parseDia(dataSelecionada) : undefined}
                onSelect={(dia) => definirData(dia ? format(dia, "yyyy-MM-dd") : null)}
              />
            </PopoverContent>
          </Popover>
          {dataSelecionada && (
            <Button variant="ghost" size="icon" aria-label="Limpar data" onClick={() => definirData(null)}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="ml-auto text-sm text-muted-foreground whitespace-nowrap">
          {filtrados.length} de {vestidos?.length ?? 0} vestidos
        </div>
      </div>

      {dataSelecionada && disponibilidade.isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível verificar a disponibilidade</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>Os vestidos estão listados sem o status para a data selecionada.</span>
            <Button variant="outline" size="sm" onClick={() => disponibilidade.refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar os vestidos</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>{error instanceof Error ? error.message : "Falha inesperada ao buscar o catálogo."}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Card key={i} className="h-64 animate-pulse" />)}
        </div>
      ) : (vestidos?.length ?? 0) === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card border rounded-lg">
          Nenhum vestido cadastrado no catálogo.
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12 bg-card border rounded-lg space-y-3">
          <p className="text-muted-foreground">Nenhum vestido corresponde aos filtros.</p>
          {temFiltrosAtivos && (
            <Button variant="outline" size="sm" onClick={limparFiltros}>
              Limpar filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filtrados.map(vestido => {
            const capa = ordemCapa(vestido);
            return (
            <Link key={vestido.id} href={`/vestidos/${vestido.id}`}>
              <Card className="hover-elevate cursor-pointer overflow-hidden group">
                <div className="aspect-[3/4] bg-muted flex items-center justify-center relative">
                  {capa !== null ? (
                    <img
                      src={getGetVestidoFotoUrl(activeLojaId!, vestido.id, capa)}
                      alt={vestido.nome}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-10 w-10 text-muted-foreground opacity-50" />
                  )}
                  <div className="absolute top-2 right-2">
                    {renderBadgeDoCard(vestido)}
                  </div>
                </div>
                <CardContent className="p-4">
                  <div className="font-mono text-xs text-muted-foreground mb-1">{vestido.codigo}</div>
                  <h3 className="font-medium truncate">{vestido.nome}</h3>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="font-semibold text-primary">R$ {vestido.precoBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span className="text-muted-foreground">Tam: {vestido.tamanho || '-'}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
