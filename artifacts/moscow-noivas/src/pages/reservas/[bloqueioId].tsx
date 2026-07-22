import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useListBloqueios,
  getListBloqueiosQueryKey,
  useUpdateBloqueio,
  useListAtendimentos,
  getListAtendimentosQueryKey,
  getListAjustesQueryKey,
  useCreateAjuste,
  useUpdateAjuste,
  useDeleteAjuste,
  useAddChecklistItem,
  useUpdateChecklistItem,
  useRemoveChecklistItem,
  useListAvarias,
  getListAvariasQueryKey,
  useCreateAvaria,
  useDeleteAvaria,
  useListContratos,
  getListContratosQueryKey,
  useCreateParcelaAvulsa,
  type Ajuste,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { AlertCircle, ArrowLeft, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { diaParaISO } from "@/lib/formatos";
import { dataCurtaFmt, isoParaDia } from "../noivas/helpers";
import { ROTULO_SITUACAO, dataHoraFmt, dataLongaUTCFmt } from "./helpers";
import { podeNoModulo } from "@/lib/permissoes";

/**
 * Detalhe da reserva (porte da /reservas/[bloqueioId] do feat/orcamentos) — o
 * lar das provas e ajustes da noiva: a reserva (noiva + vestido + ocupação),
 * a movimentação do vestido (retirada/devolução) e, dentro de cada prova, os
 * ajustes de costura com checklist. A prova em si é agendada na Agenda — aqui
 * há leitura da prova + o atalho "Agendar prova".
 */
export default function ReservaDetalhe() {
  const { lojaId, bloqueioId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const bloqueios = useListBloqueios(activeLojaId!, undefined, {
    query: { queryKey: getListBloqueiosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const atendimentos = useListAtendimentos(activeLojaId!, {
    query: { queryKey: getListAtendimentosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  const updateBloqueio = useUpdateBloqueio();
  const createAjuste = useCreateAjuste();
  const updateAjuste = useUpdateAjuste();
  const deleteAjuste = useDeleteAjuste();
  const addItem = useAddChecklistItem();
  const updateItem = useUpdateChecklistItem();
  const removeItem = useRemoveChecklistItem();

  // Sem GET de bloqueio único: encontra na lista da loja.
  const reserva = useMemo(
    () => (bloqueios.data ?? []).find((b) => b.id === bloqueioId) ?? null,
    [bloqueios.data, bloqueioId],
  );

  // E71: as avarias deste bloqueio + o contrato ATIVO da noiva (para o custo
  // do reparo poder virar parcela cobrável).
  const avarias = useListAvarias(activeLojaId!, bloqueioId!, {
    query: {
      queryKey: getListAvariasQueryKey(activeLojaId!, bloqueioId!),
      enabled: !!activeLojaId && !!bloqueioId,
    },
  });
  const contratosDaNoiva = useListContratos(
    activeLojaId!,
    { leadId: reserva?.leadId ?? "" },
    {
      query: {
        queryKey: getListContratosQueryKey(activeLojaId!, { leadId: reserva?.leadId ?? "" }),
        enabled: !!activeLojaId && !!reserva?.leadId,
      },
    },
  );
  const contratoAtivo = (contratosDaNoiva.data ?? []).find((c) => c.status === "ATIVO") ?? null;
  const createAvaria = useCreateAvaria();
  const deleteAvaria = useDeleteAvaria();
  const createParcelaAvulsa = useCreateParcelaAvulsa();

  const [avariaDescricao, setAvariaDescricao] = useState("");
  const [avariaCusto, setAvariaCusto] = useState("");
  const [avariaFotoBase64, setAvariaFotoBase64] = useState<string | null>(null);
  const [avariaFotoNome, setAvariaFotoNome] = useState<string | null>(null);

  const aoEscolherFotoAvaria = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    if (arquivo.size > 2 * 1024 * 1024) {
      toast({ title: "Foto acima de 2MB", description: "Escolha uma imagem menor.", variant: "destructive" });
      return;
    }
    const buf = await arquivo.arrayBuffer();
    let binario = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    setAvariaFotoBase64(btoa(binario));
    setAvariaFotoNome(arquivo.name);
  };

  const registrarAvaria = () =>
    comToast(
      async () => {
        const custo = avariaCusto.trim() ? Number(avariaCusto.replace(",", ".")) : undefined;
        await createAvaria.mutateAsync({
          lojaId: activeLojaId!,
          bloqueioId: bloqueioId!,
          data: {
            descricao: avariaDescricao.trim(),
            ...(custo !== undefined && Number.isFinite(custo) ? { custoReparo: custo } : {}),
            ...(avariaFotoBase64 ? { fotoBase64: avariaFotoBase64 } : {}),
          },
        });
        await queryClient.invalidateQueries({
          queryKey: getListAvariasQueryKey(activeLojaId!, bloqueioId!),
        });
        setAvariaDescricao("");
        setAvariaCusto("");
        setAvariaFotoBase64(null);
        setAvariaFotoNome(null);
      },
      "Avaria registrada",
      "Erro ao registrar a avaria",
    );

  const cobrarReparo = (avaria: { descricao: string; custoReparo?: number | null }) =>
    comToast(
      async () => {
        if (!contratoAtivo || !avaria.custoReparo) return;
        const vencimento = new Date();
        vencimento.setDate(vencimento.getDate() + 7);
        await createParcelaAvulsa.mutateAsync({
          lojaId: activeLojaId!,
          contratoId: contratoAtivo.id,
          data: {
            descricao: `Reparo de avaria — ${avaria.descricao}`.slice(0, 200),
            valorPrevisto: avaria.custoReparo,
            vencimento: vencimento.toISOString(),
          },
        });
      },
      "Cobrança criada — entrou como parcela do contrato",
      "Erro ao criar a cobrança",
    );
  const provas = useMemo(
    () =>
      (atendimentos.data ?? [])
        .filter((a) => a.bloqueioId === bloqueioId && a.tipo === "PROVA")
        .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()),
    [atendimentos.data, bloqueioId],
  );
  const podeMovimentar = podeNoModulo(acessosModulos, "vestidos", "editar");
  const podeAjustes = podeNoModulo(acessosModulos, "agenda", "ver");

  // Formularios locais: data da retirada/devolução, novo ajuste por prova,
  // novo item de checklist por ajuste, ajuste aguardando confirmação de remoção.
  const casamentoYmd = reserva?.casamentoData ? isoParaDia(reserva.casamentoData) : "";
  const [dataMovimentacao, setDataMovimentacao] = useState<string | null>(null);
  const [novoAjuste, setNovoAjuste] = useState<Record<string, string>>({});
  const [novoItem, setNovoItem] = useState<Record<string, string>>({});
  const [ajusteParaRemover, setAjusteParaRemover] = useState<Ajuste | null>(null);

  const dataMovimentacaoAtual = dataMovimentacao ?? casamentoYmd;

  const invalidarAjustes = () =>
    Promise.all([
      // Ajustes aninham em atendimentos → invalida as duas listas.
      queryClient.invalidateQueries({ queryKey: getListAjustesQueryKey(activeLojaId!) }),
      queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) }),
    ]);

  const comToast = async (fn: () => Promise<unknown>, titulo: string, tituloErro: string) => {
    try {
      await fn();
      toast({ title: titulo });
    } catch (err) {
      toast({
        title: tituloErro,
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const registrarMovimentacao = (campo: "retiradaDataReal" | "devolucaoDataReal") =>
    comToast(
      async () => {
        await updateBloqueio.mutateAsync({
          lojaId: activeLojaId!,
          bloqueioId: bloqueioId!,
          data: { [campo]: diaParaISO(dataMovimentacaoAtual) },
        });
        await queryClient.invalidateQueries({ queryKey: getListBloqueiosQueryKey(activeLojaId!) });
        setDataMovimentacao(null);
      },
      "Movimentação registrada",
      "Erro ao registrar a movimentação",
    );

  // E61: a data registrada errada tem conserto — null explícito desfaz, e a
  // disponibilidade do vestido volta a valer a régua anterior.
  const desfazerMovimentacao = (campo: "retiradaDataReal" | "devolucaoDataReal") =>
    comToast(
      async () => {
        await updateBloqueio.mutateAsync({
          lojaId: activeLojaId!,
          bloqueioId: bloqueioId!,
          data: { [campo]: null },
        });
        await queryClient.invalidateQueries({ queryKey: getListBloqueiosQueryKey(activeLojaId!) });
      },
      "Movimentação desfeita",
      "Erro ao desfazer a movimentação",
    );

  const alternarAjuste = (ajuste: Ajuste) =>
    comToast(
      async () => {
        await updateAjuste.mutateAsync({
          lojaId: activeLojaId!,
          ajusteId: ajuste.id,
          data: { status: ajuste.status === "FEITO" ? "PENDENTE" : "FEITO" },
        });
        await invalidarAjustes();
      },
      "Ajuste atualizado",
      "Erro ao atualizar o ajuste",
    );

  const removerAjusteConfirmado = () => {
    const ajuste = ajusteParaRemover;
    setAjusteParaRemover(null);
    if (!ajuste) return;
    return comToast(
      async () => {
        await deleteAjuste.mutateAsync({ lojaId: activeLojaId!, ajusteId: ajuste.id });
        await invalidarAjustes();
      },
      "Ajuste removido",
      "Erro ao remover o ajuste",
    );
  };

  const adicionarAjuste = (atendimentoId: string) => {
    const descricao = (novoAjuste[atendimentoId] ?? "").trim();
    if (!descricao) {
      toast({ title: "Descreva o ajuste.", variant: "destructive" });
      return;
    }
    return comToast(
      async () => {
        await createAjuste.mutateAsync({
          lojaId: activeLojaId!,
          data: { atendimentoId, descricao },
        });
        await invalidarAjustes();
        setNovoAjuste((s) => ({ ...s, [atendimentoId]: "" }));
      },
      "Ajuste adicionado",
      "Erro ao adicionar o ajuste",
    );
  };

  const adicionarItem = (ajuste: Ajuste) => {
    const descricao = (novoItem[ajuste.id] ?? "").trim();
    if (!descricao) {
      toast({ title: "Descreva o item do checklist.", variant: "destructive" });
      return;
    }
    const proximaOrdem = Math.max(0, ...(ajuste.checklist ?? []).map((c) => c.ordem)) + 1;
    return comToast(
      async () => {
        await addItem.mutateAsync({
          lojaId: activeLojaId!,
          ajusteId: ajuste.id,
          data: { descricao, ordem: proximaOrdem },
        });
        await invalidarAjustes();
        setNovoItem((s) => ({ ...s, [ajuste.id]: "" }));
      },
      "Checklist atualizado",
      "Erro ao adicionar o item",
    );
  };

  const alternarItem = (itemId: string, feito: boolean) =>
    comToast(
      async () => {
        await updateItem.mutateAsync({ lojaId: activeLojaId!, itemId, data: { feito } });
        await invalidarAjustes();
      },
      "Checklist atualizado",
      "Erro ao atualizar o item",
    );

  const removerItem = (itemId: string) =>
    comToast(
      async () => {
        await removeItem.mutateAsync({ lojaId: activeLojaId!, itemId });
        await invalidarAjustes();
      },
      "Checklist atualizado",
      "Erro ao remover o item",
    );

  if (bloqueios.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erro ao carregar a reserva</AlertTitle>
        <AlertDescription className="flex items-center gap-3">
          <span>
            {bloqueios.error instanceof Error ? bloqueios.error.message : "Falha inesperada."}
          </span>
          <Button variant="outline" size="sm" onClick={() => bloqueios.refetch()}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (bloqueios.isLoading) {
    return <Card className="animate-pulse h-64" />;
  }

  if (!reserva) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Reserva não encontrada</AlertTitle>
          <AlertDescription>Ela pode ter sido cancelada ou removida.</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link to={`/loja/${lojaId}/reservas`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar às reservas
          </Link>
        </Button>
      </div>
    );
  }

  const vestido = reserva.vestido;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <Link
          to={`/loja/${lojaId}/reservas`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Reservas
        </Link>
        <h1 className="text-3xl font-serif">
          {reserva.leadId ? (
            <Link to={`/loja/${lojaId}/noivas/${reserva.leadId}`} className="hover:underline">
              {reserva.lead?.noivaNome ?? "Noiva"}
            </Link>
          ) : (
            (reserva.lead?.noivaNome ?? "Noiva")
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          {vestido ? (
            <Link to={`/loja/${lojaId}/vestidos/${reserva.vestidoId}`} className="hover:underline">
              {vestido.codigo} · {vestido.nome}
            </Link>
          ) : (
            <Link to={`/loja/${lojaId}/vestidos/${reserva.vestidoId}`} className="hover:underline">
              Ver vestido
            </Link>
          )}
          {reserva.casamentoData && (
            <> · casamento {dataCurtaFmt.format(new Date(reserva.casamentoData))}</>
          )}
        </p>
      </div>

      {/* Ocupação física do vestido — honesto e calmo (não é "alerta").
          GAP Onda 4: as FASES do bloco (prova/uso/lavagem) vêm de um motor de
          janelas sem endpoint no client gerado; mostramos só o intervalo
          ocupacaoInicio→ocupacaoFim que o backend já materializa. */}
      {(reserva.ocupacaoInicio || reserva.ocupacaoFim) && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">Indisponível</h2>
          <p className="text-sm">
            {reserva.ocupacaoInicio && <>De {dataLongaUTCFmt.format(new Date(reserva.ocupacaoInicio))} </>}
            {reserva.ocupacaoFim
              ? <>a {dataLongaUTCFmt.format(new Date(reserva.ocupacaoFim))}.</>
              : <>(em aberto, peça ainda fora).</>}
          </p>
        </section>
      )}

      {/* Movimentação do vestido — saída/volta da peça (fecha a jornada) */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">Movimentação</h2>
        {reserva.devolucaoDataReal ? (
          <Card>
            <CardContent className="pt-6 space-y-1">
              <p className="text-sm">
                Devolvido em {dataLongaUTCFmt.format(new Date(reserva.devolucaoDataReal))}.
              </p>
              <p className="text-xs text-muted-foreground">
                A jornada desta noiva está encerrada.
              </p>
              {podeMovimentar && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={updateBloqueio.isPending}
                  onClick={() => desfazerMovimentacao("devolucaoDataReal")}
                  data-testid="desfazer-devolucao"
                >
                  Desfazer devolução
                </Button>
              )}
            </CardContent>
          </Card>
        ) : reserva.retiradaDataReal ? (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm">
                Retirado em {dataLongaUTCFmt.format(new Date(reserva.retiradaDataReal))} — com a
                noiva.
              </p>
              <p className="text-xs text-muted-foreground">
                Enquanto a devolução não for registrada, o vestido fica indisponível para outras
                noivas.
              </p>
              {podeMovimentar && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      Data da devolução
                    </span>
                    <Input
                      type="date"
                      value={dataMovimentacaoAtual}
                      onChange={(e) => setDataMovimentacao(e.target.value)}
                      className="w-44"
                      aria-label="Data da devolução"
                    />
                  </label>
                  <Button
                    disabled={!dataMovimentacaoAtual || updateBloqueio.isPending}
                    onClick={() => registrarMovimentacao("devolucaoDataReal")}
                  >
                    Registrar devolução
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={updateBloqueio.isPending}
                    onClick={() => desfazerMovimentacao("retiradaDataReal")}
                    data-testid="desfazer-retirada"
                  >
                    Desfazer retirada
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm">Vestido ainda no atelier.</p>
              {podeMovimentar && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      Data da retirada
                    </span>
                    <Input
                      type="date"
                      value={dataMovimentacaoAtual}
                      onChange={(e) => setDataMovimentacao(e.target.value)}
                      className="w-44"
                      aria-label="Data da retirada"
                    />
                  </label>
                  <Button
                    disabled={!dataMovimentacaoAtual || updateBloqueio.isPending}
                    onClick={() => registrarMovimentacao("retiradaDataReal")}
                  >
                    Registrar retirada
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      {/* E71: avarias da devolução — registro com foto-evidência e, quando há
          contrato ativo, o custo vira parcela cobrável pela régua de sempre. */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">Avarias</h2>
        <Card>
          <CardContent className="pt-6 space-y-4">
            {(avarias.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma avaria registrada — o vestido voltou como saiu.
              </p>
            ) : (
              <ul className="divide-y">
                {(avarias.data ?? []).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm">{a.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.custoReparo != null && <>reparo estimado R$ {a.custoReparo.toFixed(2).replace(".", ",")} · </>}
                        {a.registradoPorNome && <>{a.registradoPorNome} · </>}
                        {dataCurtaFmt.format(new Date(a.criadaEm))}
                        {a.temFoto && (
                          <>
                            {" · "}
                            <a
                              href={`/api/lojas/${activeLojaId}/avarias/${a.id}/foto`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary underline underline-offset-4"
                            >
                              ver foto
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                    {podeMovimentar && (
                      <span className="flex items-center gap-1">
                        {contratoAtivo && a.custoReparo != null && a.custoReparo > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={createParcelaAvulsa.isPending}
                            onClick={() => cobrarReparo(a)}
                            data-testid={`cobrar-reparo-${a.id}`}
                          >
                            Cobrar reparo
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Remover avaria"
                          onClick={() =>
                            comToast(
                              async () => {
                                await deleteAvaria.mutateAsync({ lojaId: activeLojaId!, avariaId: a.id });
                                await queryClient.invalidateQueries({
                                  queryKey: getListAvariasQueryKey(activeLojaId!, bloqueioId!),
                                });
                              },
                              "Avaria removida",
                              "Erro ao remover a avaria",
                            )
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {podeMovimentar && (
              <div className="space-y-2 border-t pt-4">
                <Input
                  placeholder="O que aconteceu com o vestido? (ex.: barra rasgada)"
                  value={avariaDescricao}
                  onChange={(e) => setAvariaDescricao(e.target.value)}
                  aria-label="Descrição da avaria"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Custo do reparo (R$, opcional)"
                    value={avariaCusto}
                    onChange={(e) => setAvariaCusto(e.target.value)}
                    className="w-52"
                    aria-label="Custo do reparo"
                  />
                  <label className="text-sm text-primary underline underline-offset-4 cursor-pointer">
                    {avariaFotoNome ?? "Anexar foto"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => aoEscolherFotoAvaria(e.target.files?.[0])}
                    />
                  </label>
                  <Button
                    size="sm"
                    disabled={!avariaDescricao.trim() || createAvaria.isPending}
                    onClick={registrarAvaria}
                    data-testid="registrar-avaria"
                  >
                    Registrar avaria
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Provas da reserva + ajustes de costura com checklist */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">Provas</h2>
          {reserva.leadId && (
            <Button variant="outline" size="sm" asChild>
              <Link
                to={`/loja/${lojaId}/atendimentos/novo?noiva=${reserva.leadId}&tipo=PROVA&reserva=${bloqueioId}`}
              >
                Agendar prova
              </Link>
            </Button>
          )}
        </div>

        {atendimentos.isLoading ? (
          <Card className="animate-pulse h-32" />
        ) : provas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma prova agendada ainda.</p>
        ) : (
          <ul className="space-y-4">
            {provas.map((p) => (
              <li key={p.id}>
                <Card>
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">
                          {dataHoraFmt.format(new Date(p.inicio))}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {[p.cabine?.nome, p.vendedora?.nome].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </div>
                      <Badge variant="secondary">{ROTULO_SITUACAO[p.situacao] ?? p.situacao}</Badge>
                    </div>

                    {p.observacao && (
                      <p className="text-sm text-muted-foreground">{p.observacao}</p>
                    )}

                    {/* Ajustes desta prova */}
                    <div className="space-y-2 border-t pt-3">
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">
                        Ajustes
                      </span>
                      {(p.ajustes ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sem ajustes nesta prova.</p>
                      ) : (
                        <ul className="space-y-3">
                          {(p.ajustes ?? []).map((a) => {
                            const feito = a.status === "FEITO";
                            return (
                              <li key={a.id} className="space-y-1.5">
                                <div className="flex items-center justify-between gap-3">
                                  <span
                                    className={`text-sm ${
                                      feito ? "text-muted-foreground line-through" : ""
                                    }`}
                                  >
                                    {a.descricao}
                                  </span>
                                  {podeAjustes && (
                                    <div className="flex shrink-0 items-center gap-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={updateAjuste.isPending}
                                        onClick={() => alternarAjuste(a)}
                                      >
                                        {feito ? "Reabrir" : "Marcar feito"}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={deleteAjuste.isPending}
                                        onClick={() => setAjusteParaRemover(a)}
                                      >
                                        Remover
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                {/* Checklist de costura */}
                                {(a.checklist ?? []).length > 0 && (
                                  <ul className="space-y-1 pl-3">
                                    {(a.checklist ?? []).map((c) => (
                                      <li
                                        key={c.id}
                                        className="flex items-center justify-between gap-3"
                                      >
                                        <label className="flex items-center gap-2">
                                          <Checkbox
                                            checked={c.feito}
                                            disabled={!podeAjustes || updateItem.isPending}
                                            onCheckedChange={(v) => alternarItem(c.id, v === true)}
                                            aria-label={`Item ${c.descricao}`}
                                          />
                                          <span
                                            className={`text-xs ${
                                              c.feito
                                                ? "text-muted-foreground line-through"
                                                : "text-foreground"
                                            }`}
                                          >
                                            {c.descricao}
                                          </span>
                                        </label>
                                        {podeAjustes && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            disabled={removeItem.isPending}
                                            onClick={() => removerItem(c.id)}
                                            aria-label={`Remover item ${c.descricao}`}
                                          >
                                            <X className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}

                                {/* Adicionar item ao checklist */}
                                {podeAjustes && (
                                  <form
                                    className="flex items-center gap-2 pl-3"
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      adicionarItem(a);
                                    }}
                                  >
                                    <Input
                                      value={novoItem[a.id] ?? ""}
                                      onChange={(e) =>
                                        setNovoItem((s) => ({ ...s, [a.id]: e.target.value }))
                                      }
                                      placeholder="Item do checklist…"
                                      className="h-8 text-xs"
                                      aria-label="Novo item do checklist"
                                    />
                                    <Button
                                      type="submit"
                                      variant="outline"
                                      size="sm"
                                      disabled={addItem.isPending}
                                    >
                                      Adicionar
                                    </Button>
                                  </form>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {/* Adicionar ajuste */}
                      {podeAjustes && (
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            adicionarAjuste(p.id);
                          }}
                        >
                          <Input
                            value={novoAjuste[p.id] ?? ""}
                            onChange={(e) =>
                              setNovoAjuste((s) => ({ ...s, [p.id]: e.target.value }))
                            }
                            placeholder="Novo ajuste (ex.: bainha 3cm)…"
                            aria-label="Novo ajuste"
                          />
                          <Button
                            type="submit"
                            variant="outline"
                            disabled={createAjuste.isPending}
                          >
                            Adicionar
                          </Button>
                        </form>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Confirmação de remoção de ajuste */}
      <AlertDialog
        open={ajusteParaRemover !== null}
        onOpenChange={(open) => !open && setAjusteParaRemover(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover ajuste</AlertDialogTitle>
            <AlertDialogDescription>
              Remover o ajuste "{ajusteParaRemover?.descricao}"? O checklist dele também será
              removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={removerAjusteConfirmado}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
