import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useListParcelas,
  getListParcelasQueryKey,
  useListPortais,
  getListPortaisQueryKey,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ErroListagem, useCaminhoDaLoja } from "./helpers";
import { HistoricoContato } from "@/components/historico-contato";
import { MessageCircle, ChevronDown } from "lucide-react";
import { brl } from "@/lib/formatos";
import {
  agingDeParcelas,
  linkWhatsApp,
  msgCobranca,
  ROTULO_FAIXA,
  type Faixa,
  type NoivaInadimplente,
} from "@/lib/financeiro/cobranca";
import { urlsDePortalPorLead } from "@/lib/portal";

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

/**
 * A régua do "há N dias": a cor sobe com o atraso (âmbar → laranja → vermelho).
 * É o "em destaque" que faltava — antes o número vivia em cinza e só o valor de
 * `mais60` ficava vermelho. Mantém o tom da tela: um marcador, não um alarme.
 */
const CLASSE_ATRASO: Record<Faixa, string> = {
  ate30: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  d31a60: "border-orange-500/50 text-orange-700 dark:text-orange-400",
  mais60: "border-destructive/50 text-destructive",
};


function LinhaNoiva({
  noiva,
  lojaNome,
  portalUrl,
}: {
  noiva: NoivaInadimplente;
  lojaNome?: string | null;
  /** E84: o portal VIVO da noiva entra na mensagem; sem ele, nada muda. */
  portalUrl?: string | null;
}) {
  const naLoja = useCaminhoDaLoja();
  const wa = linkWhatsApp(
    noiva.whatsapp,
    msgCobranca({
      noivaNome: noiva.noivaNome,
      totalVencido: noiva.totalVencido,
      diasMaisAntigo: noiva.diasMaisAntigo,
      lojaNome,
      portalUrl,
    }),
  );
  const critico = noiva.faixaMaisAntiga === "mais60";

  /**
   * `aberto` sobrevive ao fechar: uma vez buscado, o histórico fica no cache do
   * TanStack e reabrir não paga request de novo.
   */
  const [aberto, setAberto] = useState(false);
  const [jaAbriu, setJaAbriu] = useState(false);

  return (
    <li className="rounded-lg border p-4">
      <Collapsible
        open={aberto}
        onOpenChange={(v) => {
          setAberto(v);
          if (v) setJaAbriu(true);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <p className="font-medium truncate">{noiva.noivaNome ?? "Noiva"}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={`font-normal tabular-nums ${CLASSE_ATRASO[noiva.faixaMaisAntiga]}`}
                title={ROTULO_FAIXA[noiva.faixaMaisAntiga]}
              >
                vencida há {noiva.diasMaisAntigo} dia{noiva.diasMaisAntigo === 1 ? "" : "s"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {noiva.qtdParcelas} parcela{noiva.qtdParcelas === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`font-semibold tabular-nums whitespace-nowrap ${critico ? "text-destructive" : ""}`}
            >
              {brl(noiva.totalVencido)}
            </span>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                Histórico
                <ChevronDown
                  className={`ml-1 h-4 w-4 transition-transform ${aberto ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
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
        </div>
        <CollapsibleContent className="pt-4">
          {jaAbriu ? <HistoricoContato leadId={noiva.leadId} aberto={aberto} /> : null}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

export default function Cobranca() {
  const naLoja = useCaminhoDaLoja();
  const { activeLojaId, session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Nome da loja para a mensagem de cobrança ("Aqui é da Moscow Noivas") — vem
  // da sessão, como na agenda; sem request extra.
  const lojaNome = session?.lojas?.find((l) => l.id === activeLojaId)?.nome;

  const faixaParam = searchParams.get("faixa");
  const faixaAtiva: Faixa | null = ehFaixa(faixaParam) ? faixaParam : null;

  // A parcela já carrega a noiva (`contrato.leadId/lead` no GET) — o join por
  // contratoId que vivia aqui, rebuscando TODOS os contratos, morreu com ele.
  // Parcela órfã de contrato vem com `contrato` nulo e o próprio
  // `agingDeParcelas` a descarta (não há quem cobrar).
  // E79: só as ABERTAS — o aging nunca olhou as pagas, então a tela para de
  // baixar a história inteira só para descartá-la.
  const paramsAbertas = { status: "abertas" as const };
  const parcelas = useListParcelas(activeLojaId!, paramsAbertas, {
    query: {
      queryKey: getListParcelasQueryKey(activeLojaId!, paramsAbertas),
      enabled: !!activeLojaId,
    },
  });

  // E84: os portais da loja num lote — a mensagem de cobrança leva o link
  // quando o portal da noiva está vivo.
  const portais = useListPortais(activeLojaId!, {
    query: { queryKey: getListPortaisQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const portalUrls = useMemo(() => urlsDePortalPorLead(portais.data), [portais.data]);

  const aging = useMemo(() => agingDeParcelas(parcelas.data ?? []), [parcelas.data]);

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

  const carregando = parcelas.isPending;
  const erro = parcelas.isError;

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
          onRetry={() => parcelas.refetch()}
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
                      {brl(resumo.total)}
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
                    <LinhaNoiva
                      key={n.leadId}
                      noiva={n}
                      lojaNome={lojaNome}
                      portalUrl={portalUrls.get(n.leadId)}
                    />
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
