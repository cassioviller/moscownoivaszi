import { useMemo } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useListContratos,
  getListContratosQueryKey,
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
import { Plus, ScrollText, Search } from "lucide-react";
import { brl, statusContratoLabel, instanteDia, diaMesAno } from "@/lib/formatos";
import { Vazio, Erro } from "@/components/estado";

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
  const { activeLojaId } = useAuth();
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

  const lista = data?.itens ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const temFiltro = Boolean(buscaAplicada || filtroAtivo.status);

  return (
    <div className="space-y-6">
      {/* E126/E1: sem quebra o botão desenhava por cima do título e terminava
          em 419px — fora dos 390. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-serif">Contratos</h1>
        {/* Contrato nasce de um orçamento APROVADO — o botão leva ao funil certo. */}
        <Button onClick={() => navigate(`/loja/${lojaId}/orcamentos`)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo contrato (via orçamento)
        </Button>
      </div>

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
                    <Badge variant={contrato.status === 'ATIVO' ? 'default' : 'destructive'}>{statusContratoLabel(contrato.status)}</Badge>
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
