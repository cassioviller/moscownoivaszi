import { varianteAtivo } from "@/lib/status-badge";
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
import { Erro, NaoEncontrado } from "@/components/estado";
import { CabecalhoDetalhe } from "@/components/cabecalho-detalhe";
import { diaLocal } from "@/lib/financeiro/datas";
import { useDiaLocal } from "@/hooks/use-dia-local";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Image as ImageIcon, Pencil } from "lucide-react";
import { podeNoModulo } from "@/lib/permissoes";
import { brl, diaMesAno } from "@/lib/formatos";
import { mensagemApi } from "@/lib/erro-api";
import { CACHE_ESTAVEL } from "@/lib/cache";

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

/**
 * Bloqueio ainda relevante: janela aberta ou com fim de hoje em diante.
 *
 * E115: o fim era rebatido para a meia-noite do NAVEGADOR e comparado com um
 * `hoje` de outra régua — a ocupação que termina hoje sumia (ou sobrava) para
 * quem abre fora do fuso da loja. Dias comparam como STRINGS da loja.
 */
function bloqueioFuturoOuAberto(b: BloqueioVestido, hojeYMD: string): boolean {
  const { fim } = periodoDoBloqueio(b);
  if (!fim) return true;
  return diaLocal(fim) >= hojeYMD;
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
        title: "Não deu para marcar manutenção",
        description: mensagemApi(err, "Tente novamente."),
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
    query: { ...CACHE_ESTAVEL, queryKey: getListAtributosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  // "Estado atual" do vestido: consulta batch de disponibilidade com a data de
  // hoje (new Date() aqui é aceitável — é UI de estado presente).
  // D15: era `format(new Date(), "yyyy-MM-dd")`, o HOJE do navegador. Depois
  // das 21h de São Paulo um navegador em UTC já está no dia seguinte, e a
  // ocupação do vestido passaria a ser calculada contra a data errada.
  /**
   * **S-RM11 — e este `useMemo(() => hojeLocal(), [])` era de outra espécie
   * que os outros nove: o valor dele é CHAVE DE QUERY.**
   *
   * A lista de dependências vazia congelava o dia por toda a vida da aba, e o
   * dia entra em `{ data: hoje }` e na `queryKey` logo abaixo. O react-query
   * não tem por que reconsultar uma chave que não muda: a ficha do vestido
   * respondia "está livre" no dia seguinte com a resposta do dia anterior — e
   * o "Estado atual" é a frase que a vendedora lê antes de prometer a peça.
   *
   * Com o `useDiaLocal()` (E256) a chave vira na meia-noite e a consulta é
   * refeita **uma vez**, não a cada render: o dia é uma string.
   */
  const hoje = useDiaLocal();
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
    // O dia da LOJA (E111/E115) — o corte "futuro ou aberto" da reserva não
    // pode depender do fuso do aparelho que abre a ficha do vestido. E115: a
    // comparação passou a ser entre DIAS da loja ("YYYY-MM-DD"), porque a
    // versão por instante rebatia o fim na meia-noite do navegador.
    // S-RM11: este é FILTRO DE LISTA, e não chave de cache como o `hoje` de
    // cima — o defeito dele é brando e de outra natureza: o bloqueio que
    // terminou ontem seguia listado como "próximo" numa aba aberta. O dia
    // agora entra nas dependências.
    return (bloqueiosQuery.data ?? [])
      .filter((b) => b.vestidoId === id && b.canceladoEm == null && bloqueioFuturoOuAberto(b, hoje))
      .sort((a, b) => {
        const inicioA = periodoDoBloqueio(a).inicio?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const inicioB = periodoDoBloqueio(b).inicio?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return inicioA - inicioB;
      });
  }, [bloqueiosQuery.data, id, hoje]);

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg"></div>;

  if (vestidoErro) {
    return (
      <Erro
        titulo="Não deu para carregar o vestido"
        erro={vestidoErroDetalhe}
        onTentarNovamente={() => recarregarVestido()}
      />
    );
  }

  if (!vestido) {
    return (
      <NaoEncontrado
        titulo="Este vestido não existe"
        voltarPara={
          <Button variant="outline" size="sm" asChild>
            <Link to={`/loja/${lojaId}/vestidos`}>Voltar ao acervo</Link>
          </Button>
        }
      />
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
      <CabecalhoDetalhe
        trilha={[{ rotulo: "Acervo", para: "/vestidos" }, { rotulo: vestido.codigo }]}
        titulo={vestido.nome}
        subtitulo={<span className="font-mono">{vestido.codigo}</span>}
        chip={
          <span className="flex flex-wrap items-center gap-2">
            {renderBadgeHoje()}
            {/* E130/A1: a variante vem da tabela semântica. */}
            <Badge variant={varianteAtivo(vestido.status === "ativo")} className="text-sm px-3 py-1">
              {vestido.status === "ativo" ? "Ativo" : "Inativo"}
            </Badge>
            {/* E216 (cláusula 12ª): a marca fica na ficha mesmo depois da
                primeira saída — ela é história da peça. O que expira é o
                ESTADO, e quem conta isso é a utilização, não este selo. */}
            {vestido.exclusiva && (
              <Badge variant="secondary" className="text-sm px-3 py-1" data-testid="selo-exclusiva">
                Exclusiva
              </Badge>
            )}
          </span>
        }
        acaoPrimaria={
          podeEditar ? (
            <Button variant="outline" asChild>
              <Link to={editarHref}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar vestido
              </Link>
            </Button>
          ) : undefined
        }
      />

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
                <p className="text-muted-foreground">Coleção</p>
                <p className="font-medium">{vestido.categoria || 'Não definida'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tamanho</p>
                <p className="font-medium">{vestido.tamanho || 'Não definido'}</p>
              </div>
              {/* E149: a COR saiu daqui e aparece logo abaixo, entre as
                  características — ela virou atributo do catálogo. Manter o bloco
                  seria pior que removê-lo: nos vestidos cadastrados a partir de
                  agora ele diria "Não definida" com a cor visível dois blocos
                  adiante. `vestido.cor` (legado) segue no payload para quem
                  precisar dos cadastros antigos. */}
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

            {/* E156 — a peça que não veio do fornecedor: ela foi feita aqui, sob
                medida, e entrou no acervo depois do casamento (P4). O link leva
                ao TRABALHO que a fez — a rota por trabalho existe desde a S-A17;
                antes dela, o mais perto que se chegava era a fila inteira. */}
            {vestido.origemAjusteId && (
              <div>
                <p className="text-muted-foreground text-sm">Origem</p>
                <p className="text-sm mt-1">
                  Peça confeccionada no ateliê — veio da{" "}
                  <Link
                    to={`/loja/${lojaId}/ajustes/${vestido.origemAjusteId}`}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    fila da costureira
                  </Link>
                  .
                </p>
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
                      : diaMesAno(proximaJanela.data.proximaData)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">nenhuma no próximo ano</span>
                )}
              </p>
            )}
            {bloqueiosQuery.isError ? (
              <Erro titulo="Não deu para carregar as reservas" erro={bloqueiosQuery.error} onTentarNovamente={() => bloqueiosQuery.refetch()} />
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
