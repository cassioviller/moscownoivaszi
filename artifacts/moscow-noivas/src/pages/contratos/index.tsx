import { varianteStatusContrato } from "@/lib/status-badge";
import { useMemo } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useListContratos,
  getListContratosQueryKey,
  // S-C32 — a fila das peças que não voltaram no prazo (cláusula 16ª).
  useListContratosComAtraso,
  getListContratosComAtrasoQueryKey,
  type ContratoStatus,
  type ListContratosParams,
} from "@workspace/api-client-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { comFiltros, paginaDaUrl } from "@/lib/filtro-url";
import { useBuscaNaUrl } from "@/hooks/use-busca-na-url";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PackageX, Plus, ScrollText, Search } from "lucide-react";
import { brl, statusContratoLabel, instanteDia, diaMesAno } from "@/lib/formatos";
import { Vazio, Erro } from "@/components/estado";
import { podeNoModulo } from "@/lib/permissoes";
import { avisoDoAtraso, faixaDaLinha } from "@/lib/financeiro/fila-de-atrasos";

const FILTROS: { chave: string; rotulo: string; status?: ContratoStatus }[] = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "ATIVO", rotulo: "Ativos", status: "ATIVO" },
  { chave: "CANCELADO", rotulo: "Cancelados", status: "CANCELADO" },
];

const POR_PAGINA = 24;

/**
 * E124/D1 — o acervo de 3 anos se acha: busca por noiva, página e
 * recentes-primeiro no SERVIDOR (o molde é `noivas/index.tsx`). Antes a tela
 * baixava a loja inteira em ordem ascendente — o contrato da semana passada
 * era o último de ~29.000px de rolagem, sem campo de busca.
 */
