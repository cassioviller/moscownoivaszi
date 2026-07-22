import { useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPortal,
  getGetPortalQueryKey,
  useAceitarPortal,
  useConfirmarProvaPortal,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CalendarDays } from "lucide-react";
import { brl } from "@/lib/formatos";

/**
 * O portal da noiva (/noiva/:token, E78) — UM link para tudo dela: a
 * proposta (com aceite E74), o lookbook provado, as próximas provas e o
 * extrato de parcelas. Sem login; irmã das /orcamento/:token e
 * /lookbook/:token, que continuam valendo (compat). Token no path do FRONT
 * (SPA); para a API vai em query, fora do log.
 *
 * Seções CONDICIONAIS de propósito: sem contrato não há extrato, sem
 * lookbook não há galeria — a página não promete o que não existe.
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

const ROTULO_PARCELA: Record<string, string> = {
  PREVISTA: "Em aberto",
  PARCIAL: "Parcialmente paga",
  PAGA: "Paga",
  CANCELADA: "Cancelada",
};

const dataFmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeZone: "America/Sao_Paulo",
});
const dataHoraFmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const fotoUrl = (
  token: string,
  vestidoId: string,
  ordem: number,
  atualizadaEm: string,
) =>
  `/api/portal/foto?token=${encodeURIComponent(token)}&vestidoId=${vestidoId}&ordem=${ordem}&v=${new Date(atualizadaEm).getTime()}`;

export default function NoivaPortal() {
  const { token } = useParams();
  const queryClient = useQueryClient();

  const params = { token: token! };
  const portal = useGetPortal(params, {
    query: {
      queryKey: getGetPortalQueryKey(params),
      enabled: !!token,
      retry: false, // 404/410 são veredito, não falha transitória
    },
  });

  const aceitar = useAceitarPortal({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: getGetPortalQueryKey(params),
        }),
    },
  });

  // E85: confirmar a presença é o mesmo gesto do aceite — o clique dela vira
  // o carimbo que a fila da vendedora já entende.
  const confirmarProva = useConfirmarProvaPortal({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: getGetPortalQueryKey(params),
        }),
    },
  });

  const erro = portal.error as { data?: { error?: string } } | null;
  const dados = portal.data;
  const orc = dados?.orcamento ?? null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-2xl space-y-8 p-4 py-10">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-serif text-primary">
            {dados?.lojaNome ?? "Moscow Noivas"}
          </h1>
          <p className="text-muted-foreground">
            {dados ? `O lugar de ${dados.noivaNome}` : "O seu lugar"}
          </p>
        </div>

        {portal.isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-56 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        ) : portal.isError ? (
          <p className="text-sm text-center">
            {ERROS[erro?.data?.error ?? ""] ?? ERROS.LINK_INVALIDO}
          </p>
        ) : (
          <>
            {/* — A proposta (E13 + aceite E74) — */}
            {orc && (
              <section className="bg-card border rounded-lg p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-serif text-2xl">Sua proposta</h2>
                  {orc.status === "APROVADO" && (
                    <Badge variant="secondary">Aprovada</Badge>
                  )}
                </div>

                <ul className="divide-y">
                  {orc.itens.map((it, i) => (
                    <li
                      key={i}
                      className="flex items-start justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm">{it.descricao}</p>
                        <p className="text-xs text-muted-foreground">
                          {ROTULO_TIPO[it.tipo] ?? it.tipo}
                          {it.quantidade > 1 &&
                            ` · ${it.quantidade}× R$ ${brl(it.valorUnitario)}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums">
                        R$ {brl(it.quantidade * it.valorUnitario)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="space-y-1 border-t pt-3">
                  {orc.descontoTipo && orc.descontoValor ? (
                    <>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Soma dos itens</span>
                        <span className="tabular-nums">
                          R$ {brl(orc.totalBruto)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Desconto</span>
                        <span className="tabular-nums">
                          {orc.descontoTipo === "PERCENTUAL"
                            ? `${orc.descontoValor}%`
                            : `R$ ${brl(orc.descontoValor)}`}
                        </span>
                      </div>
                    </>
                  ) : null}
                  <div className="flex justify-between font-medium">
                    <span>Total</span>
                    <span className="font-serif text-xl tabular-nums">
                      R$ {brl(orc.totalLiquido)}
                    </span>
                  </div>
                </div>

                {orc.observacoes && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap border-t pt-3">
                    {orc.observacoes}
                  </p>
                )}

                {orc.aceitoEm ? (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      Você aceitou esta proposta em{" "}
                      <span className="font-medium">
                        {dataFmt.format(new Date(orc.aceitoEm))}
                      </span>
                      . A sua vendedora já foi avisada.
                    </span>
                  </div>
                ) : orc.status === "ENVIADO" ? (
                  <div className="space-y-2 border-t pt-3">
                    <Button
                      className="w-full"
                      disabled={aceitar.isPending}
                      onClick={() => aceitar.mutate({ params })}
                      data-testid="aceitar-portal"
                    >
                      {aceitar.isPending
                        ? "Registrando…"
                        : "Aceitar esta proposta"}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Ao aceitar, registramos a data e o conteúdo desta versão
                      da proposta.
                    </p>
                  </div>
                ) : null}

                {orc.validade && (
                  <p className="text-xs text-muted-foreground border-t pt-3">
                    Proposta válida até {dataFmt.format(new Date(orc.validade))}
                    .
                  </p>
                )}
              </section>
            )}

            {/* — As próximas provas: confirmar é um clique (E85) — */}
            {dados!.provas.length > 0 && (
              <section className="bg-card border rounded-lg p-6 shadow-sm space-y-4">
                <h2 className="font-serif text-2xl">Suas próximas provas</h2>
                <ul className="space-y-2">
                  {dados!.provas.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 text-sm">
                      <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                      <span className="capitalize">
                        {dataHoraFmt.format(new Date(p.inicio))}
                      </span>
                      {p.confirmadoEm ? (
                        <Badge variant="secondary" className="ml-auto">
                          Confirmada
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          disabled={confirmarProva.isPending}
                          onClick={() =>
                            confirmarProva.mutate({ atendimentoId: p.id, params })
                          }
                          data-testid={`confirmar-prova-${p.id}`}
                        >
                          Confirmar presença
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Confirmar avisa o atelier que você vem. Precisa remarcar? É só avisar a sua
                  vendedora no WhatsApp.
                </p>
              </section>
            )}

            {/* — O lookbook (E21) — */}
            {dados!.lookbook && dados!.lookbook.vestidos.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-center font-serif text-2xl">
                  Os vestidos que você provou
                </h2>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {dados!.lookbook.vestidos.map((v) => (
                    <figure
                      key={v.vestidoId}
                      className="overflow-hidden rounded-lg border bg-card"
                    >
                      {v.fotos.length > 0 ? (
                        <div
                          className={`grid ${v.fotos.length > 1 ? "grid-cols-2" : ""} gap-px`}
                        >
                          {v.fotos.map((f) => (
                            <img
                              key={f.ordem}
                              src={fotoUrl(
                                token!,
                                v.vestidoId,
                                f.ordem,
                                String(f.atualizadaEm),
                              )}
                              alt={v.nome}
                              loading="lazy"
                              className="aspect-[3/4] w-full object-cover"
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex aspect-[3/4] items-center justify-center text-sm text-muted-foreground">
                          Sem foto
                        </div>
                      )}
                      <figcaption className="space-y-1 p-3 text-center">
                        <p className="font-serif text-lg">{v.nome}</p>
                        <p className="text-sm font-medium text-primary">
                          R$ {brl(v.precoBase)}
                        </p>
                        {v.atributos.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {v.atributos
                              .map((a) => `${a.atributo}: ${a.valor}`)
                              .join(" · ")}
                          </p>
                        )}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}

            {/* — O extrato (só leitura; pagar continua com a loja) — */}
            {dados!.parcelas.length > 0 && (
              <section className="bg-card border rounded-lg p-6 shadow-sm space-y-4">
                <h2 className="font-serif text-2xl">Suas parcelas</h2>
                <ul className="divide-y">
                  {dados!.parcelas.map((p) => {
                    const paga = p.status === "PAGA";
                    return (
                      <li
                        key={p.numero}
                        className="flex items-baseline justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm">
                            {p.descricao ||
                              (p.numero === 0
                                ? "Entrada/sinal"
                                : `Parcela ${p.numero}`)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {paga
                              ? ROTULO_PARCELA[p.status]
                              : `Vence em ${dataFmt.format(new Date(p.vencimento))} · ${
                                  ROTULO_PARCELA[p.status] ?? p.status
                                }`}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-sm tabular-nums ${
                            paga ? "text-muted-foreground line-through" : ""
                          }`}
                        >
                          R$ {brl(p.valorPrevisto)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Para pagar ou combinar valores, fale com a sua vendedora —
                  este extrato é só para você acompanhar.
                </p>
              </section>
            )}

            <p className="text-center text-xs text-muted-foreground">
              Dúvidas? É só responder à sua vendedora no WhatsApp.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
