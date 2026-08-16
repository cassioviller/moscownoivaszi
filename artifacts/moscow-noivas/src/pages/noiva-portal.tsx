import { useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPortal,
  getGetPortalQueryKey,
  useAceitarPortal,
  useConfirmarProvaPortal,
  usePedirRemarcacaoPortal,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  CalendarDays,
  MessageCircle,
  MapPin,
  FileText,
  Clock,
} from "lucide-react";
import { brl, capitalizar, instanteLongo, tipoItemLabel } from "@/lib/formatos";
import { rotuloForma } from "@/lib/financeiro/forma";
import { clausulasDoContrato } from "@/lib/clausulas-do-portal";
import { centavos, linhaDeDesconto, reais } from "@/lib/financeiro/dinheiro";
import { linkWhatsApp, msgDaNoivaParaAtelier } from "@/lib/whatsapp";

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
  MUITAS_TENTATIVAS: "Muitas tentativas em pouco tempo. Espere alguns minutos e abra o link de novo.",
};

const ROTULO_PARCELA: Record<string, string> = {
  PREVISTA: "Em aberto",
  PARCIAL: "Parcialmente paga",
  PAGA: "Paga",
  CANCELADA: "Cancelada",
};

// S30: fica — "segunda-feira, 28 de julho de 2026 às 14:30" é a cerimônia
// completa (dia da semana + data por extenso + hora) que só o portal da noiva
// fala; nenhuma função de `formatos.ts` traz o weekday, e um uso só não paga
// uma régua nova.
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

/**
 * F35/E100 — o portal deixa de ser um beco.
 *
 * A página pedia "fale com a sua vendedora" em três lugares e não tinha um
 * único link para falar com ninguém. A noiva está no navegador, à noite, com
 * uma dúvida sobre a parcela: para perguntar, precisava sair, abrir o WhatsApp
 * e achar uma conversa que pode ser de três meses atrás — ou de uma vendedora
 * que já saiu da loja. É a fricção que decide se ela pergunta agora (e a loja
 * responde amanhã cedo) ou se desiste e liga no meio do atendimento de outra.
 *
 * O número é o da LOJA, nunca o da vendedora: o primeiro é público — está na
 * vitrine —, e o segundo é o telefone pessoal de alguém.
 *
 * **Divergência do plano, registrada:** o épico manda o rodapé SUMIR quando não
 * há telefone. Aqui ele some só quando não há telefone NEM endereço. "Onde eu
 * vou?" é uma segunda pergunta, com uma segunda resposta; apagá-la porque a
 * primeira não tem resposta é punir a noiva pelo cadastro incompleto da loja.
 */
