import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useListAtendimentos,
  getListAtendimentosQueryKey,
  useConfirmarAtendimento,
  useListParcelas,
  getListParcelasQueryKey,
  useListOrcamentos,
  getListOrcamentosQueryKey,
  useListPortais,
  getListPortaisQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, CalendarCheck, HandCoins, FileClock } from "lucide-react";
import { format } from "date-fns";
import { podeNoModulo } from "@/lib/permissoes";
import {
  linkWhatsApp,
  msgConfirmacaoAtendimento,
  msgCobranca,
  msgOrcamentoVencendo,
} from "@/lib/whatsapp";
import { agingDeParcelas } from "@/lib/financeiro/cobranca";
import { hojeLocal, addDias } from "@/lib/financeiro/datas";
import { urlsDePortalPorLead } from "@/lib/portal";
import { brl } from "@/lib/formatos";

/**
 * E69 — a fila do dia de WhatsApp.
 *
 * Confirmação, cobrança e lembrete de orçamento já existiam — cada um numa
 * tela, cada um esperando alguém lembrar de abrir. Aqui viram UMA fila que a
 * recepcionista desce clicando: presenças das próximas 48h por confirmar
 * (carimba `confirmadoEm` ao abrir o wa.me, E39), as noivas em atraso com a
 * mensagem que cita a dívida (E29) e os orçamentos enviados vencendo em 72h.
 * É o máximo de automação possível sem API externa — o clique é humano, a
 * preparação é toda do sistema.
 */

const H48 = 48 * 3_600_000;
const H72 = 72 * 3_600_000;

export default function MensagensDoDia() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos, session } = useAuth();
  const queryClient = useQueryClient();

  const veAgenda = podeNoModulo(acessosModulos, "agenda", "ver");
  const veFinanceiro = podeNoModulo(acessosModulos, "financeiro", "ver");
  const veLeads = podeNoModulo(acessosModulos, "leads", "ver");

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
  const confirmarAtendimento = useConfirmarAtendimento({
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

  const lojaAtiva = session?.lojas?.find((l) => l.id === activeLojaId);

  // Presenças das próximas 48h ainda sem confirmação, mais próximas primeiro.
  const aConfirmar = useMemo(() => {
    const agora = Date.now();
    return (atendimentos.data ?? [])
      .filter((a) => {
        if (a.situacao !== "AGENDADO" || a.confirmadoEm) return false;
        const t = new Date(a.inicio).getTime();
        return t >= agora && t <= agora + H48;
      })
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  }, [atendimentos.data]);

  // A mesma régua da tela de cobrança (financeiro-core) — piores primeiro.
  const inadimplentes = useMemo(() => {
    const aging = agingDeParcelas(parcelas.data ?? []);
    return [...aging.noivas].sort((a, b) => b.diasMaisAntigo - a.diasMaisAntigo);
  }, [parcelas.data]);

  // Orçamentos ENVIADOS com validade nas próximas 72h (ainda não vencidos).
  const orcamentosVencendo = useMemo(() => {
    const agora = Date.now();
    return (orcamentos.data ?? [])
      .filter((o) => {
        if (o.status !== "ENVIADO" || !o.validade) return false;
        const t = new Date(o.validade).getTime();
        return t >= agora && t <= agora + H72;
      })
      .sort((a, b) => new Date(a.validade!).getTime() - new Date(b.validade!).getTime());
  }, [orcamentos.data]);

  const totalFila = aConfirmar.length + inadimplentes.length + orcamentosVencendo.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif">Mensagens de hoje</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {totalFila === 0
            ? "Fila vazia — ninguém esperando mensagem."
            : `${totalFila} mensagem${totalFila === 1 ? "" : "s"} pronta${totalFila === 1 ? "" : "s"} para enviar. Desça a fila clicando.`}
        </p>
      </div>

      {veAgenda && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarCheck className="h-5 w-5 text-primary" />
              Confirmar presença — próximas 48h
            </CardTitle>
            <CardDescription>
              Abrir o WhatsApp já carimba a confirmação; a linha sai da fila.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aConfirmar.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todas as presenças confirmadas.</p>
            ) : (
              <ul className="divide-y">
                {aConfirmar.map((a) => {
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
                          {format(new Date(a.inicio), "dd/MM HH:mm")}
                        </span>{" "}
                        {a.lead?.noivaNome ?? "Noiva"} —{" "}
                        {a.tipo === "PROVA" ? "Prova" : "Atendimento"}
                      </span>
                      {wa ? (
                        <Button asChild variant="outline" size="sm" className="shrink-0">
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                              confirmarAtendimento.mutate({
                                lojaId: activeLojaId!,
                                atendimentoId: a.id,
                              })
                            }
                          >
                            <MessageCircle className="mr-1 h-4 w-4" />
                            Confirmar
                          </a>
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="font-normal">Sem WhatsApp</Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
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
                className="text-primary underline underline-offset-4"
              >
                Ver a cobrança completa
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            {inadimplentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém em atraso.</p>
            ) : (
              <ul className="divide-y">
                {inadimplentes.map((n) => {
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
                          · R$ {brl(n.totalVencido)} · há {n.diasMaisAntigo} dia
                          {n.diasMaisAntigo === 1 ? "" : "s"}
                        </span>
                      </span>
                      {wa ? (
                        <Button asChild variant="outline" size="sm" className="shrink-0">
                          <a href={wa} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="mr-1 h-4 w-4" />
                            WhatsApp
                          </a>
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="font-normal">Sem WhatsApp</Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
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
            {orcamentosVencendo.length === 0 ? (
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
                          · vence {format(new Date(o.validade!), "dd/MM")}
                        </span>
                      </span>
                      {wa ? (
                        <Button asChild variant="outline" size="sm" className="shrink-0">
                          <a href={wa} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="mr-1 h-4 w-4" />
                            WhatsApp
                          </a>
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="font-normal">Sem WhatsApp</Badge>
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
