import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { useEscritaNaUrl } from "@/hooks/use-escrita-na-url";
import { comFiltros, paginaDaUrl } from "@/lib/filtro-url";
import { useBuscaNaUrl } from "@/hooks/use-busca-na-url";
import { keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useDiaLocal } from "@/hooks/use-dia-local";
import {
  useListLeads,
  getListLeadsQueryKey,
  LeadEtapa,
  type ListLeadsParams,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Plus, Search, LayoutGrid, Columns3, BarChart3 } from "lucide-react";
import { diaMesAbrevAno, etapaLabel } from "@/lib/formatos";
import { podeNoModulo } from "@/lib/permissoes";
import { FunilNoivas } from "./funil";
import {
  diasAteCasamento,
  rotuloContagem,
  casamentoUrgente,
} from "./helpers";
import { Erro, Vazio } from "@/components/estado";

const TODAS_ETAPAS = "TODAS";
const POR_PAGINA = 24;

/**
 * Lista de noivas em cards (porte da /noivas do feat/orcamentos). O "estágio
 * derivado" do orcamentos degrada para a etapa do funil do Lead do main;
 * busca, etapa e página são SERVER-SIDE (E7) — a loja com 2 mil leads não
 * baixa 2 mil cards para achar um nome.
 */
export default function Noivas() {
  const { lojaId } = useParams();
  // S-RM27 — a contagem regressiva do card lê o relógio; sem isto ela
  // envelhece numa aba aberta e diz "Faltam 3 dias" no dia em que faltam 2.
  const hoje = useDiaLocal();
  const { activeLojaId, acessosModulos } = useAuth();
  // E129/D5: busca, etapa, página e vista moram na URL — conferir a ficha na
  // página 3 e voltar volta NA página 3, e o link filtrado abre filtrado.
  // (?vista=funil já deep-linkava desde o E68 — mas era só lido no mount.)
  const [searchParams, setSearchParams] = useEscritaNaUrl();
  const etapa = searchParams.get("etapa") ?? TODAS_ETAPAS;
  const pagina = paginaDaUrl(searchParams);
  const vista: "lista" | "funil" = searchParams.get("vista") === "funil" ? "funil" : "lista";
  const [busca, setBusca] = useBuscaNaUrl();
  const buscaAplicada = searchParams.get("q") ?? "";
  // Filtro novo recomeça da página 1 — página 3 de outro filtro não existe.
  const definirEtapa = (valor: string) =>
    setSearchParams((p) => comFiltros(p, { etapa: valor, pagina: null }, { etapa: TODAS_ETAPAS }), {
      replace: true,
    });
  const definirPagina = (n: number) =>
    setSearchParams((p) => comFiltros(p, { pagina: n }, { pagina: "1" }), { replace: true });
  const definirVista = (v: "lista" | "funil") =>
    setSearchParams((p) => comFiltros(p, { vista: v }, { vista: "lista" }), { replace: true });

  const params = useMemo<ListLeadsParams>(
    () => ({
      ...(buscaAplicada ? { q: buscaAplicada } : {}),
      ...(etapa !== TODAS_ETAPAS ? { etapa: etapa as ListLeadsParams["etapa"] } : {}),
      pagina,
      porPagina: POR_PAGINA,
      // E124/D2 (P2): a noiva de ontem na página 1, não na 34 — o funil e o
      // combobox já pediam `recentes`; só esta lista ficava no default antigo.
      ordem: "recentes",
    }),
    [buscaAplicada, etapa, pagina],
  );

  const { data, isLoading, isError, error, refetch } = useListLeads(activeLojaId!, params, {
    query: {
      queryKey: getListLeadsQueryKey(activeLojaId!, params),
      // No funil cada coluna faz a própria consulta por etapa — a listagem
      // paginada da lista ficaria pendurada sem ninguém para lê-la.
      enabled: !!activeLojaId && vista === "lista",
      // Trocar de página/filtro mantém a lista anterior na tela em vez de piscar.
      placeholderData: keepPreviousData,
    },
  });
  const podeCriar = podeNoModulo(acessosModulos, "leads", "criar");
  const podeEditar = podeNoModulo(acessosModulos, "leads", "editar");

  const visiveis = data?.itens ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const temFiltro = Boolean(buscaAplicada || etapa !== TODAS_ETAPAS);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif">Noivas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cada noiva, sua jornada e o casamento à vista.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" data-testid="link-conversao">
            <Link to={`/loja/${lojaId}/noivas/conversao`}>
              <BarChart3 className="h-4 w-4 mr-2" />
              Conversão
            </Link>
          </Button>
          {podeCriar && (
            <Button asChild data-testid="button-adicionar-noiva">
              <Link to={`/loja/${lojaId}/noivas/nova`}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar noiva
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar noiva…"
            aria-label="Buscar noiva pelo nome"
            className="w-56 pl-9"
            data-testid="input-busca-noiva"
          />
        </div>
        {/* No funil a etapa é a coluna — filtrar por etapa esvaziaria as outras dez. */}
        {vista === "lista" && (
          <Select value={etapa} onValueChange={definirEtapa}>
            <SelectTrigger className="w-56" aria-label="Filtrar por etapa" data-testid="select-filtro-etapa">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS_ETAPAS}>Todas as etapas</SelectItem>
              {Object.values(LeadEtapa).map((e) => (
                <SelectItem key={e} value={e}>
                  {etapaLabel(e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <ToggleGroup
          type="single"
          value={vista}
          onValueChange={(v) => v && definirVista(v as "lista" | "funil")}
          className="ml-auto"
          aria-label="Como ver as noivas"
        >
          <ToggleGroupItem value="lista" aria-label="Ver em lista" data-testid="toggle-vista-lista">
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="funil" aria-label="Ver em funil" data-testid="toggle-vista-funil">
            <Columns3 className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {vista === "funil" ? (
        <FunilNoivas
          lojaId={lojaId!}
          activeLojaId={activeLojaId!}
          busca={buscaAplicada}
          podeEditar={podeEditar}
        />
      ) : isError ? (
        <Erro titulo="Não deu para carregar as noivas" erro={error} onTentarNovamente={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-40" />
          ))}
        </div>
      ) : total === 0 && !temFiltro ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border bg-card px-6 py-16 text-center">
          <p className="text-lg font-serif">O ateliê aguarda a primeira noiva.</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {podeCriar
              ? "Cada história começa por um nome. Adicione a primeira noiva e acompanhe a jornada, prova a prova, até o grande dia."
              : "Assim que a administração adicionar as noivas, a jornada de cada uma vai aparecer aqui."}
          </p>
          {podeCriar && (
            <Button asChild>
              <Link to={`/loja/${lojaId}/noivas/nova`}>Adicionar a primeira noiva</Link>
            </Button>
          )}
        </div>
      ) : visiveis.length === 0 ? (
        /* C6/E124: o vazio de filtro nomeia o que filtrou e oferece a saída. */
        <Vazio
          titulo={
            buscaAplicada
              ? `Nenhuma noiva para “${buscaAplicada}”`
              : "Nenhuma noiva nesta etapa"
          }
          descricao={
            buscaAplicada
              ? "A busca olha o nome da noiva, do noivo e o WhatsApp."
              : etapa !== TODAS_ETAPAS
                ? `Há noivas na loja — nenhuma está em “${etapaLabel(etapa as NonNullable<ListLeadsParams["etapa"]>)}”.`
                : undefined
          }
          acao={
            <Button
              variant="outline"
              onClick={() => {
                setBusca("");
                definirEtapa(TODAS_ETAPAS);
              }}
            >
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visiveis.map((n) => {
            const perdida = n.etapa === "PERDIDO";
            const concluida = n.etapa === "DEVOLVIDO";
            const dias = n.casamentoData ? diasAteCasamento(n.casamentoData, hoje) : null;
            const mostrarContagem = dias !== null && dias >= 0 && !perdida && !concluida;
            const urgente = dias !== null && mostrarContagem && casamentoUrgente(dias);
            return (
              <Card key={n.id} className={perdida ? "opacity-60" : undefined} data-testid={`card-noiva-${n.id}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate">{n.noivaNome}</span>
                      {n.noivoNome && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          &amp; {n.noivoNome}
                        </span>
                      )}
                    </span>
                    <Badge variant={perdida ? "outline" : "secondary"} className="shrink-0">
                      {etapaLabel(n.etapa)}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>Casamento</span>
                    <span className="text-right">
                      <span className="tabular-nums text-foreground">
                        {n.casamentoData ? diaMesAbrevAno(n.casamentoData) : "a definir"}
                      </span>
                      {mostrarContagem && (
                        <span className={`block text-xs ${urgente ? "text-destructive" : ""}`}>
                          {rotuloContagem(dias!)}
                        </span>
                      )}
                    </span>
                  </div>
                  {n.whatsapp && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span>WhatsApp</span>
                      <span className="tabular-nums text-foreground">{n.whatsapp}</span>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="pt-0">
                  <Button asChild variant="outline" size="sm" data-testid={`link-detalhes-${n.id}`}>
                    <Link to={`/loja/${lojaId}/noivas/${n.id}`}>Detalhes</Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
        {totalPaginas > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {total} noiva{total === 1 ? "" : "s"} · página {pagina} de {totalPaginas}
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
        </>
      )}
    </div>
  );
}