export default function Contratos() {
  const { activeLojaId, acessosModulos } = useAuth();
  const { lojaId: lojaIdParam } = useParams();
  const lojaId = lojaIdParam ?? activeLojaId;
  const navigate = useNavigate();
  // E129/D5: filtro, busca e página moram na URL — ida-e-volta preserva e o
  // link filtrado abre filtrado. Default fora da URL (`comFiltros`).
  const [searchParams, setSearchParams] = useSearchParams();
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

  const filtroAtivo = FILTROS.find((f) => f.chave === filtro) ?? FILTROS[0];
  const params = useMemo<ListContratosParams>(
    () => ({
      ...(buscaAplicada ? { q: buscaAplicada } : {}),
      ...(filtroAtivo.status ? { status: filtroAtivo.status } : {}),
      pagina,
      porPagina: POR_PAGINA,
    }),
    [buscaAplicada, filtroAtivo.status, pagina],
  );
  const { data, isLoading, isError, error, refetch } = useListContratos(activeLojaId!, params, {
    query: {
      queryKey: getListContratosQueryKey(activeLojaId!, params),
      enabled: !!activeLojaId,
      // Trocar de página/filtro mantém a lista anterior na tela em vez de piscar.
      placeholderData: keepPreviousData,
    },
  });

  /**
   * **S-C32 — a fila das peças que não voltaram, e por que ela mora AQUI.**
   *
   * O E212 fez o sistema cobrar a 16ª e deu à conta uma porta só: a ficha
   * daquela reserva. Só que o fato **não é um gesto** — é a falta de um. A peça
   * não volta, ninguém clica em nada, e a diária soma sozinha todo dia: um
   * vestido de R$ 3.000,00 tem diária de R$ 500,00 (o aluguel ÷ os 6 dias da
   * janela de uso), e nove dias custam R$ 4.750,00 sem que uma tela do sistema
   * diga isso a alguém.
   *
   * A fila irmã em FORMA é a cobrança (`/financeiro/cobranca`) — a única tela
   * feita para o que envelhece e pede um telefonema. Ela é gateada por
   * `financeiro`, e a **Vendedora do seed tem `financeiro: NADA` e
   * `contratos: TUDO`**: pendurar a fila lá esconderia o atraso justamente de
   * quem pode cobrá-lo, e a mostraria a quem não pode. É a classe de defeito da
   * `s36-gate-da-tela-unit` uma camada acima da que ela mede.
   *
   * Então ela mora em Contratos, que é onde o E212 já pôs a decisão — e no
   * TOPO: um contrato com peça fora do prazo não é mais um item do catálogo, é
   * o que a loja precisa resolver antes de procurar qualquer outro.
   *
   * A conta não é refeita aqui: o servidor devolve linha, diária, multa e
   * total pela mesma função que a ficha usa para cobrar (lição do E187).
   */
  const podeVerAtraso = podeNoModulo(acessosModulos, "contratos", "ver");
  const atrasos = useListContratosComAtraso(activeLojaId!, {
    query: {
      queryKey: getListContratosComAtrasoQueryKey(activeLojaId!),
      enabled: !!activeLojaId && podeVerAtraso,
    },
  });
  const fila = atrasos.data?.itens ?? [];
  /**
   * **S-C86 — a peça fora que nenhum contrato ATIVO cobre.** O acervo já a
   * pintava `ATRASO_DEVOLUCAO`; esta tela não a via, porque a fila varre
   * contratos. Ela vem separada de propósito: não há noiva a quem cobrar nem
   * carnê onde lançar, e misturá-la às cobráveis faria a lista prometer um
   * botão que não existe.
   */
  const orfas = atrasos.data?.semContrato ?? [];
  // S-O16/S-O65: a ausência entra na PERGUNTA, não numa asserção `!` lá embaixo
  // — a asserção sobrevive a quem mexer na guarda de cima. Mesmo vermelho que o
  // E212 levou nesta régua, no dia em que a conta do atraso nasceu.
  const valorDaFila = atrasos.data?.valor ?? 0;
  const aviso = avisoDoAtraso(atrasos.data);

  const lista = data?.itens ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const temFiltro = Boolean(buscaAplicada || filtroAtivo.status);

  return (
    <div className="space-y-6">
      {/* E126/E1: sem quebra o botão desenhava por cima do título e terminava
          em 419px — fora dos 390. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif">Contratos</h1>
          <p className="text-sm text-muted-foreground mt-1">As vendas fechadas e o carnê de cada uma.</p>
        </div>
        {/* Contrato nasce de um orçamento APROVADO — o botão leva ao funil certo. */}
        <Button onClick={() => navigate(`/loja/${lojaId}/orcamentos`)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo contrato (via orçamento)
        </Button>
      </div>

      {/* S-C32 — o que está fora da arara vem antes do catálogo. A seção só
          existe quando há peça fora do prazo: fila vazia é o normal, e um card
          permanente dizendo "nada" vira ruído que ninguém lê mais. */}
      {aviso && (fila.length > 0 || orfas.length > 0) && (
        <Card
          className={aviso.urgente ? "border-destructive" : "border-aviso/70"}
          data-testid="fila-de-atrasos"
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <PackageX
                  className={`mt-0.5 h-4 w-4 shrink-0 ${aviso.urgente ? "text-destructive" : "text-aviso"}`}
                />
                <div className="space-y-0.5">
                  <h2 className="text-sm font-medium" data-testid="fila-de-atrasos-titulo">
                    {aviso.titulo}
                  </h2>
                  <p className="text-xs text-muted-foreground">{aviso.detalhe}</p>
                </div>
              </div>
              {valorDaFila > 0 && (
                <span
                  className="font-semibold tabular-nums whitespace-nowrap"
                  data-testid="fila-de-atrasos-total"
                >
                  {brl(valorDaFila)}
                </span>
              )}
            </div>
            {/* Sem contrato atrasado a lista some inteira: um `<ul>` vazio com
                borda desenha um risco solto acima das órfãs. */}
            {fila.length > 0 && (
            <ul className="divide-y border-t">
              {fila.map((i) => {
                // As peças fora, incluindo as que a 16ª não sabe cobrar: quem
                // lê a fila quer saber o que está fora da arara, não só o que
                // tem preço.
                const pecas = [...i.linhas.map((l) => l.descricao), ...i.semAluguel];
                return (
                  <li
                    key={i.contratoId}
                    className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                    data-testid={`atraso-${i.contratoId}`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium truncate">{i.noivaNome ?? "Noiva"}</p>
                      <p className="text-xs text-muted-foreground">
                        {pecas.join(", ")} · {faixaDaLinha(i)}
                      </p>
                      {i.semAluguel.length > 0 && (
                        <p className="text-xs text-destructive" data-testid={`atraso-sem-aluguel-${i.contratoId}`}>
                          {i.semAluguel.join(", ")} — fora do rol de itens do contrato: a 16ª cobra
                          sobre o aluguel de cada peça, e não há de onde tirá-lo.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {i.valor > 0 && (
                        <span className="font-semibold tabular-nums whitespace-nowrap">
                          {brl(i.valor)}
                        </span>
                      )}
                      {/* Cobrado NÃO tira a linha: a peça segue fora da arara,
                          e sumir daqui diria que ela voltou. */}
                      {i.jaCobrada && <Badge variant="secondary">Cobrado</Badge>}
                      {/* A ficha da reserva é onde o E212 pôs o gesto de
                          cobrar — a fila avisa e leva até ele. */}
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/loja/${lojaId}/reservas/${i.bloqueioId}`}>Abrir a reserva</Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/loja/${lojaId}/contratos/${i.contratoId}`}>Contrato</Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            )}

            {/* S-C86 — as órfãs, depois das cobráveis e visivelmente à parte:
                a peça está fora da arara e a 16ª não a alcança. O caminho é a
                ficha da reserva, que é onde se registra a devolução — o único
                gesto que faz o contador parar. */}
            {orfas.length > 0 && (
              <div className="space-y-2 border-t pt-3" data-testid="atrasos-sem-contrato">
                <p className="text-xs text-muted-foreground">
                  Fora do prazo e <span className="font-medium">sem contrato ativo</span>: a
                  cláusula 16ª cobra sobre o aluguel de cada peça, e não há de onde tirá-lo.
                </p>
                <ul className="divide-y">
                  {orfas.map((o) => (
                    <li
                      key={o.bloqueioId}
                      className="flex flex-wrap items-center justify-between gap-3 py-2"
                      data-testid={`atraso-sem-contrato-${o.bloqueioId}`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium truncate">{o.vestidoNome}</p>
                        <p className="text-xs text-muted-foreground">
                          {o.noivaNome ?? "sem noiva"} · fora do prazo há {o.dias}{" "}
                          {o.dias === 1 ? "dia" : "dias"}
                        </p>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/loja/${lojaId}/reservas/${o.bloqueioId}`}>Abrir a reserva</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar noiva…"
            aria-label="Buscar contrato pelo nome da noiva"
            className="w-56 pl-9"
            data-testid="input-busca-contrato"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <Button
              key={f.chave}
              size="sm"
              variant={f.chave === filtroAtivo.chave ? "default" : "outline"}
              className="rounded-full"
              onClick={() => definirFiltro(f.chave)}
            >
              {f.rotulo}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isError ? (
          <Erro
            titulo="Não deu para carregar os contratos"
            erro={error}
            onTentarNovamente={() => refetch()}
          />
        ) : isLoading ? (
          [1, 2, 3].map(i => <Card key={i} className="h-24 animate-pulse" />)
        ) : lista.length === 0 ? (
          <Vazio
            titulo={
              buscaAplicada
                ? `Nenhum contrato para “${buscaAplicada}”`
                : filtroAtivo.status
                  ? "Nenhum contrato com este status"
                  : "Nenhum contrato ainda"
            }
            descricao={
              buscaAplicada
                ? "A busca olha o nome da noiva, do noivo e o WhatsApp, em todos os anos da loja."
                : filtroAtivo.status
                  ? "Há contratos na loja — nenhum deles está neste status."
                  : "O contrato nasce de um orçamento aprovado: é lá que o valor e as parcelas são decididos."
            }
            acao={
              temFiltro ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setBusca("");
                    definirFiltro("todos");
                  }}
                >
                  Limpar filtros
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <Link to={`/loja/${lojaId}/orcamentos`}>Ver orçamentos</Link>
                </Button>
              )
            }
          />
        ) : (
          lista.map(contrato => (
            <Link key={contrato.id} to={`/loja/${lojaId}/contratos/${contrato.id}`}>
              <Card className="hover-elevate cursor-pointer">
                {/* E126/E1: sem quebra o badge de status terminava em 414px —
                    fora dos 390; valor e badge caem para a linha de baixo. */}
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                      <ScrollText className="h-5 w-5" />
                    </div>
                    <div>
                      <div className={`font-medium ${contrato.status === "CANCELADO" ? "text-muted-foreground line-through" : ""}`}>
                        {contrato.lead?.noivaNome ?? `Contrato #${contrato.id.slice(0, 6)}`}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Contrato #{contrato.id.slice(0, 6)} • Fechado em {instanteDia(contrato.fechadoEm)}
                        {contrato.dataCasamento && ` • Casamento ${diaMesAno(contrato.dataCasamento)}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="font-semibold">{brl(contrato.valorTotal)}</div>
                    <Badge variant={varianteStatusContrato(contrato.status)}>{statusContratoLabel(contrato.status)}</Badge>
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
            {total} contrato{total === 1 ? "" : "s"} · página {pagina} de {totalPaginas}
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
