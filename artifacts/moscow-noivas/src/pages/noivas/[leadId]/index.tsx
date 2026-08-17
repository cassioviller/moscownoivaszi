import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetLead,
  getGetLeadQueryKey,
  useGetLocacaoDoLead,
  getGetLocacaoDoLeadQueryKey,
  useUpdateLead,
  getListLeadsQueryKey,
  useListOrcamentos,
  getListOrcamentosQueryKey,
  useCreateOrcamento,
  useListContratos,
  getListContratosQueryKey,
  useListAtendimentos,
  getListAtendimentosQueryKey,
  useListReservas,
  getListReservasQueryKey,
  useUpdateReserva,
  type LeadUpdatePerdidaMotivo,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { HistoricoContato } from "@/components/historico-contato";
import { Erro, NaoEncontrado } from "@/components/estado";
import { CabecalhoDetalhe } from "@/components/cabecalho-detalhe";
import { LookbookNoiva } from "./lookbook";
import { PortalNoiva } from "./portal";
import { SemLista } from "./sem-lista";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Plus, Pencil, CalendarPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { brl, diaMesAno, etapaLabel, perdidaMotivoLabel, PERDIDA_MOTIVO_LABELS, ROTULO_ORIGEM, instanteCurto, instanteDia, instanteDiaHora } from "@/lib/formatos";
import { faltasDaQualificacao as calcularFaltas, estadoCivilLabel, enderecoDaNoiva } from "@/lib/qualificacao";
import { podeNoModulo } from "@/lib/permissoes";
import { SeloProvaOrfa } from "@/components/selo-prova-orfa";
import { SeloProvaForaDaJanela } from "@/components/selo-prova-fora-da-janela";
import { ehNaoEncontrado, mensagemApi } from "@/lib/erro-api";
import { proximoPasso } from "@/lib/proximo-passo";
import { contratoAtivoDaNoiva } from "@/lib/contrato-ativo-da-noiva";
import { locacaoDaNoiva } from "@/lib/locacao-da-noiva";
import { proximaVisita } from "@/lib/proxima-visita";
import { estadoDasConsultas, estadoDoCard } from "@/lib/estado-consulta";
import { abertoEmCentavos } from "@/lib/financeiro/forma";
import { reais } from "@/lib/financeiro/dinheiro";
import { diaLocal, diaDeNegocio } from "@/lib/financeiro/datas";
import { useDiaLocal } from "@/hooks/use-dia-local";
import {
  dataLongaFmt,
  diasAteCasamento,
  rotuloContagem,
  casamentoUrgente,
} from "../helpers";
import { linkWhatsApp } from "@/lib/whatsapp";
import { reservasForaDaData } from "@/lib/reservas-fora-da-data";
import { reajustePrevisto } from "@/lib/reajuste-da-troca";

const STATUS_ORCAMENTO: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
};
const STATUS_CONTRATO: Record<string, string> = { ATIVO: "Ativo", CANCELADO: "Cancelado" };

/** Linha de dado discreta (rótulo pequeno + valor). Não renderiza se vazio. */
function Dado({
  rotulo,
  valor,
  testid,
}: {
  rotulo: string;
  valor: string | null | undefined;
  testid?: string;
}) {
  if (!valor) return null;
  return (
    <div {...(testid ? { "data-testid": testid } : {})}>
      <span className="block text-xs uppercase tracking-wider text-muted-foreground">{rotulo}</span>
      <span className="text-sm">{valor}</span>
    </div>
  );
}

/**
 * Perfil concierge da noiva (porte da /noivas/[leadId] do feat/orcamentos):
 * quem ela é, o casamento, contato, orçamentos, contratos e interesses.
 */
