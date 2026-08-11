import { useState } from "react";
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

import { brl, instanteLongo, tipoItemLabel } from "@/lib/formatos";
import { mensagemApi } from "@/lib/erro-api";

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
  MUITAS_TENTATIVAS: "Muitas tentativas em pouco tempo. Espere alguns minutos e abra o link de novo.",
  // A03.3/E166: os desfechos do ACEITE também têm frase — o botão tinha zero
  // tratamento de erro, e a noiva clicava no vazio.
  PROPOSTA_MUDOU: "Esta proposta foi atualizada — recarregue a página para ver a versão nova antes de aceitar.",
  VALIDADE_VENCIDA: "Esta proposta venceu — peça uma atualização à sua vendedora para aceitar.",
  NAO_ENVIADO: "Esta proposta não está mais aberta para aceite — fale com a sua vendedora.",
};


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

  // A03.3/E166: o botão de aceite não tinha onError NENHUM — a rede caía, o
  // 409 chegava, e a página não dizia uma palavra. O mapa é o mesmo dos erros
  // de abertura, e a mensagem fica onde o dedo está.
  const [erroDoAceite, setErroDoAceite] = useState<string | null>(null);
  const aceitar = useAceitarOrcamentoPublico({
    mutation: {
      onSuccess: () => {
        setErroDoAceite(null);
        void queryClient.invalidateQueries({ queryKey: getGetOrcamentoPublicoQueryKey(params) });
      },
      onError: (err) => {
        const codigo = (err as { data?: { error?: string } })?.data?.error;
        setErroDoAceite(
          (codigo && ERROS[codigo]) ??
            (err as { data?: { detalhe?: string } })?.data?.detalhe ??
            "Não conseguimos registrar o aceite agora. Confira a conexão e tente de novo.",
        );
      },
    },
  });

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
            /* O12/E166: todo 500 e toda queda de rede viravam "link inválido"
               — a noiva com o link CERTO às 23h lia que o link estava errado e
               pedia outro. Esta era a única tela que refazia a tradução à mão;
               agora ela passa pelo `mensagemApi`, que separa "o sistema não
               respondeu" de "o link não existe" como todas as outras. */
            <p className="text-sm text-center" data-testid="erro-da-pagina">
              {mensagemApi(orcamento.error, ERROS.LINK_INVALIDO, ERROS)}
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
                        {tipoItemLabel(it.tipo)}
                        {it.quantidade > 1 && ` · ${it.quantidade}× ${brl(it.valorUnitario)}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums">
                      {brl(it.quantidade * it.valorUnitario)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="space-y-1 border-t pt-3">
                {/* O9/E166: o desconto EXIBIDO é bruto − líquido do snapshot —
                    a conta que fecha. Antes a linha imprimia o descontoValor
                    cru, e um desconto VALOR maior que a soma saía como "Soma
                    R$ 4.800,00 · Desconto R$ 5.000,00 · Total R$ 0,00": uma
                    subtração de −R$ 200,00 apresentada como zero no documento
                    que decide a compra. O rótulo percentual fica como
                    contexto; o número é sempre a diferença real. */}
                {dados!.descontoTipo && dados!.descontoValor ? (
                  <>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Soma dos itens</span>
                      <span className="tabular-nums">{brl(dados!.totalBruto)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>
                        Desconto
                        {dados!.descontoTipo === "PERCENTUAL" ? ` (${dados!.descontoValor}%)` : ""}
                      </span>
                      <span className="tabular-nums">
                        − {brl(dados!.totalBruto - dados!.totalLiquido)}
                      </span>
                    </div>
                  </>
                ) : null}
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span className="font-serif text-xl tabular-nums">
                    {brl(dados!.totalLiquido)}
                  </span>
                </div>
              </div>

              {dados!.observacoes && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap border-t pt-3">
                  {dados!.observacoes}
                </p>
              )}

              {/* O8/E166: RECUSADO ganha o ramo que não tinha — a noiva reabria
                  o link e via a proposta inteira que a loja já deu por perdida,
                  com o rodapé prometendo validade e sem uma palavra. A decisão
                  do plano ("recusar revoga o token") foi ATENUADA de propósito:
                  revogar deixaria a página dizendo "link inválido", que é pior
                  que a verdade — o registro fica legível, sem botão. */}
              {dados!.status === "RECUSADO" ? (
                <div className="rounded-md border p-3 text-sm text-muted-foreground" data-testid="proposta-encerrada">
                  Esta proposta foi encerrada. Se você ainda procura o vestido, é só falar com a
                  sua vendedora — ela monta uma proposta nova.
                </div>
              ) : null}

              {/* A03.3: o erro do aceite aparece ONDE o dedo está. */}
              {erroDoAceite && (
                <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm" data-testid="erro-do-aceite">
                  {erroDoAceite}
                </div>
              )}

              {/* E74: o aceite. Aceita → comprovante; ENVIADO sem aceite → botão. */}
              {dados!.aceitoEm ? (
                <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {/* A03.1/E162: dizia "a sua vendedora já foi avisada" — uma
                      afirmação de fato que o mundo não cumpria: não havia
                      notificação NENHUMA, e o aceite ainda tirava o orçamento
                      da única fila proativa da loja. Agora o aceite entra na
                      fila diária (/mensagens) e no painel — e a frase promete
                      o que o sistema faz, não mais que isso. */}
                  <span>
                    Você aceitou esta proposta em{" "}
                    <span className="font-medium">{instanteLongo(dados!.aceitoEm)}</span>.
                    O ateliê vai falar com você para acertar o contrato e os próximos passos.
                  </span>
                </div>
              ) : dados!.status === "ENVIADO" ? (
                <div className="space-y-2 border-t pt-3">
                  <Button
                    className="w-full"
                    disabled={aceitar.isPending}
                    /**
                     * E160/C2 — a versão vai junto: o aceite confere contra o
                     * que ela VIU, não contra a mais nova.
                     *
                     * Sem isto, a aba aberta há uma hora aceitava a versão
                     * nascida no meio, e o contrato saía R$ 500,00 acima do
                     * que a página mostrava — por baixo da guarda do E115,
                     * porque o hash gravado era o da versão nova. O servidor
                     * responde 409 PROPOSTA_MUDOU e a noiva recarrega.
                     */
                    onClick={() =>
                      aceitar.mutate({ params: { ...params, versao: dados?.versaoNumero ?? undefined } })
                    }
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
                  ? `Proposta válida até ${instanteLongo(dados!.validade)}. `
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
