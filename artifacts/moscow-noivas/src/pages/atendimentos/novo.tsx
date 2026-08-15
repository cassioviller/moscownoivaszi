import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useConfirmarSaida, sujoParaConfirmar } from "@/hooks/use-confirmar-saida";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import {
  useListAtendimentos,
  useListAusencias,
  getListAusenciasQueryKey,
  getListAtendimentosQueryKey,
  useCreateAtendimento,
  useDeleteAtendimento,
  useListCabines,
  getListCabinesQueryKey,
  useListEquipe,
  getListEquipeQueryKey,
  useListBloqueios,
  getListBloqueiosQueryKey,
  useGetDisponibilidade,
  getGetDisponibilidadeQueryKey,
  useCreateBloqueio,
  useListVestidos,
  getListVestidosQueryKey,
  useGetLead,
  getGetLeadQueryKey,
  type Atendimento,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ComboboxNoiva } from "@/components/combobox-noiva";
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
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Erro } from "@/components/estado";
import { MessageCircle } from "lucide-react";
import { diaMesAbrevAno } from "@/lib/formatos";
import { hojeLocal } from "@/lib/financeiro/datas";
import { instanteCurto, diaMesAno } from "@/lib/formatos";
import { podeNoModulo } from "@/lib/permissoes";
import { linkWhatsApp, msgConfirmacaoAtendimento } from "@/lib/whatsapp";
import {
  slotsOferecidos,
  instanteDoSlot,
  ausenciaQueCobre,
  expedienteDaRegra,
  DETALHE_RECUSA,
  type Marcacao,
} from "@workspace/agenda-core";
import { cn } from "@/lib/utils";
import { CACHE_ESTAVEL } from "@/lib/cache";
import { mensagemApi } from "@/lib/erro-api";

const agendarSchema = z
  .object({
    tipo: z.enum(["ATENDIMENTO", "PROVA"]),
    /* S-C180: este `z.enum` é a ÚNICA grafia dos tipos neste arquivo — os
       botões (a lista que a tela OFERECE) e a guarda do prefill derivam de
       `TIPOS_DE_AGENDAMENTO` abaixo. Antes eram três cópias, e a régua da
       paridade (`enums-do-contrato.test.ts`) só pregava esta: um terceiro
       valor no contrato cobraria a linha de cima e os dois botões de baixo
       continuariam dois, verdes. */
    leadId: z.string().min(1, "Escolha a noiva"),
    bloqueioId: z.string().optional(),
    cabineId: z.string().min(1, "Escolha a cabine"),
    vendedoraId: z.string().min(1, "Escolha a vendedora"),
    data: z.string().min(1, "Informe a data"),
    hora: z.string().min(1, "Informe a hora"),
    observacao: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.tipo === "PROVA" && !values.bloqueioId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bloqueioId"],
        message: "Escolha o vestido reservado para a prova.",
      });
    }
  });

type AgendarValues = z.infer<typeof agendarSchema>;

// A lista que a tela oferece SAI do schema — não é segunda cópia.
const TIPOS_DE_AGENDAMENTO = agendarSchema.innerType().shape.tipo.options;


/**
 * Agendar atendimento/prova (porte da /atendimentos/novo do feat/orcamentos).
 * Marca o horário na grade; o ato de atender fica na fila (/atendimentos).
 */