function RodapeDaLoja({
  nome,
  endereco,
  telefone,
  noivaNome,
}: {
  nome: string;
  endereco: string | null;
  telefone: string | null;
  noivaNome: string;
}) {
  const wa = linkWhatsApp(telefone, msgDaNoivaParaAtelier(noivaNome));

  // Sem os dois, não há rodapé a montar — e a frase antiga continua verdadeira:
  // o link chegou por WhatsApp, então há uma conversa para responder.
  if (!wa && !endereco) {
    return (
      <p className="text-muted-foreground text-center text-xs">
        Dúvidas? É só responder à sua vendedora no WhatsApp.
      </p>
    );
  }

  return (
    <footer className="bg-card space-y-3 rounded-lg border p-6 text-center shadow-sm">
      <p className="font-serif text-xl">{nome}</p>
      {endereco && (
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-sm">
          <MapPin className="h-4 w-4 shrink-0" />
          {endereco}
        </p>
      )}
      {wa && (
        <>
          <Button asChild className="w-full sm:w-auto" data-testid="falar-com-a-loja">
            <a href={wa} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              Falar no WhatsApp
            </a>
          </Button>
          <p className="text-muted-foreground text-xs">
            A mensagem já vai com o seu nome — é só enviar.
          </p>
        </>
      )}
    </footer>
  );
}

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

  /**
   * F37 — "não vou poder ir". O gesto vale mais que o de confirmar: ele devolve
   * cabine, vendedora e vestido à loja com antecedência, em vez de com a
   * ausência. A rota registra um PEDIDO — nada é cancelado aqui.
   */
  const pedirRemarcacao = usePedirRemarcacaoPortal({
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
        ) : portal.isError || !dados ? (
          /* S-O16/E181: eram 41 `dados!` nesta página — o maior ninho da
             classe, e ela é a que a NOIVA abre. A guarda entra na pergunta e
             as asserções somem; o pior caso deixa de ser tela em branco. */
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
                          {tipoItemLabel(it.tipo)}
                          {it.quantidade > 1 &&
                            ` · ${it.quantidade}× ${brl(it.valorUnitario)}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums">
                        {brl(it.quantidade * it.valorUnitario)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="space-y-1 border-t pt-3">
                  {/* S-O64/E187: esta linha imprimia o `descontoValor` CRU, e a
                      página pública da MESMA proposta imprime a diferença real
                      desde o O9/E166. Com desconto de R$ 5.000,00 em VALOR
                      sobre R$ 4.800,00 de itens — gravável até o E174 —, a
                      noiva lia "Desconto R$ 5.000,00 · Total R$ 0,00" aqui e
                      "− R$ 4.800,00 · Total R$ 0,00" no outro link. A régua é
                      `linhaDeDesconto`, que já pergunta o `temDesconto`
                      (S-O13/P15) por dentro. */}
                  {(() => {
                    const desc = linhaDeDesconto(
                      centavos(orc.totalBruto),
                      centavos(orc.totalLiquido),
                      orc.descontoTipo,
                      orc.descontoValor,
                    );
                    if (!desc) return null;
                    return (
                      <>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Soma dos itens</span>
                          <span className="tabular-nums">
                            {brl(reais(desc.subtotalC))}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Desconto{desc.rotulo}</span>
                          <span className="tabular-nums">
                            − {brl(reais(desc.abatimentoC))}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                  <div className="flex justify-between font-medium">
                    <span>Total</span>
                    <span className="font-serif text-xl tabular-nums">
                      {brl(orc.totalLiquido)}
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
                        {instanteLongo(orc.aceitoEm)}
                      </span>
                      . A sua vendedora já foi avisada.
                    </span>
                  </div>
                ) : orc.status === "ENVIADO" ? (
                  <div className="space-y-2 border-t pt-3">
                    <Button
                      className="w-full"
                      disabled={aceitar.isPending}
                      /**
                       * S-O7/E166 — a versão vai junto, como no link público.
                       * A sobra do E160 ficou aberta por "a página não exibe
                       * número de versão"; o que protege não é exibir, é
                       * mandar de volta o número que esta página LEU — e ela
                       * o recebe desde sempre no `versaoNumero`.
                       */
                      onClick={() =>
                        aceitar.mutate({
                          params: { ...params, versao: orc.versaoNumero ?? undefined },
                        })
                      }
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
                    Proposta válida até {instanteLongo(orc.validade)}
                    .
                  </p>
                )}
              </section>
            )}

            {/* — As próximas provas: confirmar é um clique (E85) — */}
            {dados.provas.length > 0 && (
              <section className="bg-card border rounded-lg p-6 shadow-sm space-y-4">
                <h2 className="font-serif text-2xl">Suas próximas provas</h2>
                <ul className="space-y-2">
                  {dados.provas.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 text-sm">
                      <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                      <span>{capitalizar(dataHoraFmt.format(new Date(p.inicio)))}</span>
                      {p.confirmadoEm ? (
                        <Badge variant="secondary" className="ml-auto">
                          Confirmada
                        </Badge>
                      ) : p.remarcacaoPedidaEm ? (
                        /* F37: ela já avisou. Sem isto o botão reapareceria e ela
                           clicaria de novo, achando que a primeira vez não valeu. */
                        <Badge variant="outline" className="ml-auto">
                          Avisamos o ateliê
                        </Badge>
                      ) : (
                        <span className="ml-auto flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={confirmarProva.isPending || pedirRemarcacao.isPending}
                            onClick={() =>
                              confirmarProva.mutate({ atendimentoId: p.id, params })
                            }
                            data-testid={`confirmar-prova-${p.id}`}
                          >
                            Confirmar presença
                          </Button>
                          {/* F37: ninguém abre um link para dizer que VAI — abre
                              para dizer que não pode. É este aviso que devolve
                              cabine, vendedora e vestido à loja com
                              antecedência, em vez de com a ausência. */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground"
                            disabled={confirmarProva.isPending || pedirRemarcacao.isPending}
                            onClick={() =>
                              pedirRemarcacao.mutate({ atendimentoId: p.id, params })
                            }
                            data-testid={`remarcar-prova-${p.id}`}
                          >
                            Não vou poder ir
                          </Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Confirmar avisa o ateliê que você vem. Se não puder, avise por aqui — a gente
                  libera o horário e entra em contato para remarcar.
                </p>
              </section>
            )}

            {/* — O lookbook (E21) — */}
            {dados.lookbook && dados.lookbook.vestidos.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-center font-serif text-2xl">
                  Os vestidos que você provou
                </h2>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {dados.lookbook.vestidos.map((v) => (
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
                        {/* S-C21 — o MESMO selo do gêmeo lookbook-publico.tsx:
                            a marca da 12ª é argumento de venda (decisão da
                            dona, 14/08/2026). */}
                        {v.exclusiva && (
                          <p>
                            <span className="inline-block rounded-full border px-2 py-0.5 text-xs tracking-wide">
                              Peça exclusiva
                            </span>
                          </p>
                        )}
                        {/* E127/E4: o preço vivia em text-primary a 2,68:1 —
                            no celular, ao sol, na tela da NOIVA — invisível
                            para a varredura do E8 porque o prettier separou o
                            par em duas linhas. Dinheiro usa a escala money-*,
                            nunca o rosa da marca (o molde é o gêmeo do
                            lookbook, que o E99 já tinha consertado). */}
                        <p className="money-sm">{brl(v.precoBase)}</p>
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

            {/* — F21/E100: o contrato, o documento que ela mais vai querer rever — */}
            {dados.contrato && (
              <section className="bg-card space-y-5 rounded-lg border p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-serif text-2xl">Seu contrato</h2>
                  <span className="text-muted-foreground text-xs">
                    Fechado em {instanteLongo(dados.contrato.fechadoEm)}
                  </span>
                </div>

                <ul className="divide-y">
                  {dados.contrato.itens.map((it, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm">{it.descricao}</p>
                        <p className="text-muted-foreground text-xs">
                          {tipoItemLabel(it.tipo)}
                          {it.quantidade > 1 &&
                            ` · ${it.quantidade}× ${brl(it.valorUnitario)}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums">
                        {brl(it.quantidade * it.valorUnitario)}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Com desconto, a soma dos itens NÃO é o total — e um contrato
                    que não fecha na tela dela é pior que não mostrar itens. */}
                <div className="space-y-1 border-t pt-3">
                  {/* S-O13: e o CONTRATO no portal era o quarto sítio inline —
                      ele não estava na sobra, que nomeava três.
                      S-O64/E187: e era o segundo a imprimir o valor cru. O
                      abatimento do contrato é `totalBruto − valorTotal` — a
                      mesma conta que a tela da loja (`contratos/[id].tsx`) e o
                      PDF que ela assinou já faziam, cada um por sua conta. */}
                  {(() => {
                    const desc = linhaDeDesconto(
                      centavos(dados.contrato.totalBruto),
                      centavos(dados.contrato.valorTotal),
                      dados.contrato.descontoTipo,
                      dados.contrato.descontoValor,
                    );
                    if (!desc) return null;
                    return (
                      <>
                        <div className="text-muted-foreground flex justify-between text-sm">
                          <span>Soma dos itens</span>
                          <span className="tabular-nums">
                            {brl(reais(desc.subtotalC))}
                          </span>
                        </div>
                        <div className="text-muted-foreground flex justify-between text-sm">
                          <span>Desconto{desc.rotulo}</span>
                          <span className="tabular-nums">
                            − {brl(reais(desc.abatimentoC))}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                  <div className="flex justify-between font-medium">
                    <span>Total</span>
                    <span className="font-serif text-xl tabular-nums">
                      {brl(dados.contrato.valorTotal)}
                    </span>
                  </div>
                </div>

                {dados.contrato.dataCasamento && (
                  <p className="text-muted-foreground border-t pt-3 text-sm">
                    Casamento em {instanteLongo(dados.contrato.dataCasamento)}.
                  </p>
                )}

                {/* Âncora crua e não o client gerado: é um download do
                    navegador, como o "Baixar PDF" da tela da loja. */}
                <Button variant="outline" asChild className="w-full sm:w-auto">
                  <a
                    href={`/api/portal/contrato-pdf?token=${encodeURIComponent(token!)}`}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="baixar-contrato-portal"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Baixar o contrato em PDF
                  </a>
                </Button>
              </section>
            )}

            {/* — F39/E100: "O seu vestido" — a fase que o portal não cobria — */}
            {dados.vestido && (
              <section className="bg-card space-y-4 rounded-lg border p-6 shadow-sm">
                <h2 className="font-serif text-2xl">O seu vestido</h2>
                <div className="flex gap-4">
                  {dados.vestido.fotos.length > 0 && (
                    <img
                      src={fotoUrl(
                        token!,
                        dados.vestido.vestidoId,
                        dados.vestido.fotos[0].ordem,
                        String(dados.vestido.fotos[0].atualizadaEm),
                      )}
                      alt={dados.vestido.nome}
                      loading="lazy"
                      className="aspect-[3/4] w-28 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0 space-y-2">
                    <p className="font-serif text-lg">{dados.vestido.nome}</p>
                    {/* A pergunta que ela repete: "que dia eu pego?". Feita a
                        retirada, a promessa vira registro. */}
                    {dados.vestido.retiradaFeitaEm ? (
                      <p className="text-sm">
                        Retirado em{" "}
                        <span className="font-medium">
                          {instanteLongo(dados.vestido.retiradaFeitaEm)}
                        </span>
                        .
                      </p>
                    ) : dados.vestido.retiradaPrevista ? (
                      <p className="text-sm">
                        Retirada combinada para{" "}
                        <span className="font-medium">
                          {instanteLongo(dados.vestido.retiradaPrevista)}
                        </span>
                        .
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        A data da retirada ainda vai ser combinada com você.
                      </p>
                    )}
                    {/* E230/S-C92 — a devolução era a ÚNICA data que a noiva
                        não via, e é dela que a multa da 16ª corre: o PDF já a
                        imprimia e o portal calava. Sem data combinada o portal
                        SILENCIA em vez de prometer "a combinar" — a retirada
                        acima já ocupa esse papel, e duas linhas de "ainda vai
                        ser combinada" seriam moldura. */}
                    {dados.vestido.devolucaoFeitaEm ? (
                      <p className="text-sm" data-testid="devolucao-da-noiva">
                        Devolvido em{" "}
                        <span className="font-medium">
                          {instanteLongo(dados.vestido.devolucaoFeitaEm)}
                        </span>
                        .
                      </p>
                    ) : dados.vestido.devolucaoPrevista ? (
                      <p className="text-sm" data-testid="devolucao-da-noiva">
                        Devolução combinada para{" "}
                        <span className="font-medium">
                          {instanteLongo(dados.vestido.devolucaoPrevista)}
                        </span>
                        .
                      </p>
                    ) : null}
                  </div>
                </div>

                {dados.vestido.ajustes.length > 0 && (
                  <div className="space-y-1.5 border-t pt-3">
                    <p className="text-muted-foreground text-xs uppercase tracking-wider">
                      Ajustes
                    </p>
                    <ul className="space-y-1">
                      {dados.vestido.ajustes.map((a, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          {a.pronto ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Clock className="text-muted-foreground h-4 w-4 shrink-0" />
                          )}
                          <span className="min-w-0">{a.descricao}</span>
                          <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                            {a.pronto ? "Pronto" : "Em andamento"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* — O extrato (só leitura; pagar continua com a loja) — */}
            {dados.parcelas.length > 0 && (
              <section className="bg-card border rounded-lg p-6 shadow-sm space-y-4">
                <h2 className="font-serif text-2xl">Suas parcelas</h2>

                {/* F36/E100 — as duas respostas que ela abre o link para
                    procurar, ACIMA do extrato. Elas estavam a uma soma de
                    distância num carnê de oito linhas lido no celular, e cada
                    uma voltava como mensagem de WhatsApp para a vendedora — o
                    custo exato que o E78 existia para reduzir. */}
                {dados.resumoPagamento && (
                  <div className="bg-muted/40 flex flex-wrap gap-x-8 gap-y-2 rounded-md p-4">
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wider">
                        Falta pagar
                      </p>
                      <p className="font-serif text-2xl tabular-nums">
                        {brl(dados.resumoPagamento.faltaPagar)}
                      </p>
                    </div>
                    {dados.resumoPagamento.proximaEm && (
                      <div>
                        <p className="text-muted-foreground text-xs uppercase tracking-wider">
                          Próxima parcela
                        </p>
                        <p className="text-lg tabular-nums">
                          {brl(dados.resumoPagamento.proximaValor ?? 0)}
                          <span className="text-muted-foreground">
                            {" "}em {instanteLongo(dados.resumoPagamento.proximaEm)}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <ul className="divide-y">
                  {dados.parcelas.map((p) => {
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
                              : `Vence em ${instanteLongo(p.vencimento)} · ${
                                  ROTULO_PARCELA[p.status] ?? p.status
                                }`}
                          </p>
                          {/* E213 — a multa e os juros da cláusula 9ª, na tela
                              que a NOIVA abre. Ela é a devedora: descobrir o
                              acréscimo só quando a vendedora manda a mensagem é
                              a mesma classe de defeito que o E211 fechou do
                              outro lado — o preço que aparece depois do gesto.
                              A conta vem por extenso porque um número maior sem
                              explicação ao lado é o que gera a ligação para a
                              loja. */}
                          {p.mora && (
                            <p
                              className={`text-xs ${p.mora.perdoada ? "text-muted-foreground" : "text-destructive"}`}
                              data-testid={`mora-parcela-${p.numero}`}
                            >
                              {p.mora.explicacao}
                            </p>
                          )}
                        </div>
                        <span
                          className={`shrink-0 text-sm tabular-nums ${
                            paga ? "text-muted-foreground line-through" : ""
                          }`}
                        >
                          {p.mora && !p.mora.perdoada ? brl(p.mora.total) : brl(p.valorPrevisto)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {/* E221 — a cláusula 7ª do contrato que ela assinou: "a
                    LOCADORA deverá fornecer todos os recibos de pagamentos
                    efetuados pelo LOCATÁRIO". O sistema registrava o
                    recebimento desde sempre e ela nunca recebia comprovante de
                    nada — medido na auditoria do papel: zero ocorrências de
                    "recibo" no código.

                    Um por PAGAMENTO, e não por parcela: quem pagou R$ 300,00
                    hoje e R$ 700,00 no mês que vem tem dois papéis, cada um com
                    o seu dia. Âncora crua, como o PDF do contrato. */}
                {dados.recibos.length > 0 && (
                  <div className="space-y-2 border-t pt-4">
                    <h3 className="font-medium">Seus recibos</h3>
                    <ul className="divide-y">
                      {dados.recibos.map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm tabular-nums">{brl(r.valor)}</p>
                            <p className="text-muted-foreground text-xs">
                              {r.parcela} · {instanteLongo(r.pagoEm)}
                              {r.forma ? ` · ${rotuloForma(r.forma)}` : ""}
                            </p>
                            {/* S-C50 — a cláusula 9ª cobrada e NOMEADA. Um
                                pagamento pode quitar a parcela e a multa: sem
                                esta linha ela lê R$ 515,00 de uma parcela de
                                R$ 500,00 e liga para a loja perguntar. */}
                            {r.mora > 0 && (
                              <p className="text-muted-foreground text-xs">
                                {brl(r.valorNaParcela)} nesta parcela +{" "}
                                {brl(r.mora)} de multa, juros e correção (cláusula 9ª)
                              </p>
                            )}
                          </div>
                          <Button variant="outline" size="sm" asChild className="shrink-0">
                            <a
                              href={`/api/portal/recibo-pdf?token=${encodeURIComponent(token!)}&reciboId=${encodeURIComponent(r.id)}`}
                              target="_blank"
                              rel="noreferrer"
                              data-testid="baixar-recibo-portal"
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              Recibo
                            </a>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Para pagar ou combinar valores, fale com a sua vendedora —
                  este extrato é só para você acompanhar.
                </p>
              </section>
            )}

            {/* E230/S-C202 — das seis cláusulas de dinheiro, só a 9ª descia ao
                portal: avaria, atraso, extravio, rescisão e peça exclusiva não
                tinham seção nenhuma aqui, e o manual da noiva passou a
                explicá-las com a tela dela muda. Cada número sai da CONSTANTE
                que a conta usa (`lib/clausulas-do-portal.ts`) — um literal
                escrito aqui viraria a segunda grafia que diverge da conta no
                dia em que a dona mudar a regra. Só com contrato: sem ele, não
                há cláusula valendo sobre a noiva. */}
            {dados.parcelas.length > 0 && (
              <section
                className="bg-card border rounded-lg p-6 shadow-sm space-y-4"
                data-testid="clausulas-do-contrato"
              >
                <h2 className="font-serif text-2xl">O que o seu contrato prevê</h2>
                <ul className="space-y-3">
                  {clausulasDoContrato().map((c) => (
                    <li key={`${c.clausula}-${c.titulo}`}>
                      <p className="text-sm font-medium">
                        {c.titulo}{" "}
                        <span className="text-muted-foreground text-xs">(cláusula {c.clausula})</span>
                      </p>
                      <p className="text-muted-foreground text-sm">{c.texto}</p>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Esses são os termos gerais do contrato que você assinou — os valores do seu
                  caso aparecem nas parcelas acima e com a sua vendedora.
                </p>
              </section>
            )}

            {/* — F35/E100: o caminho de volta — */}
            <RodapeDaLoja
              nome={dados.lojaNome}
              endereco={dados.lojaEndereco}
              telefone={dados.lojaTelefone}
              noivaNome={dados.noivaNome}
            />
          </>
        )}
      </div>
    </div>
  );
}
