import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useListParcelas,
  getListParcelasQueryKey,
  useListContratos,
  getListContratosQueryKey,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErroListagem, useCaminhoDaLoja } from "./helpers";
import { MessageCircle } from "lucide-react";
import { brl } from "@/lib/formatos";
import {
  agingDeParcelas,
  linkWhatsApp,
  ROTULO_FAIXA,
  type Faixa,
  type NoivaInadimplente,
  type ParcelaComNoiva,
} from "@/lib/financeiro/cobranca";

/**
 * Cobrança: parcelas PREVISTAS já vencidas, agrupadas por faixa de atraso e por
 * noiva. Toda a agregação é do núcleo (`agingDeParcelas`), já testado — esta
 * tela só junta parcela + contrato, filtra por faixa e desenha.
 *
 * Tom concierge: é uma fila de quem ligar antes, não uma régua de cobrança.
 */

const FAIXAS = ["ate30", "d31a60", "mais60"] as const;

function ehFaixa(valor: string | null): valor is Faixa {
  return valor !== null && (FAIXAS as readonly string[]).includes(valor);
}

const msgPadrao = (nome: string | null) =>
  `Olá ${nome ?? ""}! Aqui é do atelier. Passando com carinho para lembrar de uma parcela em aberto. Qualquer dúvida, estou à disposição.`;


function LinhaNoiva({ noiva }: { noiva: NoivaInadimplente }) {
  const naLoja = useCaminhoDaLoja();
  const wa = linkWhatsApp(noiva.whatsapp, msgPadrao(noiva.noivaNome));
  const critico = noiva.faixaMaisAntiga === "mais60";

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div className="min-w-0 space-y-1">
        <p className="font-medium truncate">{noiva.noivaNome ?? "Noiva"}</p>
        <p className="text-xs text-muted-foreground">
          {noiva.qtdParcelas} parcela{noiva.qtdParcelas === 1 ? "" : "s"} · há {noiva.diasMaisAntigo} dia
          {noiva.diasMaisAntigo === 1 ? "" : "s"} · {ROTULO_FAIXA[noiva.faixaMaisAntiga]}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`font-semibold tabular-nums whitespace-nowrap ${critico ? "text-destructive" : ""}`}
        >
          R$ {brl(noiva.totalVencido)}
        </span>
        <Button asChild variant="outline" size="sm">
          <Link to={naLoja(`/contratos/${noiva.contratoId}`)}>Contrato</Link>
        </Button>
        {wa ? (
          <Button asChild variant="outline" size="sm">
            <a href={wa} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-1 h-4 w-4" />
              WhatsApp
            </a>
          </Button>
        ) : (
          <Badge variant="secondary" title="Sem WhatsApp válido no cadastro">
            Sem WhatsApp
          </Badge>
        )}
      </div>
    </li>
  );
}

export default function Cobranca() {
  const naLoja = useCaminhoDaLoja();
  const { activeLojaId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const faixaParam = searchParams.get("faixa");
  const faixaAtiva: Faixa | null = ehFaixa(faixaParam) ? faixaParam : null;

  const parcelas = useListParcelas(activeLojaId!, {
    query: {
      queryKey: getListParcelasQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });

  const contratos = useListContratos(activeLojaId!, {
    query: {
      queryKey: getListContratosQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });

  /**
   * A parcela não carrega a noiva; o contrato sim (`GET /contratos` já vem com
   * `lead` embutido). Juntamos por `contratoId` para formar o `ParcelaComNoiva`
   * que o núcleo espera — parcela órfã de contrato fica sem `leadId` e o
   * próprio `agingDeParcelas` a descarta (não há quem cobrar).
   */
  const parcelasComNoiva = useMemo<ParcelaComNoiva[]>(() => {
    const porContrato = new Map((contratos.data ?? []).map((c) => [c.id, c]));
    return (parcelas.data ?? []).map((p) => {
      const contrato = porContrato.get(p.contratoId);
      return {
        ...p,
        contrato: contrato
          ? {
              leadId: contrato.leadId,
              lead: contrato.lead
                ? { noivaNome: contrato.lead.noivaNome, whatsapp: contrato.lead.whatsapp ?? null }
                : null,
            }
          : null,
      };
    });
  }, [parcelas.data, contratos.data]);

  const aging = useMemo(() => agingDeParcelas(parcelasComNoiva), [parcelasComNoiva]);

  const noivasVisiveis = useMemo(
    () => (faixaAtiva ? aging.noivas.filter((n) => n.faixaMaisAntiga === faixaAtiva) : aging.noivas),
    [aging.noivas, faixaAtiva],
  );

  /** Clicar na faixa ativa desliga o filtro. */
  function filtrarPor(faixa: Faixa | null) {
    setSearchParams(
      (atual) => {
        const proximo = new URLSearchParams(atual);
        if (faixa) proximo.set("faixa", faixa);
        else proximo.delete("faixa");
        return proximo;
      },
      { replace: true },
    );
  }

  const carregando = parcelas.isPending || contratos.isPending;
  const erro = parcelas.isError || contratos.isError;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link to={naLoja("/financeiro")} className="text-sm text-muted-foreground hover:text-foreground">
          ← Financeiro
        </Link>
        <h1 className="text-3xl font-serif">Cobrança</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe com delicadeza as parcelas em aberto. A mais atrasada vem primeiro.
        </p>
      </div>

      {erro ? (
        <ErroListagem
          mensagem="Falha ao buscar as parcelas em atraso."
          onRetry={() => {
            if (parcelas.isError) parcelas.refetch();
            if (contratos.isError) contratos.refetch();
          }}
        />
      ) : carregando ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {FAIXAS.map((f) => (
              <Skeleton key={f} className="h-28 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {FAIXAS.map((f) => {
              const resumo = aging.faixas[f];
              const ativa = faixaAtiva === f;
              return (
                <Card
                  key={f}
                  role="button"
                  tabIndex={0}
                  aria-pressed={ativa}
                  className={`cursor-pointer transition-colors ${ativa ? "border-primary" : "hover:border-muted-foreground/40"}`}
                  onClick={() => filtrarPor(ativa ? null : f)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      filtrarPor(ativa ? null : f);
                    }
                  }}
                >
                  <CardHeader className="pb-2">
                    <CardDescription>{ROTULO_FAIXA[f]}</CardDescription>
                    <CardTitle
                      className={`text-2xl tabular-nums ${f === "mais60" && resumo.total > 0 ? "text-destructive" : ""}`}
                    >
                      R$ {brl(resumo.total)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      {resumo.qtdNoivas} noiva{resumo.qtdNoivas === 1 ? "" : "s"}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle>
                Noivas em atraso
                {faixaAtiva ? (
                  <Badge variant="secondary" className="ml-2 font-normal">
                    {ROTULO_FAIXA[faixaAtiva]}
                  </Badge>
                ) : null}
              </CardTitle>
              {faixaAtiva ? (
                <Button variant="ghost" size="sm" onClick={() => filtrarPor(null)}>
                  Limpar filtro
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {aging.noivas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma parcela em atraso.</p>
              ) : noivasVisiveis.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma noiva nesta faixa de atraso.
                </p>
              ) : (
                <ul className="space-y-3">
                  {noivasVisiveis.map((n) => (
                    <LinhaNoiva key={n.leadId} noiva={n} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
