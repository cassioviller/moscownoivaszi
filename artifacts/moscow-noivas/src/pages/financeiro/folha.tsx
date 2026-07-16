/**
 * Folha do mês — gerar os salários da competência e fechar o período com a
 * contabilidade.
 *
 * Gerar é IDEMPOTENTE no backend: o botão pode ser clicado de novo sem medo, e
 * "0 salários gerados" é a resposta normal de uma folha já feita, não um erro.
 *
 * O envio à contabilidade é DUAS ações separadas de propósito: baixar o CSV
 * (só lê) e marcar como enviado (escreve). Na origem era um clique só, num GET
 * que escrevia — conferir o arquivo antes de mandar era impossível, e um
 * refresh do navegador remarcava o período. Aqui dá para baixar, conferir, e
 * só então declarar enviado.
 */
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useListContasPagar,
  getListContasPagarQueryKey,
  useListPagamentos,
  getListPagamentosQueryKey,
  useListSalariosRecorrentes,
  getListSalariosRecorrentesQueryKey,
  useListEquipe,
  getListEquipeQueryKey,
  useGerarFolha,
  useEnviarContabilidade,
  useCreateSalarioRecorrente,
  useUpdateSalarioRecorrente,
  type SalarioRecorrente,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { podeNoModulo } from "@/lib/permissoes";
import { brl } from "@/lib/formatos";
import { rotuloForma } from "@/lib/financeiro/forma";
import {
  competenciaAtual,
  resolverIntervalo,
  diaLocal,
  instanteNoIntervalo,
} from "@/lib/financeiro/datas";
import { parseValor, reais, somaCentavos } from "@/lib/financeiro/dinheiro";
import { ErroListagem, ResumoCard, dataFmt, mensagemApi, useCaminhoDaLoja } from "./helpers";

const MENSAGENS_ERRO: Record<string, string> = {
  COMPETENCIA_INVALIDA: "Competência inválida (use AAAA-MM).",
  INTERVALO_INVALIDO: "Intervalo inválido.",
};

