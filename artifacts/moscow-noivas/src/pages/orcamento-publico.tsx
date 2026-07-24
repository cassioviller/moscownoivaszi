import { useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOrcamentoPublico,
  getGetOrcamentoPublicoQueryKey,
  useAceitarOrcamentoPublico,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

import { brl } from "@/lib/formatos";

/**
 * Página PÚBLICA do orçamento (/orcamento/:token) — o que a noiva abre pelo
 * link do WhatsApp, sem login; irmã da /convite/:token do E6. O token fica no
 * path do FRONT (SPA — não passa pelo servidor); para a API vai em query, que
 * não cai em log.
 *
 * E74: deixou de ser somente-leitura — a noiva ACEITA por aqui. O aceite
 * grava instante, versão (E75) e hash do conteúdo, e a página vira o
 * comprovante ("você aceitou em…").
 */

const ERROS: Record<string, string> = {
  LINK_EXPIRADO: "Este link expirou. Peça um novo para a sua vendedora.",
  LINK_INVALIDO: "Link inválido — confira se ele veio inteiro do WhatsApp.",
};

const ROTULO_TIPO: Record<string, string> = {
  VESTIDO: "Vestido",
  SERVICO: "Serviço",
  AJUSTE: "Ajuste",
};

const dataFmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeZone: "America/Sao_Paulo",
});

export default function OrcamentoPublico() {
  const { token } = useParams();
  const queryClient = useQueryClient();

  const params = { token: token! };
  const orcamento = useGetOrcamentoPublico(params, {
    query: {
      queryKey: getGetOrcamentoPublicoQueryKey(params),
      enabled: !!token,
      retry: false, // 404/410 são veredito, não falha transitória
    },
  });

  const aceitar = useAceitarOrcamentoPublico({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getGetOrcamentoPublicoQueryKey(params) }),
    },
  });

  const erro = orcamento.error as { data?: { error?: string } } | null;
  const dados = orcamento.data;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-8 py-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-serif text-primary">{dados?.lojaNome ?? "Moscow Noivas"}</h1>
          <p className="text-muted-foreground">Proposta de orçamento</p>
        </div>

        <div className="bg-card border rounded-lg p-6 shadow-sm space-y-5">
          {orcamento.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-8 w-1/2" />
            </div>
          ) : orcamento.isError ? (
            <p className="text-sm text-center">
              {ERROS[erro?.data?.error ?? ""] ?? ERROS.LINK_INVALIDO}
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-sm">
                  Olá, <span className="font-medium">{dados!.noivaNome}</span>! Esta é a sua
                  proposta em <span className="font-medium">{dados!.lojaNome}</span>.
                </p>
                {dados!.status === "APROVADO" && (
                  <Badge variant="secondary">Aprovado</Badge>
                )}
              </div>

              <ul className="divide-y">
                {dados!.itens.map((it, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm">{it.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {ROTULO_TIPO[it.tipo] ?? it.tipo}
                        {it.quantidade > 1 && ` · ${it.quantidade}× R$ ${brl(it.valorUnitario)}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums">
                      R$ {brl(it.quantidade * it.valorUnitario)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="space-y-1 border-t pt-3">
                {dados!.descontoTipo && dados!.descontoValor ? (
                  <>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Soma dos itens</span>
                      <span className="tabular-nums">R$ {brl(dados!.totalBruto)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Desconto</span>
                      <span className="tabular-nums">
                        {dados!.descontoTipo === "PERCENTUAL"
                          ? `${dados!.descontoValor}%`
                          : `R$ ${brl(dados!.descontoValor)}`}
                      </span>
                    </div>
                  </>
                ) : null}
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span className="font-serif text-xl tabular-nums">
                    R$ {brl(dados!.totalLiquido)}
                  </span>
                </div>
              </div>

              {dados!.observacoes && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap border-t pt-3">
                  {dados!.observacoes}
                </p>
              )}

              {/* E74: o aceite. Aceita → comprovante; ENVIADO sem aceite → botão. */}
              {dados!.aceitoEm ? (
                <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    Você aceitou esta proposta em{" "}
                    <span className="font-medium">{dataFmt.format(new Date(dados!.aceitoEm))}</span>.
                    A sua vendedora já foi avisada.
                  </span>
                </div>
              ) : dados!.status === "ENVIADO" ? (
                <div className="space-y-2 border-t pt-3">
                  <Button
                    className="w-full"
                    disabled={aceitar.isPending}
                    onClick={() => aceitar.mutate({ params })}
                    data-testid="aceitar-orcamento"
                  >
                    {aceitar.isPending ? "Registrando…" : "Aceitar esta proposta"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Ao aceitar, registramos a data e o conteúdo desta versão da proposta.
                  </p>
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground border-t pt-3">
                {dados!.validade
                  ? `Proposta válida até ${dataFmt.format(new Date(dados!.validade))}. `
                  : ""}
                Dúvidas ou quer fechar? É só responder à sua vendedora no WhatsApp.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
