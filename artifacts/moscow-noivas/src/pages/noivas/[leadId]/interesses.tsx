import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useConfirmarSaida } from "@/hooks/use-confirmar-saida";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetLead,
  getGetLeadQueryKey,
  useListAtributos,
  getListAtributosQueryKey,
  useSetLeadInteresse,
  getListLeadsQueryKey,
  type Atributo,
  type Lead,
} from "@workspace/api-client-react";
import { CatalogoCampos, type SelecoesCatalogo } from "@/components/catalogo/catalogo-campos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { podeNoModulo } from "@/lib/permissoes";
import { CACHE_ESTAVEL } from "@/lib/cache";
import { parseValor } from "@/lib/financeiro/dinheiro";
import { mensagemApi } from "@/lib/erro-api";

/**
 * Interesses da noiva (porte da /noivas/[leadId]/interesses): atributos do
 * catálogo + algo a mais / não quer usar / teto de orçamento, salvos via
 * useSetLeadInteresse (upsert).
 */
export default function InteressesNoiva() {
  const { lojaId, leadId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();

  const lead = useGetLead(activeLojaId!, leadId!, {
    query: {
      queryKey: getGetLeadQueryKey(activeLojaId!, leadId!),
      enabled: !!activeLojaId && !!leadId,
    },
  });
  const catalogo = useListAtributos(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListAtributosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  const podeSalvar = podeNoModulo(acessosModulos, "leads", "editar");

  const carregando = lead.isLoading || catalogo.isLoading;
  const falhou = lead.isError || catalogo.isError;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <Link
          to={`/loja/${lojaId}/noivas/${leadId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {lead.data?.noivaNome ?? "Noiva"}
        </Link>
        <h1 className="text-3xl font-serif mt-1">Interesses</h1>
        {lead.data && <p className="text-sm text-muted-foreground mt-1">{lead.data.noivaNome}</p>}
      </div>

      {falhou ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não deu para carregar os interesses</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>Falha ao buscar a noiva ou o catálogo.</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                lead.refetch();
                catalogo.refetch();
              }}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : carregando || !lead.data ? (
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-96 max-w-full bg-muted rounded" />
          <div className="h-64 w-96 max-w-full bg-muted rounded" />
        </div>
      ) : (
        <InteresseForm
          lead={lead.data}
          catalogo={catalogo.data ?? []}
          readonly={!podeSalvar}
        />
      )}

      {/* GAP Onda 2+: indicação de vestidos (vestidos sugeridos pelo interesse) —
          sem endpoint no client gerado do main. */}
    </div>
  );
}

function InteresseForm({
  lead,
  catalogo,
  readonly,
}: {
  lead: Lead;
  catalogo: Atributo[];
  readonly: boolean;
}) {
  const { lojaId, leadId } = useParams();
  const { activeLojaId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setInteresse = useSetLeadInteresse();

  const i = lead.interesse;
  const [selecoes, setSelecoes] = useState<SelecoesCatalogo>(() =>
    Object.fromEntries((i?.atributos ?? []).map((a) => [a.atributoId, a.opcaoId])),
  );
  const [algoAMais, setAlgoAMais] = useState(i?.algoAMais ?? "");
  const [naoQuerUsar, setNaoQuerUsar] = useState(i?.naoQuerUsar ?? "");
  const [tetoOrcamento, setTetoOrcamento] = useState(
    i?.tetoOrcamento != null ? String(i.tetoOrcamento) : "",
  );

  // E133/B7: ESTE é o formulário preenchido durante o atendimento, com a
  // noiva falando — zerado por um recarregar de conferência. O estado é
  // useState solto, então o "sujo" é derivação explícita contra o que veio do
  // servidor (entries ordenadas: a ordem de seleção não é sujeira), e cala
  // depois de salvar (a tela navega ao concluir).
  const [salvou, setSalvou] = useState(false);
  const inicial = {
    selecoes: Object.fromEntries((i?.atributos ?? []).map((a) => [a.atributoId, a.opcaoId])),
    algoAMais: i?.algoAMais ?? "",
    naoQuerUsar: i?.naoQuerUsar ?? "",
    tetoOrcamento: i?.tetoOrcamento != null ? String(i.tetoOrcamento) : "",
  };
  const retrato = (v: typeof inicial) =>
    JSON.stringify([Object.entries(v.selecoes).sort(), v.algoAMais, v.naoQuerUsar, v.tetoOrcamento]);
  useConfirmarSaida(
    !salvou && retrato({ selecoes, algoAMais, naoQuerUsar, tetoOrcamento }) !== retrato(inicial),
  );

  const onSelecao = (atributoId: string, opcaoId: string | null) => {
    setSelecoes((atual) => {
      const proximo = { ...atual };
      if (opcaoId) proximo[atributoId] = opcaoId;
      else delete proximo[atributoId];
      return proximo;
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // `Number("8.000")` é 8 — o teto de oito mil virava oito reais, e o filtro
    // de vestidos passava a esconder o catálogo inteiro. `parseValor` lê o
    // ponto de milhar como pt-BR (a mesma régua do item de orçamento).
    const teto = parseValor(tetoOrcamento) ?? undefined;
    if (teto !== undefined && (!Number.isFinite(teto) || teto < 0)) {
      toast({
        title: "Teto de orçamento inválido",
        description: "Informe um valor em reais (ex.: 8000).",
        variant: "destructive",
      });
      return;
    }
    try {
      await setInteresse.mutateAsync({
        lojaId: activeLojaId!,
        leadId: leadId!,
        data: {
          algoAMais: algoAMais || undefined,
          naoQuerUsar: naoQuerUsar || undefined,
          tetoOrcamento: teto,
          atributos: Object.entries(selecoes).map(([atributoId, opcaoId]) => ({
            atributoId,
            opcaoId,
          })),
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(activeLojaId!, leadId!) }),
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey(activeLojaId!) }),
      ]);
      toast({ title: "Interesses salvos" });
      setSalvou(true);
      navigate(`/loja/${lojaId}/noivas/${leadId}`);
    } catch (err) {
      toast({
        title: "Não deu para salvar interesses",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <CatalogoCampos
        catalogo={catalogo}
        selecoes={selecoes}
        onChange={onSelecao}
        disabled={readonly}
      />

      <div className="space-y-1.5">
        <Label htmlFor="i-algo">Algo a mais</Label>
        <Textarea
          id="i-algo"
          rows={2}
          value={algoAMais}
          onChange={(e) => setAlgoAMais(e.target.value)}
          disabled={readonly}
          data-testid="textarea-algo-a-mais"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="i-nao">Não quer usar</Label>
        <Textarea
          id="i-nao"
          rows={2}
          value={naoQuerUsar}
          onChange={(e) => setNaoQuerUsar(e.target.value)}
          disabled={readonly}
          data-testid="textarea-nao-quer-usar"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="i-teto">Teto de orçamento (R$)</Label>
        <Input
          id="i-teto"
          inputMode="decimal"
          value={tetoOrcamento}
          onChange={(e) => setTetoOrcamento(e.target.value)}
          disabled={readonly}
          className="max-w-48"
          data-testid="input-teto-orcamento"
        />
      </div>

      {!readonly && (
        <Button type="submit" disabled={setInteresse.isPending} data-testid="button-salvar-interesses">
          {setInteresse.isPending ? "Salvando…" : "Salvar interesses"}
        </Button>
      )}
    </form>
  );
}