export default function NoivaDetalhe() {
  const { lojaId, leadId } = useParams();
  const { activeLojaId, acessosModulos, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: lead, isLoading, isError, error, refetch } = useGetLead(activeLojaId!, leadId!, {
    query: {
      queryKey: getGetLeadQueryKey(activeLojaId!, leadId!),
      enabled: !!activeLojaId && !!leadId,
    },
  });

  /**
   * S-O38 — o hash traz para o card certo, e é o que faz os botões "Lookbook"
   * da barra de atendimento e da fila cumprirem o que prometem.
   *
   * Eles apontavam a rota `/noivas/:leadId/lookbook`, que **nunca existiu** — o
   * lookbook é um card desta ficha. Os dois caíam no catch-all e a vendedora
   * lia "Não encontramos esta página" com a noiva do lado. Agora eles vêm para
   * cá com `#lookbook`, e a ficha rola até o card.
   *
   * O efeito espera o `lead` porque os cards só existem depois dele — rolar
   * antes acharia a tela de carregamento. O mesmo gesto do
   * `reservas/[bloqueioId]`, que já rolava até a avaria pelo id.
   */
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash || !lead) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash, lead]);
  // E62: o recorte por noiva acontece no banco (`?leadId=`) — o perfil parou
  // de baixar os orçamentos e contratos da loja inteira para filtrar aqui.
  /**
   * **S-C120 — os dois gates que faltavam, e o servidor já os exigia.**
   *
   * `/orcamentos` e `/contratos` saíram de dentro de `leads` no E172
   * (`orcamentos.ts:250`, `contratos.ts:102`), e esta ficha continuou pedindo os
   * dois a todo mundo. Para a Recepção — `contratos: NADA` — a chamada nasce
   * condenada ao 403, e a resposta recusada virava lista vazia no `?? []` de
   * `:208-209`. É a mesma forma da agenda e das reservas logo abaixo: quem não
   * vê o módulo não dispara a consulta, e o card diz por quê em vez de afirmar
   * um fato que ninguém apurou.
   */
  const podeVerOrcamentos = podeNoModulo(acessosModulos, "orcamentos", "ver");
  const podeVerContratos = podeNoModulo(acessosModulos, "contratos", "ver");
  const orcamentos = useListOrcamentos(activeLojaId!, { leadId: leadId! }, {
    query: {
      queryKey: getListOrcamentosQueryKey(activeLojaId!, { leadId: leadId! }),
      enabled: !!activeLojaId && !!leadId && podeVerOrcamentos,
    },
  });
  const contratos = useListContratos(activeLojaId!, { leadId: leadId! }, {
    query: {
      queryKey: getListContratosQueryKey(activeLojaId!, { leadId: leadId! }),
      enabled: !!activeLojaId && !!leadId && podeVerContratos,
    },
  });
  /**
   * E229/S-C220 — a locação vem da LEITURA ESTREITA, não da lista de
   * contratos: quem atende o telefone é a Recepção, que tem `contratos: NADA`
   * desde o E172 — e era a única pessoa sem acesso ao que a S-C91 entregou em
   * nome dela. A porta vive sob `leads` (o módulo dela) e devolve as duas
   * datas sem um campo de dinheiro. UMA fonte para todos os perfis: a
   * vendedora lê daqui também, senão seriam duas grafias da mesma linha (E187).
   */
  const locacaoLida = useGetLocacaoDoLead(activeLojaId!, leadId!, {
    query: {
      queryKey: getGetLocacaoDoLeadQueryKey(activeLojaId!, leadId!),
      enabled: !!activeLojaId && !!leadId,
    },
  });
  /**
   * E215 — o que falta na ficha para o contrato poder fechar.
   *
   * Derivado do mesmo módulo que a tela do fecho usa (`lib/qualificacao`), que
   * por sua vez é pregado contra o servidor pela
   * `qualificacao-espelha-servidor`. Três telas, uma conta — é a resposta ao
   * formato da S-C47, onde a tela e a porta perguntavam a mesma coisa a fontes
   * diferentes e a tela oferecia o que o 422 recusava.
   */
  const faltasDaQualificacao = calcularFaltas(lead);

  const podeVerAgenda = podeNoModulo(acessosModulos, "agenda", "ver");
  // E125/D3: a pergunta mais frequente do telefone é "que dia é a minha
  // prova?" — a agenda DELA, recortada no banco e com janela de hoje em
  // diante (nunca o histórico). Gate de permissão: quem não vê o módulo
  // agenda não dispara a consulta, e a ficha fica como era.
  //
  // S-RM18: o dia vem do `useDiaLocal()`. A chave congelada em ontem devolve um
  // SUPERCONJUNTO — nada some da agenda dela —, e é por isso que o ganho aqui
  // não é a consulta: é o RENDER. `proximaVisita(agenda.data)` mais abaixo
  // compara `inicio >= new Date()` a cada render, e numa aba que ninguém toca
  // render nenhum acontece; a prova que já começou seguia anunciada como "a
  // próxima". O hook re-renderiza uma vez por virada e a conta refaz-se.
  const hoje = useDiaLocal();
  const paramsAgenda = { leadId: leadId!, de: hoje };
  const agenda = useListAtendimentos(activeLojaId!, paramsAgenda, {
    query: {
      queryKey: getListAtendimentosQueryKey(activeLojaId!, paramsAgenda),
      enabled: !!activeLojaId && !!leadId && podeVerAgenda,
    },
  });
  /**
   * S-O74/E189 — **as reservas dela, para saber se ficaram para trás.**
   *
   * Esta é a consulta que dá o primeiro chamador ao `listReservas`, e o recorte
   * `?leadId=` que ela usa nasceu no E185 (S-O55) sem nenhum. A ficha é o lugar
   * porque é daqui que a data do casamento muda: `noivas/[leadId]/editar.tsx` é
   * o **único** sítio de `artifacts/` que escreve `casamentoData` da noiva, e
   * ele fica a um clique deste card.
   *
   * Gate de `vestidos`: o servidor guarda `/reservas` por esse módulo
   * (`reservas.ts:58`). Quem não vê vestidos não dispara a consulta e a ficha
   * fica como era — a mesma forma da agenda, logo acima.
   */
  const podeVerReservas = podeNoModulo(acessosModulos, "vestidos", "ver");
  const paramsReservas = { leadId: leadId! };
  const reservas = useListReservas(activeLojaId!, paramsReservas, {
    query: {
      queryKey: getListReservasQueryKey(activeLojaId!, paramsReservas),
      enabled: !!activeLojaId && !!leadId && podeVerReservas,
    },
  });
  const createOrcamento = useCreateOrcamento();
  const updateLead = useUpdateLead();
  const updateReserva = useUpdateReserva();

  // Diálogo de perda: motivo estruturado obrigatório, detalhe livre opcional.
  const [perdendo, setPerdendo] = useState(false);
  const [motivoPerda, setMotivoPerda] = useState<LeadUpdatePerdidaMotivo | "">("");
  const [detalhePerda, setDetalhePerda] = useState("");
  /** Qual reserva está sendo movida — o `isPending` do hook não distingue. */
  const [movendo, setMovendo] = useState<string | null>(null);

  const orcamentosDaNoiva = orcamentos.data?.itens ?? [];
  const contratosDaNoiva = contratos.data?.itens ?? [];
  /**
   * S-C120 — o que cada card tem o direito de AFIRMAR, antes de desenhar.
   *
   * As duas listas acima continuam com o `?? []`, e continuam certas: elas são o
   * que se desenha quando a consulta respondeu. O que estava faltando era a
   * pergunta anterior — *ela respondeu?* —, e é isto aqui. Sem ela o vazio
   * fabricado pelo `??` chegava à tela como fato apurado.
   */
  const estadoOrcamentos = estadoDoCard(podeVerOrcamentos, orcamentos);
  const estadoContratos = estadoDoCard(podeVerContratos, contratos);

  const podeEditar = podeNoModulo(acessosModulos, "leads", "editar");
  // F1: agendar é do módulo AGENDA — quem só edita a ficha não marca horário.
  // S-M21 (fecha sítio da S-M9): agendar é CRIAR — o destino (atendimentos/novo)
  // e o servidor concordam. Com editar, a atendente {ver, criar} — quem agenda —
  // não via o atalho do caminho mais percorrido do app, e {ver, editar} via,
  // navegava e era barrada na página seguinte.
  const podeAgendar = podeNoModulo(acessosModulos, "agenda", "criar");
  /**
   * E172 — "Novo orçamento" está NA ficha da noiva e não é da ficha da noiva.
   *
   * O botão pendia de `podeEditar` (`leads.editar`), e errava nos dois eixos:
   * o módulo passou a ser `orcamentos` e a ação sempre foi `criar`. Deixado
   * como estava, a Recepção — que ganhou `leads.editar` para corrigir o
   * telefone que digitou (S-O41) — veria o botão e levaria 403 do servidor.
   *
   * É o S-O40 de novo, uma camada abaixo, e quem o pegou foi a varredura do
   * S36: *"gateia por [agenda,leads] e escreve em [orcamentos]"*.
   */
  const podeCriarOrcamento = podeNoModulo(acessosModulos, "orcamentos", "criar");
  /**
   * S-O74/E189 — mover a reserva é `vestidos.editar`, o que o servidor exige
   * no `PATCH /reservas/:id`. Quem só edita a ficha da noiva LÊ o aviso e não
   * ganha o botão: é a lição do E172 (S-O40), e a varredura do S36 cobra.
   */
  const podeMoverReserva = podeNoModulo(acessosModulos, "vestidos", "editar");

  /**
   * O V5 do CODE-REVIEW, na ficha: *"a noiva muda o casamento de 12/09 para
   * 03/10, a ficha passa a dizer 03/10, o bloqueio fica em 12/09 para sempre"*.
   * A régua é pura e testada (`lib/reservas-fora-da-data.ts`) e devolve `null`
   * quando não há divergência — aviso que aparece sempre vira moldura.
   */
  const avisoDeData = reservasForaDaData(lead?.casamentoData, reservas.data);

  const novoOrcamento = async () => {
    try {
      const criado = await createOrcamento.mutateAsync({
        lojaId: activeLojaId!,
        data: { leadId: leadId! },
      });
      await queryClient.invalidateQueries({ queryKey: getListOrcamentosQueryKey(activeLojaId!) });
      toast({ title: "Orçamento criado", description: "Adicione os itens." });
      navigate(`/loja/${lojaId}/orcamentos/${criado.id}`);
    } catch (err) {
      toast({
        title: "Não deu para criar orçamento",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  /**
   * O gesto que faltava desde o E173: mover a reserva para a data que a ficha
   * já diz. **Uma chamada move tudo** — a reserva é o AGREGADO, e o servidor
   * propaga na mesma transação para todos os bloqueios vinculados e para o
   * contrato ATIVO, com `CONTRATO_DATA_SEGUIU_RESERVA` na trilha.
   *
   * Ele NÃO é efeito colateral de salvar a ficha, e essa é a decisão do épico:
   * o `PATCH /reservas/:id` revalida a disponibilidade de cada peça e pode
   * recusar com **409 `VESTIDO_INDISPONIVEL`** — pendurado no `PATCH /leads`,
   * um vestido ocupado na data nova faria a correção de um TELEFONE falhar.
   * Aqui a recusa chega no gesto que a pediu, com a frase que a explica.
   */
  async function moverReserva(reservaId: string, instante: string, rotulo: string) {
    setMovendo(reservaId);
    try {
      await updateReserva.mutateAsync({
        lojaId: activeLojaId!,
        reservaId,
        data: { casamentoData: instante },
      });
      await queryClient.invalidateQueries({ queryKey: getListReservasQueryKey(activeLojaId!) });
      toast({
        title: "Reserva movida",
        description: `As peças e o contrato ativo passaram para ${rotulo}.`,
      });
    } catch (err) {
      toast({
        title: "Não deu para mover a reserva",
        description: mensagemApi(err, "Tente novamente.", {
          // O 409 da disponibilidade vem com os conflitos e sem `detalhe` —
          // a frase é da tela, como em `atendimentos/novo`.
          VESTIDO_INDISPONIVEL:
            "Alguma peça desta reserva não está livre na data nova — confira a ficha do vestido antes de mover.",
        }),
        variant: "destructive",
      });
    } finally {
      setMovendo(null);
    }
  }

  async function invalidarLead() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(activeLojaId!, leadId!) }),
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey(activeLojaId!) }),
    ]);
  }

  async function marcarPerdida() {
    if (!motivoPerda) {
      toast({ title: "Escolha o motivo", variant: "destructive" });
      return;
    }
    try {
      await updateLead.mutateAsync({
        lojaId: activeLojaId!,
        leadId: leadId!,
        data: {
          etapa: "PERDIDO",
          perdidaMotivo: motivoPerda,
          ...(detalhePerda.trim() ? { perdidaDetalhe: detalhePerda.trim() } : {}),
        },
      });
      await invalidarLead();
      setPerdendo(false);
      setMotivoPerda("");
      setDetalhePerda("");
      toast({ title: "Noiva marcada como perdida" });
    } catch (err) {
      toast({
        title: "Não deu para marcar como perdida",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  async function reativar() {
    try {
      await updateLead.mutateAsync({
        lojaId: activeLojaId!,
        leadId: leadId!,
        data: { etapa: "NOVO" },
      });
      await invalidarLead();
      toast({ title: "Noiva reativada", description: "De volta ao funil, como novo contato." });
    } catch (err) {
      toast({
        title: "Não deu para reativar",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  // E12: 404 não é falha. A ficha de uma noiva que não existe mostrava o mesmo
  // alerta destrutivo de um 500, com "Tentar novamente" — um botão que não pode
  // dar certo, porque a busca vai devolver 404 de novo.
  if (ehNaoEncontrado(error)) {
    return (
      <NaoEncontrado
        titulo="Esta noiva não existe"
        voltarPara={
          <Button variant="outline" size="sm" asChild>
            <Link to={`/loja/${lojaId}/noivas`}>Voltar às noivas</Link>
          </Button>
        }
      />
    );
  }

  if (isError) {
    return (
      <Erro
        titulo="Não deu para carregar a noiva"
        erro={error}
        onTentarNovamente={() => refetch()}
      />
    );
  }

  if (isLoading || !lead) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-12 w-64 bg-muted rounded" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  const dias = lead.casamentoData ? diasAteCasamento(lead.casamentoData, hoje) : null;
  const mostrarContagem = dias !== null && dias >= 0;
  const urgente = dias !== null && casamentoUrgente(dias);
  // S37: a ficha montava `wa.me/${digitos}` com uma régua PRÓPRIA, que aceitava
  // qualquer quantidade de dígitos e nunca prefixava o DDI. As 3 noivas com
  // WhatsApp no banco de dev têm 10–11 dígitos e nenhuma tem 55: o botão daqui
  // mandava para `wa.me/11988887777`, que o WhatsApp lê como DDI 1 (EUA),
  // enquanto /mensagens montava o link certo para o MESMO campo. A régua é uma
  // só, e é a de `lib/whatsapp.ts` — número implausível vira null e o link não
  // é renderizado, que é o comportamento que a tela já sabia tratar.
  const linkZap = linkWhatsApp(lead.whatsapp, "");

  // F5/E98: o que falta, em uma frase — em vez de ler oito cards para descobrir.
  // S-O20: a mesma pergunta que a ficha da reserva faz, com a mesma régua —
  // aqui a lista inteira é necessária (o card lista todos), então o recorte
  // fica na régua e não na consulta.
  const contratoAtivo = contratoAtivoDaNoiva(contratosDaNoiva);
  /**
   * **S-C91 — a ficha mostrava a RESERVA e não mostrava a LOCAÇÃO** — e o
   * **E229** trocou a fonte: o recorte estreito (`GET /leads/:id/locacao`),
   * que a Recepção alcança. A régua de tela é a mesma
   * (`lib/locacao-da-noiva.ts`): `null` sem contrato ativo ou sem nenhuma das
   * duas datas — o caso de 310 das 311 fichas — e a ausência é SILÊNCIO, não
   * linha vazia.
   */
  const locacao = locacaoDaNoiva(locacaoLida.data ?? null);
  // E125/D3: a visita marcada cala a sugestão de agendar. Enquanto a agenda
  // conta, o banner espera (E121: sugerir "Agendar" e trocar de ideia um
  // segundo depois é afirmar o que não se sabe); se ela falhou, o banner cai
  // no comportamento antigo — a agenda aqui só enriquece a decisão.
  const visita = proximaVisita(agenda.data ?? []);
  const agendaContando = podeVerAgenda && estadoDasConsultas(agenda) === "carregando";
  const passo = agendaContando
    ? null
    : proximoPasso({
        etapa: lead.etapa,
        leadId: leadId!,
        /**
         * S-C120 — a terceira voz da ficha, e a mais alta das três.
         *
         * Os dois cards diziam "Nenhum contrato ainda" em cinza; o banner
         * mandava **"Fechar o contrato — ela já disse sim"** em botão, para a
         * Recepção, sobre um contrato que já estava fechado e que ela não pode
         * fechar. A causa era a mesma lista silenciada, e por isso o conserto é
         * o mesmo: quando a consulta não respondeu, o campo não vai — e o
         * `proximoPasso` cala o passo que dependia dele.
         */
        ...(estadoContratos === "pronto" ? { temContratoAtivo: !!contratoAtivo } : {}),
        contratoAtivoId: contratoAtivo?.id,
        temOrcamento: orcamentosDaNoiva.length > 0,
        // S-O12: o aceite dela já está nesta lista — faltava chegar à régua.
        temAceiteSemContrato: !contratoAtivo && orcamentosDaNoiva.some((o) => !!o.aceitoEm),
        ...(podeVerAgenda && !agenda.isError ? { temVisitaFutura: visita !== null } : {}),
      });

  return (
    <div className="space-y-6">
      <CabecalhoDetalhe
        trilha={[{ rotulo: "Noivas", para: "/noivas" }, { rotulo: lead.noivaNome }]}
        titulo={
          <span data-testid="text-noiva-nome">
            {lead.noivaNome}
            {lead.noivoNome && <span className="text-muted-foreground"> &amp; {lead.noivoNome}</span>}
          </span>
        }
        chip={
          <Badge variant={lead.etapa === "PERDIDO" ? "outline" : "secondary"}>
            {etapaLabel(lead.etapa)}
            {lead.etapa === "PERDIDO" && lead.perdidaMotivo && ` · ${perdidaMotivoLabel(lead.perdidaMotivo)}`}
          </Badge>
        }
        subtitulo={
          lead.etapa === "PERDIDO" && lead.perdidaDetalhe ? lead.perdidaDetalhe : undefined
        }
        acaoPrimaria={
          /* F1/E98 — o link que faltava no caminho mais percorrido do app: a
             ficha sabe o `leadId` e o formulário já aceita `?noiva=`, mas daqui
             não havia caminho, e agendar custava uma navegação de sidebar mais
             uma busca por nome — com a noiva do lado, esperando. */
          podeAgendar && lead.etapa !== "PERDIDO" ? (
            <Button asChild data-testid="button-agendar-da-ficha">
              <Link to={`/loja/${lojaId}/atendimentos/novo?noiva=${leadId}`}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                Agendar atendimento
              </Link>
            </Button>
          ) : undefined
        }
        acoes={[
          ...(podeEditar ? [{ rotulo: "Editar dados", para: `/noivas/${leadId}/editar` }] : []),
          ...(podeEditar && lead.etapa === "PERDIDO"
            ? [{ rotulo: updateLead.isPending ? "Reativando…" : "Reativar", onClick: reativar, desabilitada: updateLead.isPending }]
            : []),
          /* E77 (LGPD): o direito de acesso — a noiva pede, a loja entrega. */
          { rotulo: "Exportar dados (LGPD)", href: `/api/lojas/${lojaId}/leads/${leadId}/exportar` },
          ...(podeEditar && lead.etapa !== "PERDIDO"
            ? [{ rotulo: "Marcar como perdida", onClick: () => setPerdendo(true), destrutiva: true }]
            : []),
        ]}
      />

      {/* F5/E98 — o que falta, em uma frase e um botão.

          A ficha mostra oito cards, e quando a noiva é nova quase todos estão
          vazios: a vendedora lia os oito para descobrir que o passo era marcar
          o primeiro atendimento. A regra é pura e testada
          (`lib/proximo-passo.ts`), e devolve `null` quando não há o que fazer —
          uma faixa que aparece sempre vira moldura e ninguém lê. */}
      {passo && (
        <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div className="min-w-0">
            <p className="font-medium">{passo.titulo}</p>
            {passo.detalhe && (
              <p className="text-muted-foreground text-sm">{passo.detalhe}</p>
            )}
          </div>
          <Button asChild size="sm" className="shrink-0" data-testid="button-proximo-passo">
            <Link to={`/loja/${lojaId}${passo.href}`}>{passo.rotuloAcao}</Link>
          </Button>
        </div>
      )}

      <AlertDialog
        open={perdendo}
        onOpenChange={(aberto) => {
          if (!aberto) {
            setPerdendo(false);
            setMotivoPerda("");
            setDetalhePerda("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar {lead.noivaNome} como perdida?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela sai do funil ativo, mas o cadastro e o histórico ficam — e dá para
              reativar se ela voltar. O motivo alimenta o relatório de por que as
              noivas não fecham.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Motivo</Label>
              <Select
                value={motivoPerda}
                onValueChange={(v) => setMotivoPerda(v as LeadUpdatePerdidaMotivo)}
              >
                <SelectTrigger data-testid="select-motivo-perda">
                  <SelectValue placeholder="Por que ela não fechou?" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PERDIDA_MOTIVO_LABELS).map(([valor, rotulo]) => (
                    <SelectItem key={valor} value={valor}>
                      {rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="detalhe-perda" className="text-xs text-muted-foreground">
                Detalhe (opcional)
              </Label>
              <Input
                id="detalhe-perda"
                value={detalhePerda}
                onChange={(e) => setDetalhePerda(e.target.value)}
                placeholder="Ex.: fechou com ateliê X, orçamento acima do teto…"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Sem motivo o diálogo fica aberto — a validação fala primeiro.
                if (!motivoPerda) e.preventDefault();
                void marcarPerdida();
              }}
              disabled={updateLead.isPending}
            >
              {updateLead.isPending ? "Marcando…" : "Marcar como perdida"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-baseline justify-between gap-3">
              <span>O casamento</span>
              {mostrarContagem && (
                <span className={`text-sm font-normal ${urgente ? "text-destructive" : "text-muted-foreground"}`}>
                  {rotuloContagem(dias!)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lead.casamentoData ? (
              <p className="text-lg font-serif first-letter:uppercase">
                {dataLongaFmt.format(new Date(lead.casamentoData))}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Data a definir.</p>
            )}

            {/* S-O74/E189 — o V5, que vivia pela metade: o servidor sabe mover
                a reserva desde o E173 e nenhuma tela o chamava. A ficha dizia
                a data nova e a peça continuava presa na antiga, em silêncio —
                a noiva chegava no dia do casamento e o vestido estava com
                outra pessoa. Quem não pode mexer em vestidos LÊ o aviso e não
                ganha o botão: o servidor guarda o PATCH por `vestidos.editar`. */}
            {avisoDeData && (
              <div
                className="border-destructive/40 bg-destructive/5 space-y-3 rounded-md border p-3"
                data-testid="aviso-reservas-fora-da-data"
              >
                <p className="text-sm font-medium">
                  {avisoDeData.foraDaData.length === 1
                    ? "A reserva dela ficou em outra data."
                    : `${avisoDeData.foraDaData.length} reservas dela ficaram em outra data.`}{" "}
                  <span className="text-muted-foreground font-normal">
                    Mover ajusta as peças e o contrato ativo para {diaMesAno(avisoDeData.dia)}.
                  </span>
                </p>
                {avisoDeData.foraDaData.map((r) => {
                  /**
                   * **E211 — o preço aparece ANTES do clique** (cláusula 17ª
                   * §§2º e 3º).
                   *
                   * O botão move na hora, sem diálogo. Cobrar 10% do contrato
                   * depois disso seria a vendedora descobrir o reajuste **depois
                   * de já ter prometido a data à noiva** — e ela não teria como
                   * saber, porque a cláusula não está em tela nenhuma.
                   *
                   * A conta é a MESMA do servidor (`financeiro-core`), não uma
                   * segunda grafia: o que a tela acrescenta é saber qual
                   * contrato perguntar (`lib/reajuste-da-troca.ts`).
                   */
                  const reajuste = reajustePrevisto({
                    contratos: contratosDaNoiva,
                    deDia: r.dia,
                    paraDia: avisoDeData.dia,
                  });
                  return (
                  <div key={r.reservaId} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">
                      {diaMesAno(r.dia)}
                      {r.pecas.length > 0 && (
                        <span className="text-muted-foreground"> · {r.pecas.join(" · ")}</span>
                      )}
                      {reajuste && (
                        <span
                          className="text-destructive block text-xs font-medium"
                          data-testid={`reajuste-previsto-${r.reservaId}`}
                        >
                          Mudar para o ano seguinte reajusta o contrato em{" "}
                          {reajuste.percentual}% — {brl(reajuste.valor)} a mais, cobrado como
                          parcela (cláusula 17ª).
                        </span>
                      )}
                    </span>
                    {podeMoverReserva && (
                      <Button
                        size="sm"
                        variant="outline"
                        /* Uma mutação de cada vez, e o "Movendo…" só na que foi
                           clicada — `isPending` é do hook, não da linha, e com
                           duas reservas as duas diriam a mesma coisa. Hoje isso
                           não acontece (medido em `moscow_base`: as 118 noivas
                           com reserva viva têm exatamente UMA), e é justamente
                           por não acontecer que ninguém acharia o defeito. */
                        disabled={updateReserva.isPending}
                        onClick={() =>
                          void moverReserva(
                            r.reservaId,
                            avisoDeData.instante,
                            diaMesAno(avisoDeData.dia),
                          )
                        }
                        data-testid={`button-mover-reserva-${r.reservaId}`}
                      >
                        {movendo === r.reservaId
                          ? "Movendo…"
                          : `Mover para ${diaMesAno(avisoDeData.dia)}`}
                      </Button>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap gap-x-10 gap-y-3">
              <Dado rotulo="Horário" valor={lead.casamentoHorario} />
              <Dado rotulo="Local" valor={lead.casamentoLocal} />
              {/* E125/D3: a resposta de "que dia mesmo é a minha prova?" —
                  antes custava 2 telas e uma digitação (/atendimentos → aba
                  Provas → buscar o nome). O link cai na agenda do dia. */}
              {visita && (
                <div>
                  <span className="block text-xs uppercase tracking-wider text-muted-foreground">
                    {visita.tipo === "PROVA" ? "Próxima prova" : "Próximo atendimento"}
                  </span>
                  <Link
                    to={`/loja/${lojaId}/agenda?dia=${diaLocal(visita.inicio)}`}
                    className="text-sm underline underline-offset-4 hover:text-primary"
                    data-testid="link-proxima-visita"
                  >
                    {instanteDiaHora(visita.inicio)}
                  </Link>
                  {/* S-O5: esta é a linha que a recepção lê quando a noiva
                      liga perguntando "que dia é minha prova?". Se o vestido
                      saiu dela, é aqui que se descobre antes de responder. */}
                  <div className="mt-1">
                    <SeloProvaOrfa atendimento={visita} />
                    <SeloProvaForaDaJanela atendimento={visita} />
                  </div>
                </div>
              )}
              {/* S-C91 — as duas datas das cláusulas 4ª e 5ª, aqui e não só na
                  ficha do contrato. Elas entram neste card porque é o card do
                  QUANDO: a noiva pergunta pela prova, pela retirada e pela
                  devolução na mesma ligação, e as três passam a caber num
                  olhar.

                  `instanteCurto` e não `diaMesAno`: a locação é um INSTANTE no
                  relógio da loja (a 5ª crava 10:30 e 18:00), enquanto o aviso
                  de reserva logo acima é dia de NEGÓCIO em UTC. As duas réguas
                  convivem neste card de propósito, e trocar uma pela outra
                  move a hora — ou o dia — em silêncio.

                  A metade que falta é DITA quando a outra existe: contrato com
                  retirada e sem devolução é registro pela metade, e é a
                  devolução que a multa da 10ª cobra. Sem nenhuma das duas a
                  régua devolve `null` e não há linha — a mesma escolha do
                  `<Dado>` para todo campo ausente desta ficha. */}
              {/* C12 da conferência (16/08): a locação que não respondeu não é
                  "sem locação" — a linha sumia sem frase, igual à ficha sem
                  contrato. */}
              {locacaoLida.isError && (
                <p className="text-sm text-destructive" data-testid="locacao-erro">
                  Não deu para ler a retirada e a devolução — recarregue a ficha.
                </p>
              )}
              {locacao && (
                <>
                  {/* E231/S-C121 — a REAL vence o combinado: a ficha prometia
                      "Retirada 12/05 10:30" depois de o vestido ter saído pela
                      porta. Feita, a promessa vira registro — a mesma frase do
                      portal da noiva. */}
                  <Dado
                    rotulo="Retirada"
                    valor={
                      locacao.retiradaFeitaEm
                        ? `feita em ${instanteCurto(locacao.retiradaFeitaEm)}`
                        : locacao.retirada
                          ? instanteCurto(locacao.retirada)
                          : "A informar"
                    }
                    testid="dado-retirada-da-noiva"
                  />
                  <Dado
                    rotulo="Devolução"
                    valor={
                      locacao.devolucaoFeitaEm
                        ? `feita em ${instanteCurto(locacao.devolucaoFeitaEm)}`
                        : locacao.devolucao
                          ? instanteCurto(locacao.devolucao)
                          : "A informar"
                    }
                    testid="dado-devolucao-da-noiva"
                  />
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contato</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              {lead.whatsapp ? (
                <div>
                  <span className="block text-xs uppercase tracking-wider text-muted-foreground">
                    WhatsApp
                  </span>
                  {linkZap ? (
                    <a
                      href={linkZap}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm underline underline-offset-4 hover:text-primary"
                      data-testid="link-whatsapp"
                    >
                      {lead.whatsapp}
                    </a>
                  ) : (
                    <span className="text-sm">{lead.whatsapp}</span>
                  )}
                </div>
              ) : null}
              <Dado rotulo="Cerimonialista" valor={lead.cerimonialista} />
              {!lead.whatsapp && !lead.cerimonialista && (
                <p className="text-sm text-muted-foreground">Sem dados de contato.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/*
          E215 — **quem assina o contrato.**

          A tela de EDIÇÃO passou a coletar os treze campos, e só ela. Quem
          atende o telefone olha a FICHA — é a lição da S-C91, fechada nesta
          mesma trilha pelo mesmo motivo: o dado existia, chegava no payload, e
          a única tela que o mostrava era a errada.

          O card diz as duas coisas que a vendedora precisa saber sem abrir
          outra tela: o que já está preenchido, e **o que falta para o contrato
          poder fechar**. A falta é vermelha porque não é ornamento — sem ela a
          porta recusa com 422, e descobrir isso com a noiva na frente é o caso
          que o E211 ensinou a evitar (o aviso vem antes do clique).
        */}
        <Card>
          <CardHeader>
            <CardTitle>Quem assina o contrato</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3" data-testid="card-qualificacao">
              <div className="grid grid-cols-2 gap-3">
                <Dado rotulo="CPF" valor={lead.cpf} testid="dado-cpf" />
                <Dado rotulo="RG" valor={lead.rg} />
                <Dado
                  rotulo="Estado civil"
                  valor={lead.estadoCivil ? estadoCivilLabel(lead.estadoCivil) : null}
                />
                <Dado rotulo="Profissão" valor={lead.profissao} />
                <Dado
                  rotulo="Nascimento"
                  valor={lead.nascimento ? diaMesAno(diaDeNegocio(lead.nascimento)) : null}
                />
                <Dado rotulo="E-mail" valor={lead.email} />
              </div>
              <Dado rotulo="Endereço" valor={enderecoDaNoiva(lead)} testid="dado-endereco" />
              {faltasDaQualificacao.length > 0 && (
                <p className="text-sm text-destructive" data-testid="texto-falta-qualificacao">
                  Para fechar contrato ainda falta:{" "}
                  <strong>{faltasDaQualificacao.join(", ")}</strong>.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Histórico de contato (E32): a mesma timeline da Cobrança, aqui na
            ficha. Registrar um contato zera o relógio do "parado há N dias" do
            funil (E27) — por isso o onRegistrado recarrega o lead e a lista. */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Histórico de contato</CardTitle>
          </CardHeader>
          <CardContent>
            <HistoricoContato
              leadId={leadId!}
              aberto
              onRegistrado={() => {
                queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(activeLojaId!, leadId!) });
                queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey(activeLojaId!) });
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>Orçamentos</span>
              {podeCriarOrcamento && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={novoOrcamento}
                  disabled={createOrcamento.isPending}
                  data-testid="button-novo-orcamento"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {createOrcamento.isPending ? "Criando…" : "Novo orçamento"}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {estadoOrcamentos !== "pronto" || orcamentosDaNoiva.length === 0 ? (
              <SemLista
                estado={estadoOrcamentos}
                oQue="os orçamentos"
                vazio="Nenhum orçamento ainda."
                erro={orcamentos.error}
                testid="orcamentos-da-ficha"
              />
            ) : (
              <ul className="divide-y">
                {orcamentosDaNoiva.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/loja/${lojaId}/orcamentos/${o.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"
                    >
                      <span>
                        Criado em {instanteDia(o.createdAt)}
                      </span>
                      <Badge variant={o.status === "APROVADO" ? "default" : o.status === "RECUSADO" ? "outline" : "secondary"}>
                        {STATUS_ORCAMENTO[o.status] ?? o.status}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contratos</CardTitle>
          </CardHeader>
          <CardContent>
            {estadoContratos !== "pronto" || contratosDaNoiva.length === 0 ? (
              <SemLista
                estado={estadoContratos}
                oQue="os contratos"
                vazio="Nenhum contrato ainda."
                erro={contratos.error}
                testid="contratos-da-ficha"
              />
            ) : (
              <ul className="divide-y">
                {contratosDaNoiva.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/loja/${lojaId}/contratos/${c.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"
                    >
                      <span className={c.status === "CANCELADO" ? "text-muted-foreground line-through" : undefined}>
                        {STATUS_CONTRATO[c.status] ?? c.status}
                      </span>
                      <span className="text-right">
                        <span className="block tabular-nums">{brl(c.valorTotal)}</span>
                        {/* E125/D4: "quanto falta pagar?" respondida na ficha —
                            o recorte ?leadId= embute o carnê, e a soma é a
                            régua única do core (a mesma do portal da noiva). */}
                        {/* S-O66/E187: a guarda pergunta pelo `?.` e a soma
                            afirmava com `!` — a segunda ocorrência da classe, e
                            a sobra nomeava só a do contrato. Perguntar pelo
                            `c.parcelas &&` estreita para a soma, que sem elas
                            somaria `undefined`. */}
                        {c.status === "ATIVO" && c.parcelas && c.parcelas.length > 0 && (
                          <span
                            className="block text-xs text-muted-foreground tabular-nums"
                            data-testid="text-falta-receber-ficha"
                          >
                            falta receber {brl(reais(abertoEmCentavos(c.parcelas)))}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Portal (E78): o link único que substitui gradualmente os soltos. */}
        <PortalNoiva leadId={leadId!} noivaNome={lead.noivaNome} />

        {/* Lookbook (E21): a seleção provada vira link para rever em casa. */}
        <LookbookNoiva leadId={leadId!} />

        <Card>
          <CardHeader>
            <CardTitle>Interesses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {(lead.interesse?.atributos?.length ?? 0) > 0
                ? "Desejos da noiva registrados — base das sugestões de vestido."
                : "Ainda não preenchidos. Registre os desejos da noiva."}
            </p>
            <Button asChild variant="outline" size="sm" data-testid="link-interesses">
              <Link to={`/loja/${lojaId}/noivas/${leadId}/interesses`}>
                {lead.interesse ? "Editar interesses" : "Preencher interesses"} →
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <footer className="border-t pt-4">
        <p className="text-xs text-muted-foreground">
          Adicionada via {ROTULO_ORIGEM[lead.origem] ?? lead.origem}
        </p>
      </footer>
    </div>
  );
}