export default function Folha() {
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const caminho = useCaminhoDaLoja();
  const [searchParams, setSearchParams] = useSearchParams();

  const [competencia, setCompetencia] = useState(competenciaAtual());
  const intervalo = resolverIntervalo(searchParams.get("ini"), searchParams.get("fim"));
  const params = useMemo(
    () => ({ de: intervalo.iniYMD, ate: intervalo.fimYMD }),
    [intervalo.iniYMD, intervalo.fimYMD],
  );

  const contas = useListContasPagar(activeLojaId!, {
    query: { queryKey: getListContasPagarQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const pagamentos = useListPagamentos(activeLojaId!, params, {
    query: { queryKey: getListPagamentosQueryKey(activeLojaId!, params), enabled: !!activeLojaId },
  });
  const salarios = useListSalariosRecorrentes(activeLojaId!, {
    query: { queryKey: getListSalariosRecorrentesQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const equipe = useListEquipe(activeLojaId!, {
    query: { queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  const gerarFolha = useGerarFolha();
  const enviarContabilidade = useEnviarContabilidade();
  const criarSalario = useCreateSalarioRecorrente();
  const atualizarSalario = useUpdateSalarioRecorrente();

  // Definir salário é escrita no financeiro; o servidor recusa de qualquer
  // jeito, isto só evita oferecer o que vai ser negado.
  const podeEditar = podeNoModulo(acessosModulos, "financeiro", "editar");

  const [novoUsuarioId, setNovoUsuarioId] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [novoDia, setNovoDia] = useState("5");
  const [editando, setEditando] = useState<SalarioRecorrente | null>(null);
  const [editValor, setEditValor] = useState("");
  const [editDia, setEditDia] = useState("");

  const invalidarSalarios = () =>
    queryClient.invalidateQueries({ queryKey: getListSalariosRecorrentesQueryKey(activeLojaId!) });

  /**
   * Lê valor e dia do teclado. Vazio e lixo são coisas diferentes: `parseValor`
   * devolve null para "não digitou" e NaN para "digitou errado" — e o dia tem
   * que caber no mês, senão `vencimentoDaFolha` grampeia calado.
   */
  function lerSalario(valorTexto: string, diaTexto: string): { valor: number; dia: number } | null {
    const valor = parseValor(valorTexto);
    if (valor === null || Number.isNaN(valor) || valor <= 0) {
      toast({ title: "Valor do salário inválido", variant: "destructive" });
      return null;
    }
    const dia = Number(diaTexto);
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
      toast({ title: "O dia de vencimento vai de 1 a 31", variant: "destructive" });
      return null;
    }
    return { valor, dia };
  }

  async function onCriarSalario() {
    if (!novoUsuarioId) {
      toast({ title: "Escolha a colaboradora", variant: "destructive" });
      return;
    }
    const lido = lerSalario(novoValor, novoDia);
    if (!lido) return;
    try {
      await criarSalario.mutateAsync({
        lojaId: activeLojaId!,
        data: { usuarioId: novoUsuarioId, valor: lido.valor, diaVencimento: lido.dia },
      });
      await invalidarSalarios();
      setNovoUsuarioId("");
      setNovoValor("");
      setNovoDia("5");
      toast({ title: "Salário definido" });
    } catch (err) {
      toast({
        title: "Erro ao definir o salário",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  function abrirEdicao(s: SalarioRecorrente) {
    setEditValor(s.valor.toFixed(2).replace(".", ","));
    setEditDia(String(s.diaVencimento));
    setEditando(s);
  }

  async function onSalvarEdicao() {
    if (!editando) return;
    const lido = lerSalario(editValor, editDia);
    if (!lido) return;
    try {
      await atualizarSalario.mutateAsync({
        lojaId: activeLojaId!,
        salarioId: editando.id,
        data: { valor: lido.valor, diaVencimento: lido.dia },
      });
      await invalidarSalarios();
      setEditando(null);
      toast({ title: "Salário atualizado" });
    } catch (err) {
      toast({
        title: "Erro ao atualizar",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  async function alternarAtivo(s: SalarioRecorrente) {
    try {
      await atualizarSalario.mutateAsync({
        lojaId: activeLojaId!,
        salarioId: s.id,
        data: { ativo: !s.ativo },
      });
      await invalidarSalarios();
      toast({ title: s.ativo ? "Salário desativado" : "Salário reativado" });
    } catch (err) {
      toast({
        title: "Erro ao alterar",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  const atualizarParams = (patch: Record<string, string>) => {
    const proximo = new URLSearchParams(searchParams);
    for (const [chave, valor] of Object.entries(patch)) {
      if (valor) proximo.set(chave, valor);
      else proximo.delete(chave);
    }
    setSearchParams(proximo, { replace: true });
  };

  const nomePorUsuario = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const membro of equipe.data ?? []) mapa.set(membro.usuarioId, membro.nome);
    return mapa;
  }, [equipe.data]);

  // Quem já tem salário sai da lista de "definir": o caminho para mudar o dela
  // é Editar, não lançar um segundo — dois salários para a mesma pessoa gerariam
  // duas contas na mesma folha.
  const semSalario = useMemo(() => {
    const comSalario = new Set((salarios.data ?? []).map((s) => s.usuarioId));
    return (equipe.data ?? []).filter((m) => !comSalario.has(m.usuarioId));
  }, [equipe.data, salarios.data]);

  const contasDaFolha = useMemo(
    () =>
      (contas.data ?? [])
        .filter((c) => c.tipo === "SALARIO" && c.competencia === competencia)
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    [contas.data, competencia],
  );

  const resumo = useMemo(() => {
    const previstas = contasDaFolha.filter((c) => c.status === "PREVISTA");
    const pagas = contasDaFolha.filter((c) => c.status === "PAGA");
    return {
      total: reais(somaCentavos(contasDaFolha, (c) => c.valorPrevisto)),
      aPagar: reais(somaCentavos(previstas, (c) => c.valorPrevisto)),
      pago: reais(somaCentavos(pagas, (c) => c.valorPrevisto)),
    };
  }, [contasDaFolha]);

  // `pagamento.data` é um INSTANTE: o dia dele só existe no fuso da loja.
  const doPeriodo = useMemo(
    () => (pagamentos.data ?? []).filter((p) => instanteNoIntervalo(p.data, intervalo)),
    [pagamentos.data, intervalo.iniYMD, intervalo.fimYMD],
  );
  const pendentesEnvio = useMemo(
    () => doPeriodo.filter((p) => !p.enviadoContabilidadeEm),
    [doPeriodo],
  );

  const onGerarFolha = async () => {
    try {
      const res = await gerarFolha.mutateAsync({ lojaId: activeLojaId!, data: { competencia } });
      await queryClient.invalidateQueries({
        queryKey: getListContasPagarQueryKey(activeLojaId!),
      });
      // Zero não é falha: é a folha do mês já estar feita.
      toast({
        title: res.geradas === 0 ? "Folha já estava gerada" : "Folha gerada",
        description:
          res.geradas === 0
            ? "Nenhum salário novo para lançar nesta competência."
            : `${res.geradas} ${res.geradas === 1 ? "salário lançado" : "salários lançados"} em contas a pagar.`,
      });
    } catch (err) {
      toast({
        title: "Erro ao gerar a folha",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  };

  const onEnviarContabilidade = async () => {
    try {
      const res = await enviarContabilidade.mutateAsync({
        lojaId: activeLojaId!,
        data: { de: intervalo.iniYMD, ate: intervalo.fimYMD },
      });
      await queryClient.invalidateQueries({
        queryKey: getListPagamentosQueryKey(activeLojaId!, params),
      });
      toast({
        title: res.marcados === 0 ? "Nada novo para enviar" : "Marcado como enviado",
        description:
          res.marcados === 0
            ? "Todos os pagamentos do período já constavam como enviados."
            : `${res.marcados} ${res.marcados === 1 ? "pagamento" : "pagamentos"} do período.`,
      });
    } catch (err) {
      toast({
        title: "Erro ao marcar o envio",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={caminho("/financeiro/pagar")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Contas a pagar
          </Link>
          <h1 className="text-3xl font-serif">Folha do mês</h1>
          <p className="text-sm text-muted-foreground">
            O salário-base do atelier vira conta a pagar, e o período fecha com a contabilidade.
          </p>
        </div>
      </div>

      {/* — Gerar a folha da competência — */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="competencia">Competência</Label>
              <Input
                id="competencia"
                type="month"
                className="w-44"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
              />
            </div>
            <Button onClick={onGerarFolha} disabled={gerarFolha.isPending || !competencia}>
              {gerarFolha.isPending ? "Gerando…" : "Gerar folha"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cada salário-base ativo vira uma conta a pagar desta competência. Gerar de novo não
            duplica nada — o que já foi lançado é pulado.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <ResumoCard rotulo="Folha da competência" valor={resumo.total} />
        <ResumoCard rotulo="A pagar" valor={resumo.aPagar} />
        <ResumoCard rotulo="Pago" valor={resumo.pago} />
      </div>

      {contas.isError ? (
        <ErroListagem mensagem="Falha ao buscar as contas da folha." onRetry={() => contas.refetch()} />
      ) : contas.isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      ) : contasDaFolha.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          A folha de {competencia} ainda não foi gerada.
        </p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {contasDaFolha.map((c) => (
                <div key={c.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">
                      {(c.colaboradorId && nomePorUsuario.get(c.colaboradorId)) ?? c.descricao}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.descricao} · vence {dataFmt.format(new Date(c.vencimento))}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={c.status === "PAGA" ? "default" : "secondary"}>
                      {c.status === "PAGA" ? "Paga" : "Prevista"}
                    </Badge>
                    <span className="font-serif tabular-nums">R$ {brl(c.valorPrevisto)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t px-4 py-3 text-right text-xs text-muted-foreground">
              As contas da folha são pagas em{" "}
              <Link to={caminho("/financeiro/pagar")} className="underline">
                contas a pagar
              </Link>{" "}
              — uma saída pode quitar várias de uma vez.
            </div>
          </CardContent>
        </Card>
      )}

      {/* — Salário-base: o combinado que origina as contas SALARIO. Vivia na
          tela de contas a pagar; mudou para cá, ao lado da geração que o
          consome. — */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <p className="font-medium">Salário-base</p>
            <p className="text-xs text-muted-foreground">
              O combinado com cada colaboradora, por mês. Ainda não é conta a pagar: vira uma quando
              a folha da competência é gerada.
            </p>
          </div>
          {salarios.isError ? (
            <ErroListagem
              mensagem="Falha ao buscar os salários."
              onRetry={() => salarios.refetch()}
            />
          ) : (salarios.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum salário-base definido ainda.</p>
          ) : (
            <ul className="divide-y">
              {salarios.data?.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">
                      {nomePorUsuario.get(s.usuarioId) ?? "Colaboradora"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      vence dia {s.diaVencimento}
                      {s.ativo ? "" : " · inativo"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums">R$ {brl(s.valor)}</span>
                    {podeEditar && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => abrirEdicao(s)}>
                          Editar
                        </Button>
                        {/* Desativar, não excluir: o salário já virou conta em
                            competências passadas, e apagá-lo deixaria essas
                            contas sem a origem que explica de onde vieram. */}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={atualizarSalario.isPending}
                          onClick={() => alternarAtivo(s)}
                        >
                          {s.ativo ? "Desativar" : "Reativar"}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {podeEditar && (
            <div className="flex flex-wrap items-end gap-2 border-t pt-3">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Colaboradora</Label>
                <Select value={novoUsuarioId} onValueChange={setNovoUsuarioId}>
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {semSalario.map((m) => (
                      <SelectItem key={m.usuarioId} value={m.usuarioId}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
                <Input
                  className="w-32"
                  inputMode="decimal"
                  value={novoValor}
                  onChange={(e) => setNovoValor(e.target.value)}
                  placeholder="2.500,00"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Vence dia</Label>
                <Input
                  className="w-20"
                  inputMode="numeric"
                  value={novoDia}
                  onChange={(e) => setNovoDia(e.target.value)}
                  placeholder="5"
                />
              </div>
              <Button size="sm" onClick={onCriarSalario} disabled={criarSalario.isPending}>
                {criarSalario.isPending ? "Salvando…" : "Definir salário"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(aberto) => !aberto && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Salário-base
              {editando ? ` — ${nomePorUsuario.get(editando.usuarioId) ?? "Colaboradora"}` : ""}
            </DialogTitle>
            <DialogDescription>
              Vale das próximas folhas em diante. As competências já geradas não mudam — a conta
              lançada é o que foi combinado naquele mês.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="editValor">Valor (R$)</Label>
              <Input
                id="editValor"
                inputMode="decimal"
                value={editValor}
                onChange={(e) => setEditValor(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="editDia">Vence dia</Label>
              <Input
                id="editDia"
                inputMode="numeric"
                value={editDia}
                onChange={(e) => setEditDia(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={onSalvarEdicao} disabled={atualizarSalario.isPending}>
              {atualizarSalario.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* — Contabilidade: baixar (só lê) e marcar (escreve) são dois cliques
          separados de propósito — dá para conferir o arquivo antes de mandar. — */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <p className="font-medium">Enviar à contabilidade</p>
            <p className="text-xs text-muted-foreground">
              Baixe o CSV das saídas do período, confira, e só então marque como enviado.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="ini">De</Label>
              <Input
                id="ini"
                type="date"
                className="w-40"
                value={intervalo.iniYMD}
                onChange={(e) => atualizarParams({ ini: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fim">Até</Label>
              <Input
                id="fim"
                type="date"
                className="w-40"
                value={intervalo.fimYMD}
                onChange={(e) => atualizarParams({ fim: e.target.value })}
              />
            </div>
            {/* Download direto pelo href (mesmo caminho do PDF do contrato): o
                cliente gerado devolve o corpo parseado, e um arquivo precisa é
                do salvamento do navegador. */}
            <Button variant="outline" asChild>
              <a
                href={`/api/lojas/${activeLojaId}/financeiro/folha/exportar?de=${intervalo.iniYMD}&ate=${intervalo.fimYMD}`}
                download
              >
                Baixar CSV
              </a>
            </Button>
            <Button
              onClick={onEnviarContabilidade}
              disabled={enviarContabilidade.isPending || pendentesEnvio.length === 0}
            >
              {enviarContabilidade.isPending
                ? "Marcando…"
                : `Marcar ${pendentesEnvio.length} como enviados`}
            </Button>
          </div>

          {pagamentos.isError ? (
            <ErroListagem
              mensagem="Falha ao buscar as saídas do período."
              onRetry={() => pagamentos.refetch()}
            />
          ) : pagamentos.isLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          ) : doPeriodo.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma saída de caixa neste período.</p>
          ) : (
            <ul className="divide-y">
              {doPeriodo.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">
                      {p.colaborador?.nome ?? `${p.itens?.length ?? 0} conta(s)`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {diaLocal(p.data).split("-").reverse().join("/")}
                      {rotuloForma(p.forma) ? ` · ${rotuloForma(p.forma)}` : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {p.enviadoContabilidadeEm ? (
                      <Badge variant="default">Enviado</Badge>
                    ) : (
                      <Badge variant="secondary">Pendente</Badge>
                    )}
                    <span className="tabular-nums">R$ {brl(p.valorPago)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
