import { useState } from "react";
import { useConfirmarSaida, sujoParaConfirmar } from "@/hooks/use-confirmar-saida";
import { useForm, Controller } from "react-hook-form";
import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useListCabines,
  getListCabinesQueryKey,
  useCreateCabine,
  useUpdateCabine,
  useGetDisponibilidade,
  getGetDisponibilidadeQueryKey,
  useSetDisponibilidade,
  useListEquipe,
  getListEquipeQueryKey,
  useListAusencias,
  getListAusenciasQueryKey,
  useCreateAusencia,
  useDeleteAusencia,
  listAtendimentos,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { podeNoModulo } from "@/lib/permissoes";
import { CACHE_ESTAVEL } from "@/lib/cache";
import { diaMesAno } from "@/lib/formatos";
import { hojeLocal } from "@/lib/financeiro/datas";
import { atendimentosNaCabine } from "@/lib/agenda-telas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { mensagemApi } from "@/lib/erro-api";
import { minutosDaProva, opcoesDeDuracaoDaProva, slotsDaProva } from "@/lib/duracao-da-prova";
// E222 — a conversão entre "HH:MM" (a tela) e minutos desde a meia-noite (o
// servidor) mora no agenda-core, e é a mesma que o recado da recusa usa.
import {
  EXPEDIENTE_DE_RETIRADA_PADRAO,
  hhmmParaMinutos as minutosDoRelogio,
  minutosParaHHMM as hhmm,
} from "@workspace/agenda-core";

/**
 * Cabines & horário de atendimento (porte da /atendimentos/config do
 * feat/orcamentos). O horário e a duração da prova vivem na regra de
 * disponibilidade da loja (atendimentoAberturaHora/FechamentoHora e
 * provaDuracao — S-A10: este era o único campo do bloco sem contrapartida
 * editável, com o "Editar" de Configurações apontando para cá); salvar
 * preserva os demais campos da regra.
 */

