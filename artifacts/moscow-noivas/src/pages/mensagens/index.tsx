import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  useListAtendimentos,
  getListAtendimentosQueryKey,
  useRegistrarContatoAtendimento,
  useDesfazerContatoAtendimento,
  useListParcelas,
  getListParcelasQueryKey,
  useListOrcamentos,
  getListOrcamentosQueryKey,
  useCreateRegistroCobranca,
  useDesfazerRegistroCobranca,
  getListRegistrosCobrancaQueryKey,
  useListPortais,
  getListPortaisQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SemWhatsApp } from "@/components/sem-whatsapp";
import { PortalVencido } from "@/components/portal-vencido";
import { Button } from "@/components/ui/button";
import { Carregando, Erro } from "@/components/estado";
import { estadoDasConsultas } from "@/lib/estado-consulta";
import { MessageCircle, CalendarCheck, HandCoins, FileClock, Undo2 } from "lucide-react";
import { format } from "date-fns";
import { podeNoModulo } from "@/lib/permissoes";
import {
  linkWhatsApp,
  msgConfirmacaoAtendimento,
  msgCobranca,
  msgOrcamentoVencendo,
} from "@/lib/whatsapp";
import { agingDeParcelas } from "@/lib/financeiro/cobranca";
import { hojeLocal, addDias, diaLocal } from "@/lib/financeiro/datas";
import { urlsDePortalPorLead, leadsComPortalVencido } from "@/lib/portal";
import {
  aContatarNaJanela,
  jaContatadasNaJanela,
  pediramRemarcacaoNaJanela,
  orcamentosVencendoNaJanela,
  comMarcaDeCobranca,
  comRegistroDaCobranca,
  semMarcaDeCobranca,
  particionaPorCobranca,
  marcasPersistentesDeCobranca,
  type MarcasCobranca,
} from "@/lib/mensagens-do-dia";
import { brl, instanteDiaHora, instanteDiaMes } from "@/lib/formatos";

/**
 * E69 — a fila do dia de WhatsApp.
 *
 * Confirmação, cobrança e lembrete de orçamento já existiam — cada um numa
 * tela, cada um esperando alguém lembrar de abrir. Aqui viram UMA fila que a
 * recepcionista desce clicando: as noivas das próximas 48h que ainda não foram
 * procuradas (carimba `contatadoEm` ao abrir o wa.me — E97 separou isso da
 * confirmação DELA), as noivas em atraso com a mensagem que cita a dívida (E29)
 * e os orçamentos enviados vencendo em 72h.
 * É o máximo de automação possível sem API externa — o clique é humano, a
 * preparação é toda do sistema.
 */