export default function NovoAtendimento() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos, session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [cancelando, setCancelando] = useState<Atendimento | null>(null);

  // Deep-link do detalhe da reserva ("Agendar prova"): ?noiva=&tipo=PROVA&reserva=
  // pré-preenche o formulário. `tipo` só aceita os valores do schema.
  //
  // F12: a agenda manda `?dia=` ao trocar o diálogo próprio por esta tela — sem
  // ele, quem estava olhando a grade de 14/02 cairia aqui com a data em branco e
  // teria de redigitar o dia que já estava na tela anterior. O formato é o mesmo
  // YMD do `<input type=date>`, então serve de valor inicial sem conversão.
  const tipoParam = searchParams.get("tipo");
  const diaParam = searchParams.get("dia") ?? "";
  const prefill = {
    // S-C180: a guarda deriva do MESMO enum do schema — era a terceira cópia
    // literal dos dois valores neste arquivo.
    tipo: TIPOS_DE_AGENDAMENTO.find((t) => t === tipoParam) ?? "ATENDIMENTO",
    leadId: searchParams.get("noiva") ?? "",
    bloqueioId: searchParams.get("reserva") ?? "",
    data: /^\d{4}-\d{2}-\d{2}$/.test(diaParam) ? diaParam : "",
  } as const;

  const equipe = useListEquipe(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const cabines = useListCabines(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListCabinesQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const bloqueios = useListBloqueios(activeLojaId!, undefined, {
    query: { queryKey: getListBloqueiosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const disponibilidade = useGetDisponibilidade(activeLojaId!, {
    query: { queryKey: getGetDisponibilidadeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const createAtendimento = useCreateAtendimento();
  const deleteAtendimento = useDeleteAtendimento();

  // Agendar é do módulo `agenda` no backend, não `leads`; e a config de
  // cabines é gateada por `agenda` também — era `config`, que o servidor não
  // conhece e por isso negava para todo mundo.
  const podeCriar = podeNoModulo(acessosModulos, "agenda", "criar");
  /**
   * S36 — reservar a peça é do módulo `vestidos`, não do `agenda`.
   *
   * O botão "Criar reserva" desta tela chama `POST /lojas/:lojaId/bloqueios`,
   * que o servidor guarda por `requireModulo("vestidos")` — e o POST vira ação
   * `criar`. Ele estava dentro do bloco de `agenda.criar` e mais nada.
   *
   * **A RECEPÇÃO tropeçava nisso**, e é perfil PADRÃO: `agenda: TUDO` e
   * `vestidos: SO_VER`. Ela via o botão, clicava, e levava 403 — o defeito
   * exato do E111 (a tela pedindo um módulo e o servidor outro), vivo em outra
   * tela e achado pela varredura da S36.
   */
  const podeReservarPeca = podeNoModulo(acessosModulos, "vestidos", "criar");
  const podeVerConfig = podeNoModulo(acessosModulos, "agenda", "ver");

  const form = useForm<AgendarValues>({
    resolver: zodResolver(agendarSchema),
    defaultValues: {
      tipo: prefill.tipo,
      leadId: prefill.leadId,
      bloqueioId: prefill.bloqueioId,
      cabineId: "",
      vendedoraId: "",
      data: prefill.data,
      hora: "",
      observacao: "",
    },
  });
  // D14: aqui o `form.reset()` roda no sucesso, então `isDirty` volta a false
  // sozinho — não precisa do `salvou` que o `noiva-form` precisa.
  useConfirmarSaida(sujoParaConfirmar(form.formState));
  const tipo = form.watch("tipo");
  const leadId = form.watch("leadId");
  const cabineId = form.watch("cabineId");
  const vendedoraId = form.watch("vendedoraId");
  const dataEscolhida = form.watch("data");
  const horaEscolhida = form.watch("hora");

  // Sobra da rodada 5: esta tela era o último "baixa tudo" do produto — a
  // agenda INTEIRA da história só para montar os slots. Ela precisa de dois
  // recortes, cada um com a janela do E83 (dia LOCAL America/Sao_Paulo, a
  // mesma semântica que o servidor aplica sobre `inicio`):
  // 1) o DIA escolhido, para a checagem de conflito dos slots — `de=ate=dia`
  //    cobre exatamente o dia que `slotsOferecidos` avalia;
  // 2) `de=hoje` sem `ate`, para o card "Próximos atendimentos" — todo
  //    `inicio >= agora` tem dia local >= hoje, então a janela nunca esconde
  //    um futuro.
  const janelaDia = dataEscolhida ? { de: dataEscolhida, ate: dataEscolhida } : undefined;
  const atendimentosDia = useListAtendimentos(activeLojaId!, janelaDia, {
    query: {
      queryKey: getListAtendimentosQueryKey(activeLojaId!, janelaDia),
      enabled: !!activeLojaId && !!dataEscolhida,
    },
  });
  // E151: quem falta a partir do dia escolhido — o mesmo recorte que a grade
  // usa, e a mesma lista que o servidor consulta ao recusar.
  const paramsAusencias = { desde: dataEscolhida || hojeLocal() };
  const ausencias = useListAusencias(activeLojaId!, paramsAusencias, {
    query: {
      queryKey: getListAusenciasQueryKey(activeLojaId!, paramsAusencias),
      enabled: !!activeLojaId,
    },
  });
  const janelaFuturos = { de: hojeLocal() };
  const atendimentosFuturos = useListAtendimentos(activeLojaId!, janelaFuturos, {
    query: {
      queryKey: getListAtendimentosQueryKey(activeLojaId!, janelaFuturos),
      enabled: !!activeLojaId,
    },
  });

  const cabinesAtivas = useMemo(
    () => (cabines.data ?? []).filter((c) => c.ativo),
    [cabines.data],
  );

  // Reservas de casamento da noiva (picker quando Tipo=Prova) — o bloqueio já
  // vem com o vestido aninhado (codigo/nome) do GET /bloqueios.
  const reservasDaNoiva = useMemo(
    () =>
      (bloqueios.data ?? []).filter(
        (b) => b.leadId === leadId && b.tipo === "RESERVA_CASAMENTO" && !b.canceladoEm,
      ),
    [bloqueios.data, leadId],
  );

  // E65: noiva sem reserva deixava a vendedora num beco ("crie a reserva
  // antes") — a reserva agora nasce aqui mesmo, sem sair do fluxo da prova.
  const semReserva = tipo === "PROVA" && !!leadId && !bloqueios.isLoading && reservasDaNoiva.length === 0;
  const [novaReservaVestidoId, setNovaReservaVestidoId] = useState("");
  const [novaReservaData, setNovaReservaData] = useState("");
  const vestidosQ = useListVestidos(activeLojaId!, {
    query: { queryKey: getListVestidosQueryKey(activeLojaId!), enabled: !!activeLojaId && semReserva },
  });
  const leadQ = useGetLead(activeLojaId!, leadId, {
    query: {
      queryKey: getGetLeadQueryKey(activeLojaId!, leadId),
      enabled: !!activeLojaId && semReserva,
    },
  });
  const createBloqueio = useCreateBloqueio();
  // A data do casamento que a ficha da noiva já sabe pré-preenche o campo.
  const dataReservaEfetiva =
    novaReservaData || leadQ.data?.casamentoData?.slice(0, 10) || "";

  const criarReservaInline = async () => {
    if (!novaReservaVestidoId || !dataReservaEfetiva) return;
    try {
      const criado = await createBloqueio.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          vestidoId: novaReservaVestidoId,
          leadId,
          tipo: "RESERVA_CASAMENTO",
          casamentoData: `${dataReservaEfetiva}T12:00:00-03:00`,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListBloqueiosQueryKey(activeLojaId!) });
      form.setValue("bloqueioId", criado.id, { shouldValidate: true });
      setNovaReservaVestidoId("");
      setNovaReservaData("");
      toast({ title: "Reserva criada", description: "O vestido está reservado para o casamento." });
    } catch (err) {
      toast({
        title: "Não deu para reservar",
        description: mensagemApi(err, "Tente novamente.", {
          VESTIDO_INDISPONIVEL:
            "O vestido não está livre na data do casamento — escolha outro ou confira a ficha dele.",
        }),
        variant: "destructive",
      });
    }
  };

  const proximos = useMemo(() => {
    const agora = Date.now();
    return (atendimentosFuturos.data ?? [])
      .filter((a) => a.situacao === "AGENDADO" && new Date(a.inicio).getTime() >= agora)
      .sort((x, y) => new Date(x.inicio).getTime() - new Date(y.inicio).getTime())
      .slice(0, 10);
  }, [atendimentosFuturos.data]);

  const regra = disponibilidade.data;

  // E64: a agenda OFERECE — a mesma régua do arraste da grade (agenda-core)
  // percorre a malha do dia e diz o que está livre, ANTES do submit. O input
  // de hora livre deixava o conflito estourar como erro da API depois.
  // G8 (E168): o montador é um só, no agenda-core — três telas o escreviam à
  // mão e a da grade do dia esquecia `provaDuracao`.
  const expediente = useMemo(() => expedienteDaRegra(regra), [regra]);
  const slotsDoDiaEscolhido = useMemo(() => {
    // Sem os dados do DIA a grade não abre: oferecer slot contra agenda ainda
    // não carregada mostraria "livre" o que está ocupado (por isso nada de
    // keepPreviousData aqui — o dia anterior não vale para o dia novo).
    if (!dataEscolhida || !cabineId || !vendedoraId || !atendimentosDia.data) return null;
    /**
     * G9 (E168) — a agenda do dia INTEIRA vai para o núcleo, e é ele quem sabe
     * quem segura a cabine.
     *
     * Aqui vivia a única cópia da régua de `situacao`: um filtro que tirava
     * CONCLUIDO e FALTOU antes da chamada. Ela estava certa no espírito e
     * sozinha no mundo — o servidor buscava concorrentes sem olhar situação e a
     * grade do dia entregava tudo. O slot da prova concluída aparecia
     * habilitado nesta tela, o POST recusava com 422, e a grade ao lado apagava
     * a mesma célula. Agora a régua mora em `seguraOIntervalo`, e o INSTANTE
     * exato continua recusado — porque a UNIQUE do banco o recusa.
     */
    const ocupadas: Marcacao[] = atendimentosDia.data;
    // E151: as ausências entram na MESMA função que a rota consulta — sem
    // elas a tela ofereceria o dia inteiro de quem está de férias e o clique
    // levaria 422, que é o defeito que a doutrina do E27 existe para evitar.
    return slotsOferecidos(
      dataEscolhida,
      { cabineId, vendedoraId, tipo },
      ocupadas,
      expediente,
      ausencias.data ?? [],
    );
  }, [dataEscolhida, cabineId, vendedoraId, tipo, atendimentosDia.data, expediente, ausencias.data]);
  // Seleção completa mas o dia ainda chegando — a mensagem certa é "carregando",
  // não "escolha cabine, vendedora e data".
  const carregandoDia =
    !!dataEscolhida && !!cabineId && !!vendedoraId && !atendimentosDia.data;
  const lojaFechadaNoDia =
    slotsDoDiaEscolhido !== null &&
    slotsDoDiaEscolhido.length > 0 &&
    slotsDoDiaEscolhido.every((s) => s.recusa === "LOJA_FECHADA");
  /**
   * E151 — o dia inteiro recusado porque a pessoa não está.
   *
   * É o irmão de `lojaFechadaNoDia`, e existe pela mesma razão: uma grade de
   * vinte botões apagados não diz nada. Aqui a frase diz o nome e o período —
   * a mesma informação que o 422 do servidor traria, antes do clique.
   */
  const ausenciaDoDia =
    dataEscolhida && vendedoraId
      ? ausenciaQueCobre(ausencias.data ?? [], vendedoraId, instanteDoSlot(dataEscolhida, "12:00"))
      : null;
  const vendedoraAusenteNoDia =
    !lojaFechadaNoDia &&
    slotsDoDiaEscolhido !== null &&
    slotsDoDiaEscolhido.length > 0 &&
    slotsDoDiaEscolhido.every((s) => s.recusa === "VENDEDORA_AUSENTE")
      ? ausenciaDoDia
      : null;

  // E8: confirmação por wa.me com nome/endereço da loja vindos da sessão.
  const lojaAtiva = session?.lojas?.find((l) => l.id === activeLojaId);
  const waConfirmacao = (a: {
    lead?: { noivaNome?: string; whatsapp?: string | null } | null;
    tipo: string;
    inicio: string;
  }) =>
    linkWhatsApp(
      a.lead?.whatsapp,
      msgConfirmacaoAtendimento({
        noivaNome: a.lead?.noivaNome,
        tipo: a.tipo,
        inicio: a.inicio,
        lojaNome: lojaAtiva?.nome,
        endereco: lojaAtiva?.endereco,
      }),
    );

  const onSubmit = async (values: AgendarValues) => {
    try {
      const criado = await createAtendimento.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          leadId: values.leadId,
          cabineId: values.cabineId,
          vendedoraId: values.vendedoraId,
          tipo: values.tipo,
          bloqueioId: values.tipo === "PROVA" ? values.bloqueioId || undefined : undefined,
          // O instante nasce no fuso da LOJA (agenda-core), não no do navegador.
          inicio: instanteDoSlot(values.data, values.hora).toISOString(),
          observacao: values.observacao || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) });
      const wa = waConfirmacao(criado);
      toast({
        title: "Atendimento agendado",
        ...(wa
          ? {
              description: "Quer já mandar a confirmação para a noiva?",
              action: (
                <ToastAction altText="Enviar confirmação por WhatsApp" asChild>
                  <a href={wa} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                </ToastAction>
              ),
            }
          : {}),
      });
      form.reset();
    } catch (err) {
      toast({
        title: "Não deu para agendar",
        description:
          mensagemApi(err, "Verifique conflito de horário e tente novamente."),
        variant: "destructive",
      });
    }
  };

  const onCancelar = async () => {
    if (!cancelando) return;
    try {
      await deleteAtendimento.mutateAsync({ lojaId: activeLojaId!, atendimentoId: cancelando.id });
      await queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) });
      toast({ title: "Atendimento cancelado" });
    } catch (err) {
      toast({
        title: "Não deu para cancelar",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    } finally {
      setCancelando(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {/* Quem veio da agenda volta para a agenda, no MESMO dia que estava
              olhando — a comodidade que o diálogo do F12 dava de graça e que um
              link para "Atendimentos" não devolve. */}
          {prefill.data ? (
            <Link
              to={`/loja/${lojaId}/agenda?dia=${prefill.data}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Agenda
            </Link>
          ) : (
            <Link
              to={`/loja/${lojaId}/atendimentos`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Atendimentos
            </Link>
          )}
          <h1 className="text-3xl font-serif mt-1">Agendar</h1>
        </div>
        {podeVerConfig && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/loja/${lojaId}/atendimentos/config`}>Cabines &amp; horário</Link>
          </Button>
        )}
      </div>

      {!podeCriar ? (
        <p className="text-sm text-muted-foreground">Você não tem permissão para agendar.</p>
      ) : cabines.isError ? (
        /* S-C250 — o sítio que sobra nenhuma citava, achado ao medir a forma
           derivada. O `isLoading` estava lido e o `isError` não: um 500 na
           lista de cabines mandava a vendedora CADASTRAR uma cabine — sobre uma
           loja que pode ter cinco. É a S-C160 na direção do gesto, e não só da
           frase: o ramo do zero manda alguém criar o que já existe. */
        <Erro
          titulo="Não deu para carregar as cabines"
          erro={cabines.error}
          onTentarNovamente={() => cabines.refetch()}
        />
      ) : !cabines.isLoading && cabinesAtivas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Cadastre ao menos uma cabine em{" "}
          <Link to={`/loja/${lojaId}/atendimentos/config`} className="underline underline-offset-4">
            Cabines &amp; horário
          </Link>{" "}
          para agendar.
        </p>
      ) : (
        <Card className="max-w-2xl">
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="tipo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <div className="flex gap-2">
                        {TIPOS_DE_AGENDAMENTO.map((t) => (
                          <Button
                            key={t}
                            type="button"
                            size="sm"
                            variant={field.value === t ? "default" : "outline"}
                            aria-pressed={field.value === t}
                            onClick={() => {
                              field.onChange(t);
                              if (t === "ATENDIMENTO") form.setValue("bloqueioId", "");
                            }}
                          >
                            {t === "ATENDIMENTO" ? "Atendimento" : "Prova"}
                          </Button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="leadId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Noiva *</FormLabel>
                      <FormControl>
                        <ComboboxNoiva
                          lojaId={activeLojaId!}
                          value={field.value || null}
                          onChange={(v) => {
                            field.onChange(v);
                            form.setValue("bloqueioId", "");
                          }}
                          placeholder="Selecione a noiva…"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {tipo === "PROVA" && (
                  <FormField
                    control={form.control}
                    name="bloqueioId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reserva / vestido *</FormLabel>
                        {!leadId ? (
                          <p className="text-sm text-muted-foreground">
                            Escolha a noiva para listar as reservas.
                          </p>
                        ) : bloqueios.isLoading ? (
                          <p className="text-sm text-muted-foreground">Carregando reservas…</p>
                        ) : bloqueios.isError ? (
                          /* S-C250 — o segundo sítio deste arquivo, e o mais
                             caro dos quatro: o ramo do zero não afirma só um
                             vazio, ele OFERECE criar a reserva ali mesmo (E65).
                             Um 500 em `bloqueios` dizia "Esta noiva ainda não
                             tem reserva de casamento — crie agora" sobre uma
                             noiva que já tem a peça presa, e o clique seguinte
                             prenderia uma segunda. É a S-C160 com gesto
                             pendurado no fim. */
                          <Erro
                            titulo="Não deu para carregar as reservas dela"
                            erro={bloqueios.error}
                            onTentarNovamente={() => bloqueios.refetch()}
                          />
                        ) : reservasDaNoiva.length === 0 ? (
                          <div className="space-y-3 rounded-md border p-3">
                            {/* S36: quem não reserva peça vê o RECADO, não o
                                formulário — a recepção marca a prova e pede a
                                reserva a quem cuida do acervo, em vez de clicar
                                num botão que o servidor recusa. */}
                            <p className="text-sm text-muted-foreground">
                              {podeReservarPeca
                                ? "Esta noiva ainda não tem reserva de casamento — crie agora, sem sair daqui."
                                : "Esta noiva ainda não tem reserva de casamento. Quem cuida do acervo pode criar uma."}
                            </p>
                            {podeReservarPeca && (
                              <>
                            <Select
                              value={novaReservaVestidoId}
                              onValueChange={setNovaReservaVestidoId}
                            >
                              <SelectTrigger aria-label="Vestido da reserva">
                                <SelectValue placeholder="Escolha o vestido…" />
                              </SelectTrigger>
                              <SelectContent>
                                {(vestidosQ.data ?? [])
                                  .filter((v) => v.status !== "inativo")
                                  .map((v) => (
                                    <SelectItem key={v.id} value={v.id}>
                                      {v.codigo} · {v.nome}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <div className="flex flex-wrap items-end gap-2">
                              <label className="flex flex-col gap-1">
                                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                                  Data do casamento
                                </span>
                                <Input
                                  type="date"
                                  value={dataReservaEfetiva}
                                  onChange={(e) => setNovaReservaData(e.target.value)}
                                  className="w-44"
                                  aria-label="Data do casamento da reserva"
                                />
                              </label>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={
                                  !novaReservaVestidoId ||
                                  !dataReservaEfetiva ||
                                  createBloqueio.isPending
                                }
                                onClick={criarReservaInline}
                                data-testid="criar-reserva-inline"
                              >
                                {createBloqueio.isPending ? "Reservando…" : "Criar reserva"}
                              </Button>
                            </div>
                              </>
                            )}
                          </div>
                        ) : (
                          <Select value={field.value ?? ""} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger aria-label="Reserva">
                                <SelectValue placeholder="Selecione o vestido reservado…" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {reservasDaNoiva.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  Vestido {r.vestido?.codigo ?? "?"} · {r.vestido?.nome ?? "sem nome"}
                                  {r.casamentoData
                                    ? ` — casamento ${diaMesAbrevAno(r.casamentoData)}`
                                    : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="cabineId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cabine *</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger aria-label="Cabine">
                              <SelectValue placeholder="Selecione…" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {cabinesAtivas.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="vendedoraId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendedora *</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger aria-label="Vendedora">
                              <SelectValue placeholder="Selecione…" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(equipe.data ?? [])
                              .filter((m) => m.ativo !== false)
                              .map((m) => (
                                <SelectItem key={m.usuarioId} value={m.usuarioId}>
                                  {m.nome}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="data"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data *</FormLabel>
                        <FormControl>
                          <Input type="date" aria-label="Data" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* E64: a grade de horários — livre se clica, ocupado explica. */}
                <FormField
                  control={form.control}
                  name="hora"
                  render={() => (
                    <FormItem>
                      <FormLabel>Hora *</FormLabel>
                      {!slotsDoDiaEscolhido ? (
                        <p className="text-sm text-muted-foreground">
                          {carregandoDia
                            ? "Carregando horários…"
                            : "Escolha cabine, vendedora e data para ver os horários livres."}
                        </p>
                      ) : lojaFechadaNoDia ? (
                        <p className="text-sm text-muted-foreground">
                          A loja não abre nesse dia da semana.
                        </p>
                      ) : vendedoraAusenteNoDia ? (
                        <p className="text-sm text-muted-foreground" data-testid="aviso-vendedora-ausente">
                          {(equipe.data ?? []).find((m) => m.usuarioId === vendedoraId)?.nome ??
                            "A vendedora"}{" "}
                          está ausente de {diaMesAno(vendedoraAusenteNoDia.inicio)} a{" "}
                          {diaMesAno(vendedoraAusenteNoDia.fim)} — escolha outro dia ou outra
                          pessoa.
                        </p>
                      ) : (
                        <div
                          className="grid grid-cols-4 sm:grid-cols-6 gap-2"
                          data-testid="grade-slots"
                        >
                          {slotsDoDiaEscolhido.map(({ slot, recusa }) => (
                            <Button
                              key={slot}
                              type="button"
                              size="sm"
                              variant={horaEscolhida === slot ? "default" : "outline"}
                              disabled={recusa !== null}
                              title={recusa ? DETALHE_RECUSA[recusa] : undefined}
                              aria-label={`Horário ${slot}${recusa ? ` — ${DETALHE_RECUSA[recusa]}` : ""}`}
                              className={cn("tabular-nums", recusa && "opacity-40")}
                              onClick={() =>
                                form.setValue("hora", slot, { shouldValidate: true })
                              }
                              data-testid={`slot-${slot}`}
                            >
                              {slot}
                            </Button>
                          ))}
                        </div>
                      )}
                      {regra && !lojaFechadaNoDia && (
                        <p className="text-xs text-muted-foreground">
                          Funcionamento: {regra.atendimentoAberturaHora}h às{" "}
                          {regra.atendimentoFechamentoHora}h.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="observacao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observação (opcional)</FormLabel>
                      <FormControl>
                        <Input aria-label="Observação" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={createAtendimento.isPending}>
                  {createAtendimento.isPending ? "Agendando…" : "Agendar"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Próximos atendimentos</CardTitle>
        </CardHeader>
        <CardContent>
          {proximos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum atendimento agendado.</p>
          ) : (
            <ul className="divide-y">
              {proximos.map((a) => {
                const wa = waConfirmacao(a);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {a.lead?.noivaNome ?? "Noiva"}
                        {a.tipo === "PROVA" ? " — Prova" : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {instanteCurto(a.inicio)} · {a.cabine?.nome ?? "Cabine"} ·{" "}
                        {a.vendedora?.nome ?? "Vendedora"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {wa && (
                        <Button asChild variant="outline" size="sm">
                          <a href={wa} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="mr-1 h-4 w-4" />
                            Confirmar
                          </a>
                        </Button>
                      )}
                      {podeCriar && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Cancelar atendimento"
                          disabled={deleteAtendimento.isPending}
                          onClick={() => setCancelando(a)}
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!cancelando} onOpenChange={(aberto) => !aberto && setCancelando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar atendimento?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancelar o atendimento de {cancelando?.lead?.noivaNome ?? "noiva"}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={onCancelar} disabled={deleteAtendimento.isPending}>
              {deleteAtendimento.isPending ? "Cancelando…" : "Cancelar atendimento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
