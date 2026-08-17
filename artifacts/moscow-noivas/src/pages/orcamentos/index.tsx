import { varianteStatusOrcamento } from "@/lib/status-badge";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useListOrcamentos,
  getListOrcamentosQueryKey,
  useCreateOrcamento,
  type ListOrcamentosParams,
} from "@workspace/api-client-react";
import { useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router";
import { useEscritaNaUrl } from "@/hooks/use-escrita-na-url";
import { comFiltros, paginaDaUrl } from "@/lib/filtro-url";
import { useBuscaNaUrl } from "@/hooks/use-busca-na-url";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ComboboxNoiva } from "@/components/combobox-noiva";
import { Plus, FileText, AlertCircle, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { brl, diaParaISO, statusOrcamentoLabel, instanteDia } from "@/lib/formatos";
import { podeNoModulo } from "@/lib/permissoes";
import { Vazio } from "@/components/estado";
import { mensagemApi } from "@/lib/erro-api";

const FILTROS: { chave: string; rotulo: string }[] = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "RASCUNHO", rotulo: "Rascunhos" },
  { chave: "ENVIADO", rotulo: "Enviados" },
  { chave: "APROVADO", rotulo: "Aprovados" },
  { chave: "RECUSADO", rotulo: "Recusados" },
];

const novoOrcamentoSchema = z.object({
  leadId: z.string().min(1, "Escolha a noiva"),
  validade: z.string().optional(),
  observacoes: z.string().optional(),
});

type NovoOrcamentoValues = z.infer<typeof novoOrcamentoSchema>;

const POR_PAGINA = 24;

/**
 * E124/D1 — desde o E115 renegociar É criar orçamento novo, então uma noiva
 * com 2-3 versões é o caso normal: busca por noiva, página e recentes-primeiro
 * no SERVIDOR (molde `noivas/index.tsx`), e o card mostra o VALOR — "o
 * orçamento de R$ 8 mil" se achava abrindo um por um.
 */
