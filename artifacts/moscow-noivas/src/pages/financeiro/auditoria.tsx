import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useListAuditoria,
  getListAuditoriaQueryKey,
  useListAutoresAuditoria,
  getListAutoresAuditoriaQueryKey,
  getExportarAuditoriaUrl,
} from "@workspace/api-client-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { instanteCurto } from "@/lib/formatos";
import {
  ROTULO_ACAO,
  ACOES_FILTRAVEIS,
  acaoEmDestaque,
  acaoFiltravel,
  destinoDaLinha,
  resumoDetalhe,
} from "@/lib/financeiro/auditoria";

// Reexportados para o log de atividade da equipe (E18) — mesma trilha, outra
// lente. Moraram aqui até a E47; hoje o núcleo é `lib/financeiro/auditoria`.
export { ROTULO_ACAO, resumoDetalhe };

/** O corte do servidor. A tela precisa saber para poder AVISAR que cortou. */
const LIMITE_TRILHA = 200;

/** "Todos" precisa de um valor: o Select do Radix não aceita item com value="". */
const TODOS = "__todos__";


/**
 * Trilha de auditoria (E10): quem recebeu, estornou, pagou e baixou — a
 * pergunta "quem fez isso?" respondida sem abrir chamado para o suporte.
 *
 * E47 deu à trilha o que as outras visões de dinheiro já tinham: filtro por
 * ação/autor/período, saída para a entidade tocada e CSV. Os filtros moram na
 * URL — auditoria é a tela que alguém manda por link ("olha o que aconteceu no
 * dia 12"), e um filtro que não sobrevive ao copiar-e-colar não serve para isso.
 */
export default function Auditoria() {
  const { lojaId } = useParams();
  const { activeLojaId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const acao = acaoFiltravel(searchParams.get("acao"));
  const usuarioId = searchParams.get("autor") ?? "";
  const de = searchParams.get("de") ?? "";
  const ate = searchParams.get("ate") ?? "";

  // `undefined` (e não "") para o param sumir da URL da request e da queryKey:
  // filtro vazio é ausência de filtro, não busca por vazio.
  const filtros = useMemo(
    () => ({
      acao,
      usuarioId: usuarioId || undefined,
      de: de || undefined,
      ate: ate || undefined,
    }),
    [acao, usuarioId, de, ate],
  );

  const intervaloInvertido = !!de && !!ate && de > ate;

  const trilha = useListAuditoria(activeLojaId!, filtros, {
    query: {
      queryKey: getListAuditoriaQueryKey(activeLojaId!, filtros),
      // Intervalo invertido é 400 certo: não vale gastar a request para provar.
      enabled: !!activeLojaId && !intervaloInvertido,
    },
  });

  // Os autores saem da própria trilha (não da equipe): quem saiu da loja
  // continua tendo agido. Sem filtro — a lista de opções não pode encolher
  // conforme o filtro, senão não dá para trocar de autor depois de escolher um.
  const autores = useListAutoresAuditoria(activeLojaId!, {
    query: {
      queryKey: getListAutoresAuditoriaQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });

  function definir(chave: string, valor: string) {
    setSearchParams(
      (atual) => {
        const proximo = new URLSearchParams(atual);
        if (valor) proximo.set(chave, valor);
        else proximo.delete(chave);
        return proximo;
      },
      { replace: true },
    );
  }

  const temFiltro = !!(acao || usuarioId || de || ate);
  const linhas = trilha.data ?? [];
  const truncou = linhas.length === LIMITE_TRILHA;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={`/loja/${lojaId}/financeiro`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Financeiro
          </Link>
          <h1 className="text-3xl font-serif mt-1">Trilha de auditoria</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Toda ação que mexe em dinheiro deixa linha aqui: quem fez, o quê e quando.
          </p>
        </div>
        {/* O CSV leva o filtro em vista — e o período INTEIRO dele, sem o
            corte de 200 da tela. Download nativo, como nas outras exportações. */}
        <Button variant="outline" asChild>
          <a href={getExportarAuditoriaUrl(activeLojaId!, filtros)} download>
            Exportar CSV
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="filtro-acao">Ação</Label>
          <Select
            value={acao || TODOS}
            onValueChange={(v) => definir("acao", v === TODOS ? "" : v)}
          >
            <SelectTrigger id="filtro-acao" className="w-56">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas as ações</SelectItem>
              {ACOES_FILTRAVEIS.map((a) => (
                <SelectItem key={a} value={a}>
                  {ROTULO_ACAO[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="filtro-autor">Autor</Label>
          <Select
            value={usuarioId || TODOS}
            onValueChange={(v) => definir("autor", v === TODOS ? "" : v)}
          >
            <SelectTrigger id="filtro-autor" className="w-56">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os autores</SelectItem>
              {(autores.data ?? []).map((a) => (
                <SelectItem key={a.usuarioId} value={a.usuarioId}>
                  {a.nome} ({a.total})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="filtro-de">De</Label>
          <Input
            id="filtro-de"
            type="date"
            className="w-40"
            value={de}
            onChange={(e) => definir("de", e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="filtro-ate">Até</Label>
          <Input
            id="filtro-ate"
            type="date"
            className="w-40"
            value={ate}
            onChange={(e) => definir("ate", e.target.value)}
          />
        </div>

        {temFiltro && (
          <Button variant="ghost" onClick={() => setSearchParams({}, { replace: true })}>
            Limpar
          </Button>
        )}
      </div>

      {intervaloInvertido ? (
        <p className="text-sm text-destructive">
          O início do período está depois do fim — ajuste as datas.
        </p>
      ) : trilha.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não deu para carregar a trilha</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>Falha ao buscar os registros.</span>
            <Button variant="outline" size="sm" onClick={() => trilha.refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : trilha.isLoading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-muted rounded-md" />
          ))}
        </div>
      ) : linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="trilha-vazia">
          {temFiltro
            ? "Nenhuma ação bate com esse filtro."
            : "Nenhuma ação registrada ainda — a trilha começa a contar a partir de agora."}
        </p>
      ) : (
        <>
          {/* Dizer que cortou: uma lista que para em 200 sem avisar faz quem
              audita concluir que não houve mais nada. O CSV não corta. */}
          {truncou && (
            <p className="text-sm text-muted-foreground" data-testid="trilha-truncada">
              Mostrando as {LIMITE_TRILHA} ações mais recentes do filtro. Estreite o período — ou
              exporte o CSV, que traz o período inteiro.
            </p>
          )}
          <ul className="flex flex-col divide-y rounded-lg border bg-card">
            {linhas.map((item) => {
              const resumo = resumoDetalhe(item);
              const destino = destinoDaLinha(item, lojaId ?? "");
              return (
                <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                  <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                    {instanteCurto(item.criadoEm).replace(", ", " às ")}
                  </span>
                  <Badge variant={acaoEmDestaque(item.acao) ? "destructive" : "secondary"}>
                    {ROTULO_ACAO[item.acao] ?? item.acao}
                  </Badge>
                  <span className="text-sm font-medium">{item.usuarioNome}</span>
                  {resumo && <span className="text-sm text-muted-foreground">{resumo}</span>}
                  {destino && (
                    <Link
                      to={destino.href}
                      className="ml-auto text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      {destino.rotulo} →
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