export default function MensagensDoDia() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos, session } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const veAgenda = podeNoModulo(acessosModulos, "agenda", "ver");
  const veFinanceiro = podeNoModulo(acessosModulos, "financeiro", "ver");
  const veLeads = podeNoModulo(acessosModulos, "leads", "ver");
  // O registro de cobrança é gateado por `leads` no servidor: sem a permissão,
  // o clique abre o WhatsApp como sempre — sem marcar o que não vai gravar.
  const registraCobranca = podeNoModulo(acessosModulos, "leads", "criar");

  // E83: a fila pede os recortes, não a história — a janela de 48h dos
  // atendimentos (o corte fino por hora continua no cliente), as parcelas
  // ABERTAS (o aging nunca olhou as pagas) e os orçamentos ENVIADOS.
  const janela48h = { de: hojeLocal(), ate: addDias(hojeLocal(), 2) };
  const atendimentos = useListAtendimentos(activeLojaId!, janela48h, {
    query: {
      queryKey: getListAtendimentosQueryKey(activeLojaId!, janela48h),
      enabled: !!activeLojaId && veAgenda,
    },
  });
  const registrarContato = useRegistrarContatoAtendimento({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) }),
    },
  });
  const desfazerContato = useDesfazerContatoAtendimento({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) }),
    },
  });
  const paramsAbertas = { status: "abertas" as const };
  const parcelas = useListParcelas(activeLojaId!, paramsAbertas, {
    query: {
      queryKey: getListParcelasQueryKey(activeLojaId!, paramsAbertas),
      enabled: !!activeLojaId && veFinanceiro,
    },
  });
  const paramsEnviados = { status: "ENVIADO" as const };
  const orcamentos = useListOrcamentos(activeLojaId!, paramsEnviados, {
    query: {
      queryKey: getListOrcamentosQueryKey(activeLojaId!, paramsEnviados),
      enabled: !!activeLojaId && veLeads,
    },
  });

  // E84: os portais num lote — cada mensagem leva o link quando o portal da
  // noiva está vivo. O gate é `leads.ver`: sem ele o mapa fica vazio e as
  // mensagens saem como sempre saíram.
  const portais = useListPortais(activeLojaId!, {
    query: { queryKey: getListPortaisQueryKey(activeLojaId!), enabled: !!activeLojaId && veLeads },
  });
  const portalUrls = useMemo(() => urlsDePortalPorLead(portais.data), [portais.data]);
  /**
   * F38: quem some do mapa acima porque o link VENCEU. Sem isto, a mensagem
   * sai sem a última linha e ninguém fica sabendo — nem a noiva, que recebe uma
   * cobrança sem o extrato que a explica, nem a vendedora, que acha que mandou
   * o link. É o mesmo veredito do selo "Expirado" da ficha, agora numa régua só.
   */
  const portaisVencidos = useMemo(() => leadsComPortalVencido(portais.data), [portais.data]);

  const lojaAtiva = session?.lojas?.find((l) => l.id === activeLojaId);

  /**
   * E97/F6 — a fila de quem a loja ainda NÃO procurou nas próximas 48h.
   *
   * Antes o filtro era `a.confirmadoEm`, e o clique daqui escrevia nesse mesmo
   * campo: a linha saía da fila no instante em que alguém ABRIA o WhatsApp —
   * antes de escrever, antes de enviar — e ficava indistinguível de uma noiva
   * que tinha confirmado pelo portal. Agora o clique carimba `contatadoEm`, que
   * é o que de fato aconteceu, e quem respondeu de verdade também sai da fila
   * (não há o que perguntar a ela).
   */
  const aContatar = useMemo(
    () => aContatarNaJanela(atendimentos.data ?? [], Date.now()),
    [atendimentos.data],
  );

  /** F37: quem avisou que não pode ir — horário preso à espera de remarcação. */
  const pediramRemarcacao = useMemo(
    () => pediramRemarcacaoNaJanela(atendimentos.data ?? [], Date.now()),
    [atendimentos.data],
  );

  /** Procuradas nas 48h e ainda sem resposta — a linha que o desfazer atende. */
  const jaContatadas = useMemo(
    () => jaContatadasNaJanela(atendimentos.data ?? [], Date.now()),
    [atendimentos.data],
  );

  /**
   * F26/E97 — cobrar pela fila do dia deixa rastro; E123 fez o mesmo valer na
   * porta irmã (`/financeiro/cobranca` carimba no clique desde então — a
   * paridade que este comentário afirmava antes de existir). "Essa noiva foi
   * cobrada?" tem a mesma resposta pelas duas portas, e o relógio de "parado
   * há N dias" do funil zera nas duas.
   *
   * Cuidado (b) do épico: duplo clique não pode gerar duas linhas. As `marcas`
   * guardam os leads já registrados nesta sessão de tela — o servidor não tem
   * como saber que dois POSTs a um segundo de distância são o mesmo dedo. O
   * E123 fez o dedup render juros: a marca virou o estado visual da fila (a
   * linha sai, com desfazer — o desenho da seção irmã, 20 linhas acima).
   */
  const [marcas, setMarcas] = useState<MarcasCobranca>(new Map());
  const criarRegistroCobranca = useCreateRegistroCobranca({
    mutation: {
      onSuccess: (_registro, vars) => {
        queryClient.invalidateQueries({ queryKey: getListParcelasQueryKey(activeLojaId!) });
        queryClient.invalidateQueries({
          queryKey: getListRegistrosCobrancaQueryKey(activeLojaId!, vars.leadId),
        });
      },
    },
  });
  const registrarCobranca = (leadId: string) => {
    if (!registraCobranca || marcas.has(leadId)) return;
    setMarcas((m) => comMarcaDeCobranca(m, leadId, new Date().toISOString()));
    criarRegistroCobranca.mutate(
      {
        lojaId: activeLojaId!,
        leadId,
        data: {
          data: new Date().toISOString(),
          canal: "WHATSAPP",
          observacao: "mensagem de cobrança enviada pela fila do dia",
        },
      },
      {
        onSuccess: (registro) => setMarcas((m) => comRegistroDaCobranca(m, leadId, registro.id)),
        // O wa.me abriu, o rastro não: a linha VOLTA para a fila — marcá-la de
        // cobrada sem registro seria afirmar o que não aconteceu.
        onError: () => {
          setMarcas((m) => semMarcaDeCobranca(m, leadId));
          toast({ title: "Não deu para registrar a cobrança", variant: "destructive" });
        },
      },
    );
  };

  /**
   * O desfazer da cobrança (E123/B3). O DELETE leva o registro embora com
   * rastro na trilha; só então a linha volta — desfazer otimista deixaria a
   * fila dizer "falta cobrar" com o registro ainda de pé.
   */
  const desfazerRegistro = useDesfazerRegistroCobranca({
    mutation: {
      onSuccess: (_res, vars) => {
        queryClient.invalidateQueries({ queryKey: getListParcelasQueryKey(activeLojaId!) });
        queryClient.invalidateQueries({
          queryKey: getListRegistrosCobrancaQueryKey(activeLojaId!, vars.leadId),
        });
      },
    },
  });
  const desfazerCobranca = (leadId: string) => {
    const marca = marcas.get(leadId);
    if (!marca?.registroId) return;
    desfazerRegistro.mutate(
      { lojaId: activeLojaId!, leadId, registroId: marca.registroId },
      {
        onSuccess: () => setMarcas((m) => semMarcaDeCobranca(m, leadId)),
        onError: () => toast({ title: "Não deu para desfazer a cobrança", variant: "destructive" }),
      },
    );
  };

  // A mesma régua da tela de cobrança (financeiro-core) — piores primeiro.
  const inadimplentes = useMemo(() => {
    const aging = agingDeParcelas(parcelas.data ?? []);
    return [...aging.noivas].sort((a, b) => b.diasMaisAntigo - a.diasMaisAntigo);
  }, [parcelas.data]);

  /**
   * E123/B3 + S-D13 — a fila em duas: quem falta e quem já saiu. A marca vem
   * de DUAS fontes fundidas: o `ultimoContatoEm` que a parcela embute (o que
   * sobreviveu ao F5 — desta sessão, de ontem à noite por outra pessoa, tanto
   * faz: se caiu no dia de hoje da loja, já foi procurada) e a marca desta
   * sessão de tela, que chega por cima porque é a única que carrega o
   * `registroId` do desfazer. Depois do desfazer, a invalidação recarrega as
   * parcelas e a metade persistente se corrige sozinha.
   */
  const filaCobranca = useMemo(() => {
    const persistentes = marcasPersistentesDeCobranca(inadimplentes, hojeLocal(), diaLocal);
    return particionaPorCobranca(inadimplentes, new Map([...persistentes, ...marcas]));
  }, [inadimplentes, marcas]);

  // Orçamentos ENVIADOS com validade nas próximas 72h (ainda não vencidos).
  const orcamentosVencendo = useMemo(
    () => orcamentosVencendoNaJanela(orcamentos.data?.itens ?? [], hojeLocal()),
    [orcamentos.data],
  );

  // Quem já foi cobrada nesta sessão não é mais "mensagem pronta para enviar".
  const totalFila = aContatar.length + filaCobranca.aCobrar.length + orcamentosVencendo.length;

  /**
   * E121/C1 — a fila disparava 4 queries e lia zero vezes isLoading/isError:
   * numa oscilação de rede o cabeçalho afirmava "Fila vazia — ninguém
   * esperando mensagem", a recepcionista fechava a tela e as confirmações das
   * 48h não saíam. O estado das TRÊS consultas que enchem seções entra no
   * cabeçalho; `portais` fica de fora de propósito — ele só enriquece a
   * mensagem com o link do portal, e a fila inteira funciona sem ele.
   * Consulta desligada por permissão não conta (é o contrato do helper).
   */
  const estadoFila = estadoDasConsultas(atendimentos, parcelas, orcamentos);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif">Mensagens de hoje</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {estadoFila === "carregando"
            ? "Contando a fila do dia…"
            : estadoFila === "erro"
              ? "Parte da fila não carregou — o erro e a saída estão na seção."
              : totalFila === 0
                ? "Fila vazia — ninguém esperando mensagem."
                : `${totalFila} mensagem${totalFila === 1 ? "" : "s"} pronta${totalFila === 1 ? "" : "s"} para enviar. Desça a fila clicando.`}
        </p>
      </div>

      {/* F37/E100 — quem AVISOU que não pode ir vem primeiro na tela.
          Não é uma mensagem a enviar: é um horário preso que a loja pode
          devolver — cabine, hora da vendedora e vestido separado. Quanto antes
          se remarca, mais chance de outra noiva usar aquele horário. */}
      {veAgenda && pediramRemarcacao.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarCheck className="h-5 w-5 text-primary" />
              Pediram para remarcar — {pediramRemarcacao.length}
            </CardTitle>
            <CardDescription>
              Elas avisaram pelo portal que não podem vir. O horário continua
              preso até alguém remarcar ou cancelar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {pediramRemarcacao.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-sm">
                    <span className="tabular-nums text-muted-foreground">
                      {instanteDiaHora(a.inicio)}
                    </span>{" "}
                    {a.lead?.noivaNome ?? "Noiva"}
                    <span className="text-muted-foreground">
                      {" "}· avisou {instanteDiaHora(a.remarcacaoPedidaEm!)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {linkWhatsApp(a.lead?.whatsapp, "") && (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={linkWhatsApp(a.lead?.whatsapp, "")!}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="mr-1 h-4 w-4" />
                          Falar
                        </a>
                      </Button>
                    )}
                    <Button asChild size="sm">
                      <Link to={`/loja/${lojaId}/atendimentos/novo?noiva=${a.leadId}&tipo=PROVA`}>
                        Remarcar
                      </Link>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {veAgenda && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarCheck className="h-5 w-5 text-primary" />
              Procurar para confirmar — próximas 48h
            </CardTitle>
            <CardDescription>
              Abrir o WhatsApp registra que <strong>você procurou</strong> e tira a linha da fila.
              Quem confirma a presença é a noiva, pelo link do portal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* E121/C1 — "já foram procuradas" é afirmação; carregando e erro
                não podem sair com a mesma cara dela. */}
            {atendimentos.isError ? (
              <Erro
                titulo="A agenda das próximas 48h não carregou"
                erro={atendimentos.error}
                onTentarNovamente={() => void atendimentos.refetch()}
              />
            ) : atendimentos.isLoading ? (
              <Carregando linhas={3} />
            ) : aContatar.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todas as noivas das próximas 48h já foram procuradas.</p>
            ) : (
              <ul className="divide-y">
                {aContatar.map((a) => {
                  const wa = linkWhatsApp(
                    a.lead?.whatsapp,
                    msgConfirmacaoAtendimento({
                      noivaNome: a.lead?.noivaNome,
                      tipo: a.tipo,
                      inicio: a.inicio,
                      lojaNome: lojaAtiva?.nome,
                      endereco: lojaAtiva?.endereco,
                      portalUrl: portalUrls.get(a.leadId),
                    }),
                  );
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0 truncate text-sm">
                        <span className="tabular-nums text-muted-foreground">
                          {instanteDiaHora(a.inicio)}
                        </span>{" "}
                        {a.lead?.noivaNome ?? "Noiva"} —{" "}
                        {a.tipo === "PROVA" ? "Prova" : "Atendimento"}
                      </span>
                      {wa ? (
                        <span className="flex shrink-0 items-center gap-1">
                          {portaisVencidos.has(a.leadId) && <PortalVencido leadId={a.leadId} />}
                          <Button asChild variant="outline" size="sm">
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() =>
                                registrarContato.mutate({
                                  lojaId: activeLojaId!,
                                  atendimentoId: a.id,
                                })
                              }
                            >
                              <MessageCircle className="mr-1 h-4 w-4" />
                              Chamar no WhatsApp
                            </a>
                          </Button>
                        </span>
                      ) : (
                        <SemWhatsApp leadId={a.leadId} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* O desfazer (F6). O carimbo nasce do clique num link que abre
                OUTRA ABA: errar o botão é barato, e sem esta lista a noiva saía
                da fila sem ninguém ter falado com ela — em silêncio, e sem tela
                nenhuma que voltasse atrás. */}
            {jaContatadas.length > 0 && (
              <div className="mt-4 space-y-1.5 border-t pt-3">
                <p className="text-muted-foreground text-xs uppercase tracking-wider">
                  Já procuradas, sem resposta
                </p>
                {jaContatadas.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="text-muted-foreground tabular-nums">
                        {instanteDiaHora(a.inicio)}
                      </span>{" "}
                      {a.lead?.noivaNome ?? "Noiva"}
                      <span className="text-muted-foreground">
                        {" "}· procurada {instanteDiaHora(a.contatadoEm!)}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() =>
                        desfazerContato.mutate({ lojaId: activeLojaId!, atendimentoId: a.id })
                      }
                      disabled={desfazerContato.isPending}
                    >
                      <Undo2 className="mr-1 h-4 w-4" />
                      Não procurei
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {veFinanceiro && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HandCoins className="h-5 w-5 text-primary" />
              Lembrar de um valor em aberto
            </CardTitle>
            <CardDescription>
              A mensagem cita o valor e o atraso.{" "}
              <Link
                to={`/loja/${lojaId}/financeiro/cobranca`}
                className="text-primary-texto underline underline-offset-4"
              >
                Ver a cobrança completa
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            {parcelas.isError ? (
              <Erro
                titulo="As parcelas em aberto não carregaram"
                erro={parcelas.error}
                onTentarNovamente={() => void parcelas.refetch()}
              />
            ) : parcelas.isLoading ? (
              <Carregando linhas={3} />
            ) : inadimplentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém em atraso.</p>
            ) : filaCobranca.aCobrar.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todas as noivas em atraso já foram cobradas.
              </p>
            ) : (
              <ul className="divide-y">
                {filaCobranca.aCobrar.map((n) => {
                  const wa = linkWhatsApp(
                    n.whatsapp,
                    msgCobranca({
                      noivaNome: n.noivaNome,
                      totalVencido: n.totalVencido,
                      diasMaisAntigo: n.diasMaisAntigo,
                      lojaNome: lojaAtiva?.nome,
                      portalUrl: portalUrls.get(n.leadId),
                    }),
                  );
                  return (
                    <li key={n.leadId ?? n.contratoId} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0 truncate text-sm">
                        {n.noivaNome ?? "Noiva"}{" "}
                        <span className="text-muted-foreground">
                          · {brl(n.totalVencido)} · há {n.diasMaisAntigo} dia
                          {n.diasMaisAntigo === 1 ? "" : "s"}
                        </span>
                      </span>
                      {wa ? (
                        <span className="flex shrink-0 items-center gap-1">
                          {n.leadId && portaisVencidos.has(n.leadId) && (
                            <PortalVencido leadId={n.leadId} />
                          )}
                          <Button asChild variant="outline" size="sm">
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => n.leadId && registrarCobranca(n.leadId)}
                            >
                              <MessageCircle className="mr-1 h-4 w-4" />
                              WhatsApp
                            </a>
                          </Button>
                        </span>
                      ) : (
                        <SemWhatsApp leadId={n.leadId} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* E123/B3 — o que já saiu, com o desfazer. O desenho é o da seção
                irmã ("Já procuradas, sem resposta"): o registro nasce do clique
                num link que abre OUTRA ABA, errar é barato, e sem esta lista a
                recepcionista interrompida relia a fila inteira — ou cobrava a
                mesma noiva duas vezes (o dedup protege o banco, não a conversa). */}
            {filaCobranca.cobradas.length > 0 && (
              <div className="mt-4 space-y-1.5 border-t pt-3">
                <p className="text-muted-foreground text-xs uppercase tracking-wider">
                  Já cobradas
                </p>
                {filaCobranca.cobradas.map(({ noiva: n, marca }) => (
                  <div
                    key={n.leadId}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {n.noivaNome ?? "Noiva"}
                      <span className="text-muted-foreground">
                        {" "}· {brl(n.totalVencido)} · cobrada {instanteDiaHora(marca.quando)}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => n.leadId && desfazerCobranca(n.leadId)}
                      disabled={!marca.registroId || desfazerRegistro.isPending}
                    >
                      <Undo2 className="mr-1 h-4 w-4" />
                      Não cobrei
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {veLeads && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileClock className="h-5 w-5 text-primary" />
              Orçamentos vencendo — próximas 72h
            </CardTitle>
            <CardDescription>
              O lembrete gentil antes de a validade passar em silêncio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {orcamentos.isError ? (
              <Erro
                titulo="Os orçamentos enviados não carregaram"
                erro={orcamentos.error}
                onTentarNovamente={() => void orcamentos.refetch()}
              />
            ) : orcamentos.isLoading ? (
              <Carregando linhas={3} />
            ) : orcamentosVencendo.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum orçamento vencendo.</p>
            ) : (
              <ul className="divide-y">
                {orcamentosVencendo.map((o) => {
                  const wa = linkWhatsApp(
                    o.lead?.whatsapp,
                    msgOrcamentoVencendo({
                      noivaNome: o.lead?.noivaNome,
                      validade: o.validade!,
                      lojaNome: lojaAtiva?.nome,
                      portalUrl: portalUrls.get(o.leadId),
                    }),
                  );
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0 truncate text-sm">
                        <Link
                          to={`/loja/${lojaId}/orcamentos/${o.id}`}
                          className="hover:underline"
                        >
                          {o.lead?.noivaNome ?? "Noiva"}
                        </Link>{" "}
                        <span className="text-muted-foreground">
                          · vence {instanteDiaMes(o.validade!)}
                        </span>
                      </span>
                      {wa ? (
                        <span className="flex shrink-0 items-center gap-1">
                          {portaisVencidos.has(o.leadId) && <PortalVencido leadId={o.leadId} />}
                          <Button asChild variant="outline" size="sm">
                            <a href={wa} target="_blank" rel="noopener noreferrer">
                              <MessageCircle className="mr-1 h-4 w-4" />
                              WhatsApp
                            </a>
                          </Button>
                        </span>
                      ) : (
                        <SemWhatsApp leadId={o.leadId} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
