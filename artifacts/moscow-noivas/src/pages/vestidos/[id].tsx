import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetVestido,
  getGetVestidoQueryKey,
  useListBloqueios,
  getListBloqueiosQueryKey,
  useCreateBloqueio,
  useListAtributos,
  getListAtributosQueryKey,
  useCheckDisponibilidadeVestidos,
  getCheckDisponibilidadeVestidosQueryKey,
  useGetProximaJanelaVestido,
  getGetProximaJanelaVestidoQueryKey,
  getGetVestidoFotoUrl,
} from "@workspace/api-client-react";
import type { Atributo, BloqueioVestido, VestidoAtributo } from "@workspace/api-client-react";
import { Link, useParams } from "react-router";
import { format, parseISO } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, Image as ImageIcon, Pencil } from "lucide-react";
import { podeNoModulo } from "@/lib/permissoes";
import { brl, dataDia } from "@/lib/formatos";
import { mensagemApi } from "@/lib/erro-api";

/** Rotula as seleções do vestido com nome do atributo e valor da opção (linguagem legível). */
function rotularSelecoes(
  catalogo: Atributo[],
  selecoes: VestidoAtributo[],
): { nome: string; valor: string }[] {
  const rotulos: { nome: string; valor: string }[] = [];
  for (const sel of selecoes) {
    const atributo = catalogo.find((a) => a.id === sel.atributoId);
    const opcao = atributo?.opcoes?.find((o) => o.id === sel.opcaoId);
    if (atributo && opcao) rotulos.push({ nome: atributo.nome, valor: opcao.valor });
  }
  return rotulos;
}

/**
 * Período exibido de um bloqueio.
 *
 * E45: usa o envelope físico materializado (ocupacao_inicio/fim), que o schema
 * já expõe — inclui as janelas de prova/lavagem que a derivação subestimava, e
 * é o MESMO que a tela de reserva mostra (fim a divergência). Cai na derivação
 * só quando o envelope não veio (bloqueio antigo sem materialização).
 */
function periodoDoBloqueio(b: BloqueioVestido): { inicio: Date | null; fim: Date | null; rotuloFimAberto: string | null } {
  if (b.ocupacaoInicio) {
    return {
      inicio: parseISO(b.ocupacaoInicio),
      fim: b.ocupacaoFim ? parseISO(b.ocupacaoFim) : null,
      rotuloFimAberto: b.ocupacaoFim ? null : b.tipo === "MANUTENCAO" ? "sem prazo definido" : "até devolução",
    };
  }
  if (b.tipo === "MANUTENCAO") {
    return {
      inicio: b.inicio ? parseISO(b.inicio) : null,
      fim: b.fim ? parseISO(b.fim) : null,
      rotuloFimAberto: b.fim ? null : "sem prazo definido",
    };
  }
  const inicio = b.retiradaDataReal ?? b.casamentoData ?? null;
  // Retirado e ainda não devolvido → janela aberta ("até devolução").
  const fim = b.devolucaoDataReal ?? (b.retiradaDataReal ? null : b.casamentoData ?? null);
  return {
    inicio: inicio ? parseISO(inicio) : null,
    fim: fim ? parseISO(fim) : null,
    rotuloFimAberto: fim ? null : "até devolução",
  };
}

function textoPeriodo(b: BloqueioVestido): string {
  const { inicio, fim, rotuloFimAberto } = periodoDoBloqueio(b);
  if (!inicio) return rotuloFimAberto ?? "sem prazo definido";
  if (!fim) return `${format(inicio, "dd/MM")} – ${rotuloFimAberto}`;
  if (format(inicio, "yyyy-MM-dd") === format(fim, "yyyy-MM-dd")) return format(inicio, "dd/MM/yyyy");
  return `${format(inicio, "dd/MM")} – ${format(fim, "dd/MM")}`;
}

/** Bloqueio ainda relevante: janela aberta ou com fim de hoje em diante. */
function bloqueioFuturoOuAberto(b: BloqueioVestido, hoje: Date): boolean {
  const { fim } = periodoDoBloqueio(b);
  if (!fim) return true;
  const fimDia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
  return fimDia.getTime() >= hoje.getTime();
}