// Índice = dia da semana (0=domingo … 6=sábado), como no diasFuncionamento (E38).
const DIAS_ROTULO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function ConfigAtendimentos() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const cabines = useListCabines(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListCabinesQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const disponibilidade = useGetDisponibilidade(activeLojaId!, {
    query: { queryKey: getGetDisponibilidadeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const createCabine = useCreateCabine();
  const updateCabine = useUpdateCabine();
  const setDisponibilidade = useSetDisponibilidade();

  /**
   * G6 (E168) — desativar uma cabine passa a DIZER quanta agenda fica nela.
   *
   * O 409 do `DELETE /cabines` recomenda desativar (*"Desative-a se ela saiu
   * de uso"*) e conta os atendimentos; o Switch daqui fazia o mesmo estrago
   * sem contar nada. A janela é do dia de hoje em diante: o que já aconteceu
   * é história e não muda a decisão de quem está desativando.
   */

  // Cabines e disponibilidade são gateadas por `agenda` no backend — era
  // `config`, um módulo que o servidor não conhece: negava para todo mundo.
  // S-M21 (fecha sítio da S-M9): o form de cabine NOVA é POST → criar; o
  // Switch de ativar/desativar e o expediente são PATCH/PUT → editar. A régua
  // única (editar) oferecia o "Adicionar" a quem levava 403 e o escondia de
  // quem o servidor aceitava.
  const podeEditar = podeNoModulo(acessosModulos, "agenda", "editar");
  const podeCriarCabine = podeNoModulo(acessosModulos, "agenda", "criar");
  /**
   * S-C221 — o expediente de retirada/devolução é a cláusula 4ª do CONTRATO,
   * e o servidor passou a exigir `contratos.editar` para os quatro campos
   * dela (agenda.ts, PUT /disponibilidade/regras). O gate da tela é o mesmo
   * do endpoint (a régua da s36-gate-da-tela): sem a permissão, os campos
   * aparecem SÓ-LEITURA e o salvar não os manda — mandar seria oferecer o
   * 403.
   */
  const podeEditarClausula4a =
    podeEditar && podeNoModulo(acessosModulos, "contratos", "editar");

  const [nomeCabine, setNomeCabine] = useState("");

  // E151 — as ausências da equipe, e o formulário que as cria.
  const equipe = useListEquipe(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const ausencias = useListAusencias(activeLojaId!, {}, {
    query: { queryKey: getListAusenciasQueryKey(activeLojaId!, {}), enabled: !!activeLojaId },
  });
  const createAusencia = useCreateAusencia();
  const deleteAusencia = useDeleteAusencia();
  const [ausenciaUsuario, setAusenciaUsuario] = useState("");
  const [ausenciaInicio, setAusenciaInicio] = useState("");
  const [ausenciaFim, setAusenciaFim] = useState("");
  const [ausenciaMotivo, setAusenciaMotivo] = useState("");

  const invalidarAusencias = () =>
    queryClient.invalidateQueries({ queryKey: getListAusenciasQueryKey(activeLojaId!, {}) });

  const adicionarAusencia = async () => {
    // A régua do período mora no servidor (422 PERIODO_INVERTIDO); aqui só se
    // evita a ida à rede quando a tela já sabe que está invertido.
    if (ausenciaFim < ausenciaInicio) {
      toast({
        title: "Período invertido",
        description: "O último dia é anterior ao primeiro.",
        variant: "destructive",
      });
      return;
    }
    try {
      await createAusencia.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          usuarioId: ausenciaUsuario,
          inicio: ausenciaInicio,
          fim: ausenciaFim,
          ...(ausenciaMotivo.trim() ? { motivo: ausenciaMotivo.trim() } : {}),
        },
      });
      await invalidarAusencias();
      setAusenciaInicio("");
      setAusenciaFim("");
      setAusenciaMotivo("");
      toast({ title: "Ausência marcada" });
    } catch (err) {
      toast({
        title: "Não deu para marcar a ausência",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const removerAusencia = async (ausenciaId: string) => {
    try {
      await deleteAusencia.mutateAsync({ lojaId: activeLojaId!, ausenciaId });
      await invalidarAusencias();
      toast({ title: "Ausência removida" });
    } catch (err) {
      toast({
        title: "Não deu para remover",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const regra = disponibilidade.data;

  /**
   * D13 (E93): isto era um `useEffect` que copiava a regra do servidor para
   * três `useState`, com `[regra]` na dependência — e `regra` é
   * `disponibilidade.data`, cuja REFERÊNCIA muda a cada refetch bem-sucedido.
   * A sequência real: a pessoa digita a nova hora de fechamento ("20"),
   * alt-tab para conferir a escala no WhatsApp, volta, o refetch por foco de
   * janela dispara, o effect roda e devolve o "19" do servidor ao campo. A
   * digitação sumia sem uma palavra, e ela salvava o horário antigo achando
   * que salvou o novo.
   *
   * `values` + `keepDirtyValues` é o mesmo "copiar do servidor" feito por quem
   * sabe a diferença entre um campo intocado e um campo sujo: o intocado
   * acompanha o servidor, o sujo é da pessoa até ela salvar ou sair.
   * Era a última tela do app com o padrão do effect — as outras 11 já usavam
   * `react-hook-form`.
   */
  const form = useForm<{
    abertura: string;
    fechamento: string;
    dias: number[];
    duracaoProvaMin: string;
    lavagemEstoqueDias: string;
    // E222 — o SEGUNDO expediente, o de retirada e devolução (cláusula 4ª). Em
    // "HH:MM" porque a cláusula abre 10:30, e hora inteira não escreve meia
    // hora; o servidor conta em minutos desde a meia-noite.
    retiradaAbertura: string;
    retiradaFechamento: string;
    retiradaFechamentoSabado: string;
    retiradaDias: number[];
  }>({
    defaultValues: {
      abertura: "",
      fechamento: "",
      dias: [],
      duracaoProvaMin: "",
      lavagemEstoqueDias: "",
      retiradaAbertura: "",
      retiradaFechamento: "",
      retiradaFechamentoSabado: "",
      retiradaDias: [],
    },
    values: regra
      ? {
          abertura: String(regra.atendimentoAberturaHora),
          fechamento: String(regra.atendimentoFechamentoHora),
          // E222 — os quatro do expediente de retirada. O fallback é o do
          // contrato, e acompanha o default do schema pela mesma razão escrita
          // na linha dos dias de atendimento: a mesma premissa em três lugares
          // é a mesma que pode divergir em três.
          // C9 da conferência (16/08, S-C180): eram 630/1140/1080/[2..6] à mão —
          // a cópia literal da constante que `agenda-core` já exporta.
          retiradaAbertura: hhmm(regra.retiradaAberturaMinutos ?? EXPEDIENTE_DE_RETIRADA_PADRAO.aberturaMinutos),
          retiradaFechamento: hhmm(regra.retiradaFechamentoMinutos ?? EXPEDIENTE_DE_RETIRADA_PADRAO.fechamentoMinutos),
          retiradaFechamentoSabado: hhmm(regra.retiradaFechamentoSabadoMinutos ?? EXPEDIENTE_DE_RETIRADA_PADRAO.fechamentoSabadoMinutos),
          retiradaDias: regra.retiradaDias ?? [...EXPEDIENTE_DE_RETIRADA_PADRAO.dias],
          // Dias em que a loja abre (E38): 0=domingo … 6=sábado. O fallback
          // acompanha o default do schema (S-A8: era `[1..6]` aqui e no
          // servidor, e os dois tinham de mudar juntos — a mesma premissa
          // escrita em três lugares é a mesma que pode divergir em três).
          dias: regra.diasFuncionamento ?? [0, 1, 2, 3, 4, 5, 6],
          // S-A10: a dona fala em MINUTOS; o banco conta em slots de 30 min
          // (S-A7, `2` = 1h). A conversão é a régua de `lib/duracao-da-prova`.
          duracaoProvaMin: String(minutosDaProva(regra.provaDuracao)),
          // S-A16: a lavagem da peça de ESTOQUE, separada da do vestido —
          // decidida configurável em 2026-08-07; 0 = sem lavagem na conta.
          lavagemEstoqueDias: String(regra.estoqueLavagemDiasDepois ?? 0),
        }
      : undefined,
    resetOptions: { keepDirtyValues: true },
  });

  // E133/B7: o sujo desta tela tem DUAS fontes — o form do horário (que dá
  // reset ao salvar) e o nome de cabine digitado no input solto.
  useConfirmarSaida(sujoParaConfirmar(form.formState, nomeCabine.trim() !== ""));

  const salvarHorario = async () => {
    const {
      abertura,
      fechamento,
      dias,
      duracaoProvaMin,
      lavagemEstoqueDias,
      retiradaAbertura,
      retiradaFechamento,
      retiradaFechamentoSabado,
      retiradaDias,
    } = form.getValues();
    // E222 — "HH:MM" na tela, minutos desde a meia-noite no servidor.
    // S-C221: sem `contratos.editar` os campos da 4ª nem entram no corpo (o
    // servidor recusaria o PUT inteiro com 403), então as paredes deles só
    // valem para quem pode mandá-los — e o payload nasce DENTRO da guarda,
    // onde o narrowing dispensa asserção (a varredura S-O66 conta cada `!`).
    let camposDaClausula4a: {
      retiradaAberturaMinutos?: number;
      retiradaFechamentoMinutos?: number;
      retiradaFechamentoSabadoMinutos?: number;
      retiradaDias?: number[];
    } = {};
    if (podeEditarClausula4a) {
      const rAbertura = minutosDoRelogio(retiradaAbertura);
      const rFechamento = minutosDoRelogio(retiradaFechamento);
      const rSabado = minutosDoRelogio(retiradaFechamentoSabado);
      if (rAbertura === null || rFechamento === null || rSabado === null) {
        toast({
          title: "Horário de retirada inválido",
          description: "Informe as três horas no formato 10:30.",
          variant: "destructive",
        });
        return;
      }
      // A mesma parede do servidor, e no sábado também: sem isso o expediente
      // salvaria invertido e nenhuma retirada seria aceita depois.
      if (rAbertura >= rFechamento || rAbertura >= rSabado) {
        toast({
          title: "Horário de retirada inválido",
          description: "A abertura tem de ser antes do fechamento, no sábado também.",
          variant: "destructive",
        });
        return;
      }
      if (retiradaDias.length === 0) {
        toast({
          title: "Escolha ao menos um dia de retirada",
          description: "Sem nenhum dia, nenhuma data de retirada ou devolução seria aceita.",
          variant: "destructive",
        });
        return;
      }
      camposDaClausula4a = {
        retiradaAberturaMinutos: rAbertura,
        retiradaFechamentoMinutos: rFechamento,
        retiradaFechamentoSabadoMinutos: rSabado,
        retiradaDias: [...retiradaDias].sort((x, y) => x - y),
      };
    }
    const a = Number(abertura);
    const f = Number(fechamento);
    const lavagemEstoque = Number(lavagemEstoqueDias);
    if (!Number.isInteger(lavagemEstoque) || lavagemEstoque < 0) {
      toast({
        title: "Lavagem do estoque inválida",
        description: "Informe os dias em número inteiro — 0 desliga a lavagem da conta.",
        variant: "destructive",
      });
      return;
    }
    // O select só oferece múltiplos de 30, então isto não dispara por gesto —
    // é a guarda contra um estado que não veio dele (a rota aceita 0, S-A7).
    const duracaoProva = slotsDaProva(Number(duracaoProvaMin));
    if (!Number.isInteger(duracaoProva) || duracaoProva < 1) {
      toast({
        title: "Duração da prova inválida",
        description: "Escolha uma das durações da lista.",
        variant: "destructive",
      });
      return;
    }
    if (!Number.isInteger(a) || !Number.isInteger(f) || a < 0 || f > 24 || a >= f) {
      toast({
        title: "Horário inválido",
        description: "A abertura deve ser antes do fechamento (0h a 24h).",
        variant: "destructive",
      });
      return;
    }
    if (dias.length === 0) {
      toast({
        title: "Escolha ao menos um dia",
        description: "Sem nenhum dia aberto, a agenda fica fechada a semana inteira.",
        variant: "destructive",
      });
      return;
    }
    try {
      // Preserva os demais campos da regra de disponibilidade.
      await setDisponibilidade.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          provaDiasAntes: regra?.provaDiasAntes,
          // S-A10: o único campo do bloco de disponibilidade que não tinha
          // contrapartida editável — e o "Editar" de Configurações sempre
          // apontou para cá. A rota conta em SLOTS; a tela, em minutos.
          provaDuracao: duracaoProva,
          usoDiasAntes: regra?.usoDiasAntes,
          usoDiasDepois: regra?.usoDiasDepois,
          lavagemDiasDepois: regra?.lavagemDiasDepois,
          // S-A16: o campo novo da tela — os demais seguem preservados acima.
          estoqueLavagemDiasDepois: lavagemEstoque,
          atendimentoAberturaHora: a,
          atendimentoFechamentoHora: f,
          diasFuncionamento: [...dias].sort((x, y) => x - y),
          // E222 — o segundo expediente (cláusula 4ª), salvo no mesmo gesto.
          // S-C221: só entra no corpo com `contratos.editar` — este PUT é
          // upsert parcial, e campo ausente preserva o gravado.
          ...camposDaClausula4a,
        },
      });
      // Salvou: o que estava sujo virou o valor do servidor. Sem este reset o
      // `keepDirtyValues` continuaria protegendo campos que já não divergem.
      form.reset({
        abertura,
        fechamento,
        dias,
        duracaoProvaMin,
        lavagemEstoqueDias,
        retiradaAbertura,
        retiradaFechamento,
        retiradaFechamentoSabado,
        retiradaDias,
      });
      await queryClient.invalidateQueries({
        queryKey: getGetDisponibilidadeQueryKey(activeLojaId!),
      });
      toast({ title: "Horário salvo" });
    } catch (err) {
      toast({
        title: "Não deu para salvar horário",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const alternarCabine = async (cabineId: string, ativo: boolean) => {
    try {
      /**
       * G6: contado ANTES do PATCH — o invalidate que vem depois derruba a
       * lista, e o número que interessa é o do momento da decisão.
       *
       * **S-O22 — e contado no BANCO, não na rede.** A tela baixava a agenda
       * futura INTEIRA da loja, no carregamento, só para produzir este número —
       * que é por cabine, e só quando alguém desativa uma. Com três anos de
       * loja são milhares de linhas para responder "quantos ficam nesta". É a
       * lente 3 do E62/D4, e o recorte que faltava (`?cabineId=`) agora existe,
       * ao lado dos irmãos `leadId` e `bloqueioId`.
       *
       * A consulta é sob demanda — só o clique em desativar a dispara, e é o
       * único momento em que o número importa.
       */
      const ficam = ativo
        ? 0
        : atendimentosNaCabine(
            await listAtendimentos(activeLojaId!, { de: hojeLocal(), cabineId }),
            cabineId,
          );
      await updateCabine.mutateAsync({ lojaId: activeLojaId!, cabineId, data: { ativo } });
      await queryClient.invalidateQueries({ queryKey: getListCabinesQueryKey(activeLojaId!) });
      toast({
        title: ativo ? "Cabine reativada" : "Cabine desativada",
        description:
          ficam > 0
            ? `${ficam} atendimento${ficam === 1 ? "" : "s"} continua${ficam === 1 ? "" : "m"} marcado${ficam === 1 ? "" : "s"} nela — a coluna segue na grade, marcada como desativada, até você remarcar.`
            : undefined,
      });
    } catch (err) {
      toast({
        title: "Não deu para atualizar cabine",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const adicionarCabine = async () => {
    const nome = nomeCabine.trim();
    if (!nome) return;
    try {
      await createCabine.mutateAsync({ lojaId: activeLojaId!, data: { nome } });
      await queryClient.invalidateQueries({ queryKey: getListCabinesQueryKey(activeLojaId!) });
      toast({ title: "Cabine adicionada" });
      setNomeCabine("");
    } catch (err) {
      toast({
        title: "Não deu para adicionar cabine",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/loja/${lojaId}/atendimentos/novo`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Agendar
        </Link>
        <h1 className="text-3xl font-serif mt-1">Cabines &amp; horário</h1>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Horário de funcionamento</CardTitle>
        </CardHeader>
        <CardContent>
          {podeEditar ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="abertura">Abre (h)</Label>
                  <Input
                    id="abertura"
                    type="number"
                    min={0}
                    max={23}
                    className="w-24"
                    {...form.register("abertura")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fechamento">Fecha (h)</Label>
                  <Input
                    id="fechamento"
                    type="number"
                    min={1}
                    max={24}
                    className="w-24"
                    {...form.register("fechamento")}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Dias de funcionamento</Label>
                <Controller
                  control={form.control}
                  name="dias"
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-1.5">
                      {DIAS_ROTULO.map((rot, n) => {
                        const aberto = field.value.includes(n);
                        return (
                          <Button
                            key={n}
                            type="button"
                            size="sm"
                            variant={aberto ? "default" : "outline"}
                            aria-pressed={aberto}
                            data-testid={`dia-func-${n}`}
                            onClick={() =>
                              field.onChange(
                                aberto
                                  ? field.value.filter((d) => d !== n)
                                  : [...field.value, n],
                              )
                            }
                          >
                            {rot}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                {/* S-A10 — a única linha do bloco de disponibilidade que não
                    tinha onde ser editada; o "Editar" de Configurações sempre
                    apontou para esta tela. Em MINUTOS (S-A7): o banco conta em
                    slots de 30 min e "2" na tela seria uma prova de 2 minutos
                    para quem lê. As opções vêm da régua de
                    `lib/duracao-da-prova`, com o valor vigente sempre listado. */}
                <Label htmlFor="duracao-prova">Duração da prova</Label>
                <Controller
                  control={form.control}
                  name="duracaoProvaMin"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="duracao-prova" className="w-40" data-testid="duracao-prova">
                        <SelectValue placeholder="Escolher duração" />
                      </SelectTrigger>
                      <SelectContent>
                        {opcoesDeDuracaoDaProva(Number(field.value) || 60).map((min) => (
                          <SelectItem key={min} value={String(min)}>
                            {min} min
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Quanto tempo cada prova ocupa na agenda — as cabines ficam reservadas por esse
                  período.
                </p>
              </div>
              <div className="space-y-1.5">
                {/* S-A16 — decidido em 2026-08-07: a lavagem da peça de ESTOQUE
                    (saiote, véu, bolero) é da loja, separada da semana do
                    vestido. 0 = a peça volta à arara no dia da devolução, que
                    é como o sistema sempre contou. */}
                <Label htmlFor="lavagem-estoque">Lavagem do estoque (dias)</Label>
                <Input
                  id="lavagem-estoque"
                  type="number"
                  min={0}
                  className="w-24"
                  data-testid="lavagem-estoque"
                  {...form.register("lavagemEstoqueDias")}
                />
                <p className="text-xs text-muted-foreground">
                  Dias que a peça de estoque fica na lavagem depois de devolvida, antes de contar
                  como disponível de novo. Zero desliga a lavagem da conta.
                </p>
              </div>
              {/* E222 — o SEGUNDO expediente. O de cima governa ATENDIMENTO
                  (as provas, e está certo: o ateliê atende sete dias, com hora
                  marcada até aos domingos — S-A8). Este governa a peça SAINDO e
                  VOLTANDO, que a cláusula 4ª do contrato trata separado. Ficam
                  no mesmo cartão de propósito: quem vem mudar horário tem de
                  ver que são dois, senão muda um achando que mudou os dois. */}
              <div className="space-y-4 border-t pt-4">
                <div>
                  <Label className="text-sm font-medium">Retirada e devolução</Label>
                  <p className="text-xs text-muted-foreground">
                    Quando a loja entrega a peça e a recebe de volta — o contrato de locação
                    (cláusula 4ª) trata isso separado das provas. Fora deste expediente, o
                    contrato recusa a data e diz o porquê.
                  </p>
                  {/* S-C221: quem não decide sobre contrato vê e não mexe — o
                      servidor recusaria com 403, e oferecer o campo seria
                      oferecer o erro. */}
                  {!podeEditarClausula4a && (
                    <p className="text-xs text-muted-foreground" data-testid="clausula-4a-so-leitura">
                      Este expediente é cláusula do contrato — mudá-lo pede permissão de editar
                      contratos.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="retirada-abertura">Abre</Label>
                    <Input
                      id="retirada-abertura"
                      type="time"
                      className="w-32"
                      data-testid="retirada-abertura"
                      disabled={!podeEditarClausula4a}
                      {...form.register("retiradaAbertura")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="retirada-fechamento">Fecha</Label>
                    <Input
                      id="retirada-fechamento"
                      type="time"
                      className="w-32"
                      data-testid="retirada-fechamento"
                      disabled={!podeEditarClausula4a}
                      {...form.register("retiradaFechamento")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    {/* O sábado tem o seu porque o contrato dá a ele expediente
                        mais curto — um número só recusaria 18:30 numa quarta
                        (que o contrato permite) ou aceitaria no sábado (que
                        ele não permite). */}
                    <Label htmlFor="retirada-fechamento-sabado">Fecha no sábado</Label>
                    <Input
                      id="retirada-fechamento-sabado"
                      type="time"
                      className="w-32"
                      data-testid="retirada-fechamento-sabado"
                      disabled={!podeEditarClausula4a}
                      {...form.register("retiradaFechamentoSabado")}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Dias de retirada e devolução</Label>
                  <Controller
                    control={form.control}
                    name="retiradaDias"
                    render={({ field }) => (
                      <div className="flex flex-wrap gap-1.5">
                        {DIAS_ROTULO.map((rot, n) => {
                          const aberto = field.value.includes(n);
                          return (
                            <Button
                              key={n}
                              type="button"
                              size="sm"
                              variant={aberto ? "default" : "outline"}
                              aria-pressed={aberto}
                              data-testid={`dia-retirada-${n}`}
                              disabled={!podeEditarClausula4a}
                              onClick={() =>
                                field.onChange(
                                  aberto
                                    ? field.value.filter((d) => d !== n)
                                    : [...field.value, n],
                                )
                              }
                            >
                              {rot}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  />
                </div>
              </div>
              <Button
                variant="outline"
                onClick={salvarHorario}
                disabled={setDisponibilidade.isPending || disponibilidade.isLoading}
              >
                {setDisponibilidade.isPending ? "Salvando…" : "Salvar expediente"}
              </Button>
            </div>
          ) : (
            <p className="text-sm">
              {regra
                ? `${regra.atendimentoAberturaHora}h às ${regra.atendimentoFechamentoHora}h · ${
                    regra.diasFuncionamento?.map((d) => DIAS_ROTULO[d]).join(", ") ?? "—"
                  } · prova de ${minutosDaProva(regra.provaDuracao)} min` +
                  // E222 — quem só LÊ a tela também precisa saber que são dois
                  // expedientes; sem esta linha o segundo só existiria para
                  // quem tem permissão de editar.
                  ` · retirada ${hhmm(regra.retiradaAberturaMinutos ?? EXPEDIENTE_DE_RETIRADA_PADRAO.aberturaMinutos)}–${hhmm(
                    regra.retiradaFechamentoMinutos ?? EXPEDIENTE_DE_RETIRADA_PADRAO.fechamentoMinutos,
                  )} (sáb. até ${hhmm(regra.retiradaFechamentoSabadoMinutos ?? EXPEDIENTE_DE_RETIRADA_PADRAO.fechamentoSabadoMinutos)}) · ${
                    (regra.retiradaDias ?? EXPEDIENTE_DE_RETIRADA_PADRAO.dias).map((d) => DIAS_ROTULO[d]).join(", ")
                  }`
                : "Carregando…"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Cabines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {cabines.isLoading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-10 bg-muted rounded-md" />
              ))}
            </div>
          ) : (cabines.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma cabine cadastrada.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {cabines.data?.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span
                    className={`text-sm ${c.ativo ? "" : "text-muted-foreground line-through"}`}
                  >
                    {c.nome}
                  </span>
                  {podeEditar && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {c.ativo ? "Ativa" : "Inativa"}
                      </span>
                      <Switch
                        checked={c.ativo}
                        disabled={updateCabine.isPending}
                        onCheckedChange={(ativo) => alternarCabine(c.id, ativo)}
                        aria-label={`${c.ativo ? "Desativar" : "Ativar"} ${c.nome}`}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {podeCriarCabine && (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                adicionarCabine();
              }}
            >
              <Input
                value={nomeCabine}
                onChange={(e) => setNomeCabine(e.target.value)}
                placeholder="Nova cabine (ex.: Cabine 1)"
                aria-label="Nome da cabine"
                className="flex-1"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={createCabine.isPending || !nomeCabine.trim()}
              >
                {createCabine.isPending ? "Adicionando…" : "Adicionar"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* E151 — quem falta, e quando.
          Mora aqui, e não em Equipe, porque o gate é o mesmo da API (`agenda`):
          quem marca o dia é quem sabe quem falta. Em Equipe (módulo `admin`) a
          pessoa que cuida da agenda não alcançaria a tela. */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Ausências da equipe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Férias, folga, viagem. Nos dias marcados a agenda recusa novo
            atendimento com essa pessoa — o que já estava marcado não é alterado.
          </p>

          {ausencias.isLoading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-10 bg-muted rounded-md" />
              ))}
            </div>
          ) : (ausencias.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém marcado como ausente.</p>
          ) : (
            <ul className="divide-y rounded-lg border" data-testid="lista-ausencias">
              {ausencias.data?.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{a.usuarioNome ?? "Equipe"}</span>
                    <span className="text-xs text-muted-foreground">
                      {diaMesAno(a.inicio)} a {diaMesAno(a.fim)}
                      {a.motivo ? ` · ${a.motivo}` : ""}
                    </span>
                  </span>
                  {podeEditar && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deleteAusencia.isPending}
                          aria-label={`Remover ausência de ${a.usuarioNome ?? "equipe"}`}
                        >
                          Remover
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Remover a ausência de {a.usuarioNome ?? "quem falta"}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Esses dias voltam a aceitar agendamento com essa pessoa. O que já
                            estava marcado não muda — a ausência nunca o tocou.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removerAusencia(a.id)}>
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </li>
              ))}
            </ul>
          )}

          {podeEditar && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                adicionarAusencia();
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="ausencia-pessoa">Quem</Label>
                <Select value={ausenciaUsuario} onValueChange={setAusenciaUsuario}>
                  <SelectTrigger id="ausencia-pessoa" className="w-48">
                    <SelectValue placeholder="Escolher pessoa" />
                  </SelectTrigger>
                  <SelectContent>
                    {(equipe.data ?? []).map((m) => (
                      <SelectItem key={m.usuarioId} value={m.usuarioId}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ausencia-inicio">Do dia</Label>
                <Input
                  id="ausencia-inicio"
                  type="date"
                  value={ausenciaInicio}
                  onChange={(e) => setAusenciaInicio(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-1">
                {/* "Até o dia" e não "até": o último dia CONTA, e a frase é a
                    única coisa que diz isso a quem digita. */}
                <Label htmlFor="ausencia-fim">Até o dia (inclusive)</Label>
                <Input
                  id="ausencia-fim"
                  type="date"
                  value={ausenciaFim}
                  onChange={(e) => setAusenciaFim(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-1 flex-1 min-w-40">
                <Label htmlFor="ausencia-motivo">Motivo</Label>
                <Input
                  id="ausencia-motivo"
                  value={ausenciaMotivo}
                  onChange={(e) => setAusenciaMotivo(e.target.value)}
                  placeholder="Férias"
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={createAusencia.isPending || !ausenciaUsuario || !ausenciaInicio || !ausenciaFim}
              >
                {createAusencia.isPending ? "Marcando…" : "Marcar ausência"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