export default function Orcamentos() {
  const { activeLojaId, user, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // E129/D5: filtro, busca e página moram na URL — ida-e-volta preserva e o
  // link filtrado abre filtrado. Default fora da URL (`comFiltros`).
  const [searchParams, setSearchParams] = useEscritaNaUrl();
  const filtro = searchParams.get("filtro") ?? "todos";
  const pagina = paginaDaUrl(searchParams);
  const [busca, setBusca] = useBuscaNaUrl();
  const buscaAplicada = searchParams.get("q") ?? "";
  // Filtro novo recomeça da página 1 — página 3 de outro filtro não existe.
  const definirFiltro = (chave: string) =>
    setSearchParams((p) => comFiltros(p, { filtro: chave, pagina: null }, { filtro: "todos" }), {
      replace: true,
    });
  const definirPagina = (n: number) =>
    setSearchParams((p) => comFiltros(p, { pagina: n }, { pagina: "1" }), { replace: true });

  const params = useMemo<ListOrcamentosParams>(
    () => ({
      ...(buscaAplicada ? { q: buscaAplicada } : {}),
      ...(filtro !== "todos" ? { status: filtro as ListOrcamentosParams["status"] } : {}),
      pagina,
      porPagina: POR_PAGINA,
    }),
    [buscaAplicada, filtro, pagina],
  );
  const { data, isLoading, isError, refetch } = useListOrcamentos(activeLojaId!, params, {
    query: {
      queryKey: getListOrcamentosQueryKey(activeLojaId!, params),
      enabled: !!activeLojaId,
      // Trocar de página/filtro mantém a lista anterior na tela em vez de piscar.
      placeholderData: keepPreviousData,
    },
  });
  const createOrcamento = useCreateOrcamento();

  // E172: a proposta tem módulo próprio — ela vivia sob `leads`, e com isso a
  // ação que corrige o telefone de uma noiva era a que aprovava o orçamento
  // dela (`api-server/src/routes/orcamentos.ts:166`).
  const podeCriar = podeNoModulo(acessosModulos, "orcamentos", "criar");

  const filtrados = data?.itens;
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  // E63: o nome da noiva já vem embutido em cada orçamento — a lista completa
  // de leads só era baixada para rotular as linhas.
  const nomePorLead = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const o of filtrados ?? []) {
      if (o.lead?.noivaNome) mapa.set(o.leadId, o.lead.noivaNome);
    }
    return mapa;
  }, [filtrados]);

  const form = useForm<NovoOrcamentoValues>({
    resolver: zodResolver(novoOrcamentoSchema),
    defaultValues: { leadId: "", validade: "", observacoes: "" },
  });

  const onSubmit = async (values: NovoOrcamentoValues) => {
    try {
      const criado = await createOrcamento.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          leadId: values.leadId,
          validade: values.validade ? diaParaISO(values.validade) : undefined,
          observacoes: values.observacoes || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListOrcamentosQueryKey(activeLojaId!) });
      toast({ title: "Orçamento criado", description: "Adicione os itens." });
      form.reset();
      setOpen(false);
      navigate(`/loja/${activeLojaId}/orcamentos/${criado.id}`);
    } catch (err) {
      toast({
        title: "Não deu para criar orçamento",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* E126/E1: cabe por pouco a 390px — a quebra entra pelo padrão da
          classe, não por já ter estourado. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif">Orçamentos</h1>
          <p className="text-sm text-muted-foreground mt-1">As propostas da loja, do rascunho ao aceite.</p>
        </div>
        {podeCriar && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo orçamento
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar noiva…"
            aria-label="Buscar orçamento pelo nome da noiva"
            className="w-56 pl-9"
            data-testid="input-busca-orcamento"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <Button
              key={f.chave}
              variant={filtro === f.chave ? "default" : "outline"}
              size="sm"
              className="rounded-full"
              onClick={() => definirFiltro(f.chave)}
            >
              {f.rotulo}
            </Button>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo orçamento</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="leadId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Noiva *</FormLabel>
                    <FormControl>
                      <ComboboxNoiva
                        lojaId={activeLojaId!}
                        value={field.value || null}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="validade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validade</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="observacoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createOrcamento.isPending}>
                  {createOrcamento.isPending ? "Criando…" : "Criar e adicionar itens"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 gap-4">
        {isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Não deu para carregar os orçamentos</AlertTitle>
            <AlertDescription className="flex items-center gap-3">
              <span>Falha ao buscar os orçamentos.</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : isLoading ? (
          [1, 2, 3].map(i => <Card key={i} className="h-24 animate-pulse" />)
        ) : filtrados?.length === 0 ? (
          <Vazio
            titulo={
              buscaAplicada
                ? `Nenhum orçamento para “${buscaAplicada}”`
                : filtro === "todos"
                  ? "Nenhum orçamento ainda"
                  : `Nenhum orçamento ${statusOrcamentoLabel(filtro).toLowerCase()}`
            }
            descricao={
              buscaAplicada
                ? "A busca olha o nome da noiva, do noivo e o WhatsApp, em todos os anos da loja."
                : filtro === "todos"
                  ? "O orçamento é onde o valor da noiva é montado — e é dele que sai o contrato."
                  : "Há orçamentos na loja; nenhum neste status."
            }
            acao={
              buscaAplicada || filtro !== "todos" ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setBusca("");
                    definirFiltro("todos");
                  }}
                >
                  Limpar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          filtrados?.map(orcamento => (
            <Link key={orcamento.id} to={`/loja/${activeLojaId}/orcamentos/${orcamento.id}`}>
              <Card className="hover-elevate cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center text-secondary-foreground">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium">{nomePorLead.get(orcamento.leadId) ?? "Noiva"}</div>
                      <div className="text-sm text-muted-foreground">Criado em {instanteDia(orcamento.createdAt)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* D1: o valor no card — o servidor agrega o líquido pela
                        régua única (S-D5) em vez de mandar os itens inteiros. */}
                    {orcamento.valorTotal != null && (
                      <div className="font-semibold">{brl(orcamento.valorTotal)}</div>
                    )}
                    {/* E130/A1: "Recusado" era `outline` onde "Cancelado" é
                        `destructive` — a mesma notícia com duas caras. A
                        variante vem da tabela semântica. */}
                    <Badge variant={varianteStatusOrcamento(orcamento.status)}>
                      {statusOrcamentoLabel(orcamento.status)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>

      {!isError && !isLoading && totalPaginas > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {total} orçamento{total === 1 ? "" : "s"} · página {pagina} de {totalPaginas}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina <= 1}
              onClick={() => definirPagina(pagina - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= totalPaginas}
              onClick={() => definirPagina(pagina + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