export default function VestidoDetail() {
  const { activeLojaId, acessosModulos } = useAuth();
  const { lojaId, id } = useParams();
  const podeEditar = podeNoModulo(acessosModulos, "vestidos", "editar");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Manutenção (E43): o motor de janelas, o POST /bloqueios e o selo já existiam;
  // só faltava a tela criar o bloqueio. Início obrigatório, fim opcional (= sem
  // prazo). O dia vai ao meio-dia -03:00 para o fuso da loja não puxar a data.
  const [manutInicio, setManutInicio] = useState("");
  const [manutFim, setManutFim] = useState("");
  const createBloqueio = useCreateBloqueio();

  async function marcarManutencao() {
    if (!manutInicio) {
      toast({ title: "Informe o início da manutenção", variant: "destructive" });
      return;
    }
    if (manutFim && manutFim < manutInicio) {
      toast({ title: "O fim não pode ser antes do início", variant: "destructive" });
      return;
    }
    try {
      await createBloqueio.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          vestidoId: id!,
          tipo: "MANUTENCAO",
          inicio: `${manutInicio}T12:00:00-03:00`,
          ...(manutFim ? { fim: `${manutFim}T12:00:00-03:00` } : {}),
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListBloqueiosQueryKey(activeLojaId!) }),
        queryClient.invalidateQueries({ queryKey: getCheckDisponibilidadeVestidosQueryKey(activeLojaId!, { data: hoje }) }),
      ]);
      setManutInicio("");
      setManutFim("");
      toast({ title: "Vestido marcado em manutenção" });
    } catch (err) {
      toast({
        title: "Erro ao marcar manutenção",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  const {
    data: vestido,
    isLoading,
    isError: vestidoErro,
    error: vestidoErroDetalhe,
    refetch: recarregarVestido,
  } = useGetVestido(activeLojaId!, id!, {
    query: { queryKey: getGetVestidoQueryKey(activeLojaId!, id!), enabled: !!activeLojaId && !!id }
  });

  // E45: só os bloqueios DESTE vestido, com a noiva embutida (lead do join) —
  // antes baixava a loja inteira e cruzava com todos os leads no cliente.
  const bloqueiosQuery = useListBloqueios(activeLojaId!, { vestidoId: id }, {
    query: { queryKey: getListBloqueiosQueryKey(activeLojaId!, { vestidoId: id }), enabled: !!activeLojaId && !!id },
  });

  // Catálogo de atributos para rotular as características do vestido.
  const catalogoQuery = useListAtributos(activeLojaId!, {
    query: { queryKey: getListAtributosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  // "Estado atual" do vestido: consulta batch de disponibilidade com a data de
  // hoje (new Date() aqui é aceitável — é UI de estado presente).
  const hoje = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const disponibilidadeHoje = useCheckDisponibilidadeVestidos(
    activeLojaId!,
    { data: hoje },
    {
      query: {
        queryKey: getCheckDisponibilidadeVestidosQueryKey(activeLojaId!, { data: hoje }),
        enabled: !!activeLojaId && !!id,
      },
    },
  );
  const itemHoje = disponibilidadeHoje.data?.itens.find((item) => item.vestidoId === id);

  // E9: a próxima data de casamento que uma reserva nova aceitaria — calculada
  // no backend com a régua real (prova+uso+lavagem), não pelo helper aproximado.
  const proximaJanela = useGetProximaJanelaVestido(activeLojaId!, id!, {
    query: {
      queryKey: getGetProximaJanelaVestidoQueryKey(activeLojaId!, id!),
      enabled: !!activeLojaId && !!id,
    },
  });

  const proximosBloqueios = useMemo(() => {
    const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    return (bloqueiosQuery.data ?? [])
      .filter((b) => b.vestidoId === id && b.canceladoEm == null && bloqueioFuturoOuAberto(b, inicioHoje))
      .sort((a, b) => {
        const inicioA = periodoDoBloqueio(a).inicio?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const inicioB = periodoDoBloqueio(b).inicio?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return inicioA - inicioB;
      });
  }, [bloqueiosQuery.data, id]);

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg"></div>;

  if (vestidoErro) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erro ao carregar o vestido</AlertTitle>
        <AlertDescription className="flex items-center gap-3">
          <span>{vestidoErroDetalhe instanceof Error ? vestidoErroDetalhe.message : "Falha inesperada ao buscar o vestido."}</span>
          <Button variant="outline" size="sm" onClick={() => recarregarVestido()}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!vestido) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Vestido não encontrado — pode ter saído do acervo, ou o link veio errado.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/loja/${lojaId}/vestidos`}>Voltar ao acervo</Link>
        </Button>
      </div>
    );
  }

  // Características do acervo (atributos do catálogo) em linguagem legível.
  const caracteristicas = rotularSelecoes(catalogoQuery.data ?? [], vestido.atributos ?? []);
  const reservasFuturas = proximosBloqueios.filter((b) => b.tipo === "RESERVA_CASAMENTO");
  const editarHref = `/loja/${lojaId}/vestidos/${id}/editar`;

  function renderBadgeHoje() {
    if (disponibilidadeHoje.isLoading) return <Skeleton className="h-6 w-28 rounded-full" />;
    if (!itemHoje || itemHoje.status === "INATIVO") return null;
    if (itemHoje.status === "DISPONIVEL") {
      return <Badge className="text-sm px-3 py-1">Disponível hoje</Badge>;
    }
    const badge =
      itemHoje.status === "MANUTENCAO" ? (
        <Badge variant="secondary" className="text-sm px-3 py-1">Em manutenção</Badge>
      ) : (
        <Badge variant="destructive" className="text-sm px-3 py-1">Indisponível hoje</Badge>
      );
    if (!itemHoje.motivo) return badge;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{badge}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-64">{itemHoje.motivo}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-muted-foreground">{vestido.codigo}</div>
          <h1 className="text-3xl font-serif">{vestido.nome}</h1>
        </div>
        <div className="flex items-center gap-2">
          {renderBadgeHoje()}
          {vestido.status === "ativo" ? (
            <Badge variant="secondary" className="text-sm px-3 py-1">Ativo</Badge>
          ) : (
            <Badge variant="outline" className="text-sm px-3 py-1">Inativo</Badge>
          )}
          {podeEditar && (
            <Button variant="outline" asChild>
              <Link to={editarHref}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar vestido
              </Link>
            </Button>
          )}
        </div>
      </div>

      {vestido.fotos && vestido.fotos.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[...vestido.fotos]
            .sort((a, b) => a.ordem - b.ordem)
            .map((foto) => (
              <img
                key={foto.ordem}
                src={getGetVestidoFotoUrl(activeLojaId!, vestido.id, foto.ordem, {
                  v: String(Date.parse(foto.atualizadaEm)),
                })}
                alt={`${vestido.nome} — foto ${foto.ordem + 1}`}
                loading="lazy"
                className="h-72 w-auto shrink-0 rounded-lg border object-cover"
              />
            ))}
        </div>
      ) : (
        <div className="flex aspect-[3/2] max-h-72 items-center justify-center rounded-lg border bg-muted">
          <ImageIcon className="h-10 w-10 text-muted-foreground opacity-50" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Preço Base</p>
                <p className="font-medium text-lg">{brl(vestido.precoBase)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Categoria</p>
                <p className="font-medium">{vestido.categoria || 'Não definida'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tamanho</p>
                <p className="font-medium">{vestido.tamanho || 'Não definido'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cor</p>
                <p className="font-medium">{vestido.cor || 'Não definida'}</p>
              </div>
            </div>

            {/* Características do acervo — usadas para indicar o vestido às noivas. */}
            {caracteristicas.length > 0 ? (
              <div>
                <p className="text-muted-foreground text-sm">Características</p>
                <ul className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1.5">
                  {caracteristicas.map((c) => (
                    <li
                      key={c.nome}
                      className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {c.nome}: <span className="text-foreground">{c.valor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              podeEditar && (
                <div>
                  <p className="text-muted-foreground text-sm">Características</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ainda não preenchidas.{" "}
                    <Link to={editarHref} className="underline underline-offset-4 hover:text-foreground">
                      Complete
                    </Link>{" "}
                    para melhorar as indicações de vestido.
                  </p>
                </div>
              )
            )}

            {vestido.observacoes && (
              <div>
                <p className="text-muted-foreground text-sm">Observações</p>
                <p className="text-sm mt-1">{vestido.observacoes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Disponibilidade</CardTitle>
            {/* Selo de leitura instantânea: livre vs reservada (reservas futuras/abertas). */}
            {!bloqueiosQuery.isLoading && !bloqueiosQuery.isError && (
              reservasFuturas.length === 0 ? (
                <Badge variant="secondary">Livre</Badge>
              ) : (
                <Badge variant="outline">Reservada</Badge>
              )
            )}
          </CardHeader>
          <CardContent>
            {proximaJanela.data && (
              <p className="mb-4 text-sm">
                Próxima janela livre para casamento:{" "}
                {proximaJanela.data.proximaData ? (
                  <span className="font-medium">
                    {proximaJanela.data.proximaData === proximaJanela.data.aPartirDe
                      ? "a partir de hoje"
                      : dataDia(proximaJanela.data.proximaData)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">nenhuma no próximo ano</span>
                )}
              </p>
            )}
            {bloqueiosQuery.isError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro ao carregar as reservas</AlertTitle>
                <AlertDescription className="flex items-center gap-3">
                  <span>
                    {mensagemApi(bloqueiosQuery.error, "Falha inesperada ao buscar as reservas.")}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => bloqueiosQuery.refetch()}>
                    Tentar novamente
                  </Button>
                </AlertDescription>
              </Alert>
            ) : bloqueiosQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : proximosBloqueios.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Sem reservas ou manutenções futuras. Esta peça está livre.
              </p>
            ) : (
              <ul className="space-y-4">
                {proximosBloqueios.map((bloqueio) => {
                  const reserva = bloqueio.tipo === "RESERVA_CASAMENTO";
                  const noivaNome = bloqueio.lead?.noivaNome ?? "—";
                  return (
                    <li key={bloqueio.id} className="flex items-start gap-3 text-sm">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${reserva ? "bg-primary" : "bg-muted-foreground"}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{textoPeriodo(bloqueio)}</span>
                          <Badge variant={reserva ? "secondary" : "outline"}>
                            {reserva ? "Reserva de casamento" : "Manutenção"}
                          </Badge>
                        </div>
                        {reserva && (
                          <p className="text-muted-foreground">
                            Noiva: {noivaNome}
                          </p>
                        )}
                        {bloqueio.observacao && (
                          <p className="text-xs text-muted-foreground">{bloqueio.observacao}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* E43: marcar em manutenção — cria um bloqueio MANUTENCAO. */}
            {podeEditar && (
              <div className="mt-6 flex flex-wrap items-end gap-2 border-t pt-4">
                <div className="space-y-1">
                  <Label htmlFor="manut-inicio" className="text-xs">Manutenção — de</Label>
                  <Input
                    id="manut-inicio"
                    type="date"
                    className="w-40"
                    value={manutInicio}
                    onChange={(e) => setManutInicio(e.target.value)}
                    data-testid="manutencao-inicio"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="manut-fim" className="text-xs">até (opcional)</Label>
                  <Input
                    id="manut-fim"
                    type="date"
                    className="w-40"
                    value={manutFim}
                    onChange={(e) => setManutFim(e.target.value)}
                    data-testid="manutencao-fim"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={marcarManutencao}
                  disabled={createBloqueio.isPending}
                  data-testid="marcar-manutencao"
                >
                  {createBloqueio.isPending ? "Marcando…" : "Marcar em manutenção"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
