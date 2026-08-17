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
  useListPendenciasComissao,
  getListPendenciasComissaoQueryKey,
  getListContasPagarQueryKey,
  useListPagamentos,
  getListPagamentosQueryKey,
  useListRecorrencias,
  getListRecorrenciasQueryKey,
  useListEquipe,
  getListEquipeQueryKey,
  useGerarRecorrencias,
  useEnviarContabilidade,
  useCreateRecorrencia,
  useUpdateRecorrencia,
  type Recorrencia,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { useEscritaNaUrl } from "@/hooks/use-escrita-na-url";
import { comFiltros } from "@/lib/filtro-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvisoPontasTrocadas } from "@/components/aviso-pontas-trocadas";
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
import { brl, diaMesAno } from "@/lib/formatos";
import { rotuloForma } from "@/lib/financeiro/forma";
import {
  competenciaAtual,
  rotuloCompetencia,
  resolverIntervalo,
  intervaloDaCompetencia,
  diaLocal,
  instanteNoIntervalo,
} from "@/lib/financeiro/datas";
import { parseValor, reais, somaCentavos } from "@/lib/financeiro/dinheiro";
import { ErroListagem, ResumoCard, invalidarCaixa } from "./helpers";
import { estadoDasConsultas } from "@/lib/estado-consulta";
import { estadoDoPasso, type PassoEstado } from "@/lib/financeiro/fechar-mes";
import { useCaminhoDaLoja } from "@/hooks/use-caminho-da-loja";
import { mensagemApi } from "@/lib/erro-api";
import { CACHE_ESTAVEL } from "@/lib/cache";

const MENSAGENS_ERRO: Record<string, string> = {
  COMPETENCIA_INVALIDA: "Competência inválida (use AAAA-MM).",
  INTERVALO_INVALIDO: "Intervalo inválido.",
  RECORRENCIA_INVALIDA: "Faltou um campo que este tipo de recorrência exige.",
  SALARIO_ATIVO_EXISTE: "Esta colaboradora já tem salário ativo — edite o existente.",
};

/** Como a recorrência se chama: salário é quem recebe, despesa é o que é. */
function rotuloRecorrencia(r: Recorrencia, nomes: Map<string, string>): string {
  if (r.tipo !== "SALARIO") return r.descricao ?? "Despesa recorrente";
  return (r.usuarioId && nomes.get(r.usuarioId)) ?? "Colaboradora";
}

export default function Folha() {
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const caminho = useCaminhoDaLoja();
  const [searchParams, setSearchParams] = useEscritaNaUrl();

  const [competencia, setCompetencia] = useState(competenciaAtual());
  const intervalo = resolverIntervalo(searchParams.get("ini"), searchParams.get("fim"));
  const params = useMemo(
    () => ({ de: intervalo.iniYMD, ate: intervalo.fimYMD }),
    [intervalo.iniYMD, intervalo.fimYMD],
  );

  // E93/D2: a tela só olha as contas GERADAS por esta competência, e o
  // vencimento de uma conta gerada cai sempre dentro dela
  // (`vencimentoDaCompetencia`, api-server/src/lib/recorrencias.ts) — então a
  // janela do mês é um recorte EXATO, não uma aproximação. Antes vinha a
  // carteira inteira da loja para desenhar um mês.
  const janelaCompetencia = useMemo(() => {
    const { iniYMD, fimYMD } = intervaloDaCompetencia(competencia);
    return { de: iniYMD, ate: fimYMD };
  }, [competencia]);
  const contas = useListContasPagar(activeLojaId!, janelaCompetencia, {
    query: {
      queryKey: getListContasPagarQueryKey(activeLojaId!, janelaCompetencia),
      enabled: !!activeLojaId,
    },
  });
  const pagamentos = useListPagamentos(activeLojaId!, params, {
    query: { queryKey: getListPagamentosQueryKey(activeLojaId!, params), enabled: !!activeLojaId },
  });
  const recorrencias = useListRecorrencias(activeLojaId!, {
    query: { queryKey: getListRecorrenciasQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const equipe = useListEquipe(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  /**
   * E139/B10 — o roteiro de fechar o mês deriva dos MESMOS motores que as
   * telas de destino consomem (cuidado b: nenhum agregado novo): as
   * pendências de comissão são a régua do sino (vendedoras com venda sem
   * fechamento), as contas em aberto vêm da janela da competência que esta
   * tela já pede, e o envio é o pendentesEnvio logo abaixo.
   */
  const pendenciasComissao = useListPendenciasComissao(activeLojaId!, {
    query: {
      queryKey: getListPendenciasComissaoQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
      retry: false,
    },
  });

  const gerarRecorrencias = useGerarRecorrencias();
  const enviarContabilidade = useEnviarContabilidade();
  const criarRecorrencia = useCreateRecorrencia();
  const atualizarRecorrencia = useUpdateRecorrencia();

  // S-M21 (fecha sítio da S-M9): "Definir salário" e "Adicionar despesa" são
  // POST /recorrencias — o servidor deriva CRIAR, e a página inteira
  // perguntava editar: a gerente com {ver, editar} cadastrava o salário de
  // R$ 2.400,00 e levava 403 (a competência seguinte nascia sem a conta da
  // folha); quem tinha {ver, criar} não via os formulários. O comentário
  // antigo ("o servidor recusa de qualquer jeito") assumia um alinhamento
  // que não existia. Editar/Desativar seguem editar — esses casam.
  const podeEditar = podeNoModulo(acessosModulos, "financeiro", "editar");
  const podeCriar = podeNoModulo(acessosModulos, "financeiro", "criar");

  const [novoUsuarioId, setNovoUsuarioId] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [novoDia, setNovoDia] = useState("5");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [novoFornecedor, setNovoFornecedor] = useState("");
  const [novoValorDespesa, setNovoValorDespesa] = useState("");
  const [novoDiaDespesa, setNovoDiaDespesa] = useState("10");
  const [editando, setEditando] = useState<Recorrencia | null>(null);
  const [editValor, setEditValor] = useState("");
  const [editDia, setEditDia] = useState("");

  const invalidarRecorrencias = () =>
    queryClient.invalidateQueries({ queryKey: getListRecorrenciasQueryKey(activeLojaId!) });

  /**
   * Lê valor e dia do teclado. Vazio e lixo são coisas diferentes: `parseValor`
   * devolve null para "não digitou" e NaN para "digitou errado" — e o dia tem
   * que caber no mês, senão `vencimentoDaCompetencia` grampeia calado.
   */
  function lerValorEDia(valorTexto: string, diaTexto: string): { valor: number; dia: number } | null {
    const valor = parseValor(valorTexto);
    if (valor === null || Number.isNaN(valor) || valor <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
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
    const lido = lerValorEDia(novoValor, novoDia);
    if (!lido) return;
    try {
      await criarRecorrencia.mutateAsync({
        lojaId: activeLojaId!,
        data: { tipo: "SALARIO", usuarioId: novoUsuarioId, valor: lido.valor, diaVencimento: lido.dia },
      });
      await invalidarRecorrencias();
      setNovoUsuarioId("");
      setNovoValor("");
      setNovoDia("5");
      toast({ title: "Salário definido" });
    } catch (err) {
      toast({
        title: "Não deu para definir o salário",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  async function onCriarDespesa() {
    if (!novaDescricao.trim()) {
      toast({ title: "Descreva a despesa", variant: "destructive" });
      return;
    }
    const lido = lerValorEDia(novoValorDespesa, novoDiaDespesa);
    if (!lido) return;
    try {
      await criarRecorrencia.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          tipo: novoFornecedor.trim() ? "FORNECEDOR" : "DESPESA",
          descricao: novaDescricao.trim(),
          fornecedor: novoFornecedor.trim() || undefined,
          valor: lido.valor,
          diaVencimento: lido.dia,
        },
      });
      await invalidarRecorrencias();
      setNovaDescricao("");
      setNovoFornecedor("");
      setNovoValorDespesa("");
      setNovoDiaDespesa("10");
      toast({ title: "Despesa recorrente criada" });
    } catch (err) {
      toast({
        title: "Não deu para criar a despesa",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  function abrirEdicao(r: Recorrencia) {
    setEditValor(r.valor.toFixed(2).replace(".", ","));
    setEditDia(String(r.diaVencimento));
    setEditando(r);
  }

  async function onSalvarEdicao() {
    if (!editando) return;
    const lido = lerValorEDia(editValor, editDia);
    if (!lido) return;
    try {
      await atualizarRecorrencia.mutateAsync({
        lojaId: activeLojaId!,
        recorrenciaId: editando.id,
        data: { valor: lido.valor, diaVencimento: lido.dia },
      });
      await invalidarRecorrencias();
      setEditando(null);
      toast({ title: "Recorrência atualizada" });
    } catch (err) {
      toast({
        title: "Não deu para atualizar",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  async function alternarAtivo(r: Recorrencia) {
    try {
      await atualizarRecorrencia.mutateAsync({
        lojaId: activeLojaId!,
        recorrenciaId: r.id,
        data: { ativo: !r.ativo },
      });
      await invalidarRecorrencias();
      toast({ title: r.ativo ? "Recorrência desativada" : "Recorrência reativada" });
    } catch (err) {
      toast({
        title: "Não deu para alterar",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  /**
   * F34/E103 — a competência manda nas duas datas, e antes não mandava.
   *
   * A tela tinha DOIS estados de tempo independentes: `competencia` (o seletor
   * de mês, que alimenta "Gerar competência") e `intervalo` (De/Até na URL, que
   * alimenta o card da contabilidade). Eles não conversavam, e o resultado era
   * medido: abrir a tela em julho, trocar a competência para junho para
   * conferir, e clicar em "Marcar como enviados" carimbava **os pagamentos de
   * julho** — com toda a tela acima falando de junho. E o carimbo é de MÃO
   * ÚNICA: não existe rota que o limpe.
   *
   * Trocar de mês agora leva as duas datas junto. O De/Até continua editável
   * para quem precisa de uma janela fora do mês — o que some é a divergência
   * silenciosa entre o que a tela diz e o que o botão faz.
   */
  const trocarCompetencia = (nova: string) => {
    setCompetencia(nova);
    if (!nova) return;
    const { iniYMD, fimYMD } = intervaloDaCompetencia(nova);
    atualizarParams({ ini: iniYMD, fim: fimYMD });
  };

  /**
   * S-RM17/E261 — as duas pontas da janela são editáveis, e o carimbo da
   * contabilidade é de mão única: montar o próximo params a partir do
   * `searchParams` desta renderização perdia a primeira de duas edições no mesmo
   * frame, e o `resolverIntervalo` trocava as pontas. Medido: `?ini=2024-04-04`
   * seguido de `?fim=2024-04-04` virava `2024-04-04..2026-08-01` — 302
   * recebimentos declarados de uma vez. O `useEscritaNaUrl` entrega ao updater a
   * URL do momento da APLICAÇÃO.
   */
  const atualizarParams = (patch: Record<string, string>) => {
    setSearchParams((atual) => comFiltros(atual, patch), { replace: true });
  };

  const nomePorUsuario = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const membro of equipe.data ?? []) mapa.set(membro.usuarioId, membro.nome);
    return mapa;
  }, [equipe.data]);

  const salarios = useMemo(
    () => (recorrencias.data ?? []).filter((r) => r.tipo === "SALARIO"),
    [recorrencias.data],
  );
  const despesasRecorrentes = useMemo(
    () => (recorrencias.data ?? []).filter((r) => r.tipo !== "SALARIO"),
    [recorrencias.data],
  );

  // Quem já tem salário sai da lista de "definir": o caminho para mudar o dela
  // é Editar, não lançar um segundo — dois salários para a mesma pessoa gerariam
  // duas contas na mesma competência.
  const semSalario = useMemo(() => {
    const comSalario = new Set(salarios.map((s) => s.usuarioId));
    return (equipe.data ?? []).filter((m) => !comSalario.has(m.usuarioId));
  }, [equipe.data, salarios]);

  // Só o que a GERAÇÃO produziu (`recorrenciaId`), não tudo que tem a
  // competência: uma despesa avulsa lançada à mão em julho é conta de julho,
  // mas não é o que este mês gerou — misturá-las faria o total desta tela
  // mudar por um lançamento que ela não fez.
  const contasGeradas = useMemo(
    () =>
      (contas.data ?? [])
        .filter((c) => !!c.recorrenciaId && c.competencia === competencia)
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    [contas.data, competencia],
  );

  const resumo = useMemo(() => {
    const previstas = contasGeradas.filter((c) => c.status === "PREVISTA");
    const pagas = contasGeradas.filter((c) => c.status === "PAGA");
    return {
      total: reais(somaCentavos(contasGeradas, (c) => c.valorPrevisto)),
      aPagar: reais(somaCentavos(previstas, (c) => c.valorPrevisto)),
      pago: reais(somaCentavos(pagas, (c) => c.valorPrevisto)),
    };
  }, [contasGeradas]);

  // `pagamento.data` é um INSTANTE: o dia dele só existe no fuso da loja.
  const doPeriodo = useMemo(
    () => (pagamentos.data ?? []).filter((p) => instanteNoIntervalo(p.data, intervalo)),
    [pagamentos.data, intervalo.iniYMD, intervalo.fimYMD],
  );
  const pendentesEnvio = useMemo(
    () => doPeriodo.filter((p) => !p.enviadoContabilidadeEm),
    [doPeriodo],
  );

  /**
   * **S-RM39 (E269) — as duas pendências do roteiro saem do JSX.**
   *
   * As duas eram interpoladas dentro do `<PassoDoRoteiro>`, numa linha só de
   * **241 e 206 caracteres** — três ternários de plural e uma contagem
   * embutidos numa string que ninguém lê no diff, e que **qualquer conserto
   * mexe às cegas**: o vermelho da régua de aspas do E262 precisou de uma
   * janela para caber na tela. A sobra contava uma linha; são duas.
   *
   * E a de cima filtrava a mesma lista **DUAS vezes** para dizer o número e
   * decidir o plural — a segunda passada existia só porque a primeira estava
   * presa dentro da interpolação.
   *
   * A citação do rótulo (E262) fica: `Fechar com a contabilidade` é o nome do
   * botão lá embaixo, são quatro palavras, e sem delimitador a frase termina
   * numa oração que o leitor não sabe onde acaba. A aspa é CURVA, que é o
   * critério da subfamília B.
   */
  const previstas = (contas.data ?? []).filter((c) => c.status === "PREVISTA").length;
  const frasePrevistas = `${previstas} conta${previstas === 1 ? "" : "s"} em aberto no mês.`;

  const aEnviar = pendentesEnvio.length;
  const plural = aEnviar === 1 ? "" : "s";
  const frasePendentesEnvio =
    `${aEnviar} movimento${plural} do período ainda não enviado${plural}` +
    ` — o envio é aqui embaixo, em “Fechar com a contabilidade”.`;

  const onGerar = async () => {
    try {
      const res = await gerarRecorrencias.mutateAsync({ lojaId: activeLojaId!, data: { competencia } });
      // D9: lançar a folha põe contas PREVISTAS na curva — o alerta de caixa
      // (dashboard e sino) muda junto, não só esta lista.
      await invalidarCaixa(queryClient, activeLojaId!);
      // Zero não é falha: é a competência já estar gerada.
      toast({
        title: res.geradas === 0 ? "Competência já estava gerada" : "Contas lançadas",
        description:
          res.geradas === 0
            ? "Nada novo para lançar nesta competência."
            : `${res.geradas} ${res.geradas === 1 ? "conta lançada" : "contas lançadas"} em contas a pagar.`,
      });
    } catch (err) {
      toast({
        title: "Não deu para gerar a competência",
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
      // F34: o mês fecha nos DOIS lados, e o recado diz os dois. Falar só em
      // "pagamentos" agora seria esconder metade do que o clique fez.
      toast({
        title: res.marcados === 0 ? "Nada novo para enviar" : "Mês declarado à contabilidade",
        description:
          res.marcados === 0
            ? "Tudo do período já constava como enviado."
            // S-RM9: o campo era `parcelas` e a frase já dizia "recebimento" —
            // desde o E252 ele conta ATOS, e a parcela paga em dois PIX conta
            // dois. O texto da tela não muda; o nome do campo alcançou-o.
            : `${res.pagamentos} saída${res.pagamentos === 1 ? "" : "s"} e ${res.recebimentos} recebimento${res.recebimentos === 1 ? "" : "s"} do período.`,
      });
    } catch (err) {
      toast({
        title: "Não deu para marcar o envio",
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
          {/* F31/E103: o link dizia "Folha do mês" e este H1 dizia
              "Recorrências do mês" — quem procurava "folha" não achava, e quem
              achava lia outro nome. A loja chama de folha. */}
          <h1 className="text-3xl font-serif">Folha do mês</h1>
          <p className="text-sm text-muted-foreground">
            O que se repete todo mês — salário, aluguel, assinatura, fornecedor fixo — vira conta a
            pagar, e o período fecha com a contabilidade.
          </p>
        </div>
      </div>

      {/* — Gerar as contas da competência — */}
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
                onChange={(e) => trocarCompetencia(e.target.value)}
              />
            </div>
            <Button onClick={onGerar} disabled={gerarRecorrencias.isPending || !competencia}>
              {gerarRecorrencias.isPending ? "Gerando…" : "Gerar competência"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cada recorrência ativa vira uma conta a pagar desta competência. Gerar de novo não
            duplica nada — o que já foi lançado é pulado.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <ResumoCard rotulo="Gerado na competência" valor={resumo.total} />
        <ResumoCard rotulo="A pagar" valor={resumo.aPagar} />
        <ResumoCard rotulo="Pago" valor={resumo.pago} />
      </div>

      {/* E139/B10 — fechar o mês era 5 visitas a 4 telas com a ordem escrita
          em lugar nenhum. O roteiro numera os três passos com o ESTADO real
          (a decisão de exibição é estadoDoPasso — carregando nunca vira
          pendente) e o link da tela de cada um. */}
      <Card data-testid="roteiro-fechar-mes">
        <CardHeader>
          <CardTitle>Fechar {rotuloCompetencia(competencia)}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            <PassoDoRoteiro
              numero={1}
              titulo="Comissões da competência fechadas"
              estado={estadoDoPasso(
                estadoDasConsultas(pendenciasComissao),
                !(pendenciasComissao.data ?? []).some((pend) => pend.competencia === competencia),
              )}
              pendencia="Há vendedoras com venda no mês sem fechamento."
              href={`/loja/${activeLojaId}/comissoes?competencia=${competencia}`}
              rotuloLink="Fechar em Comissões →"
            />
            <PassoDoRoteiro
              numero={2}
              titulo="Contas da competência pagas"
              estado={estadoDoPasso(
                estadoDasConsultas(contas),
                !(contas.data ?? []).some((c) => c.status === "PREVISTA"),
              )}
              pendencia={frasePrevistas}
              href={`/loja/${activeLojaId}/financeiro/pagar?ini=${janelaCompetencia.de}&fim=${janelaCompetencia.ate}`}
              rotuloLink="Pagar →"
            />
            <PassoDoRoteiro
              numero={3}
              titulo="Período enviado à contabilidade"
              estado={estadoDoPasso(
                estadoDasConsultas(pagamentos),
                pendentesEnvio.length === 0,
              )}
              pendencia={frasePendentesEnvio}
            />
          </ol>
        </CardContent>
      </Card>

      {contas.isError ? (
        <ErroListagem mensagem="Falha ao buscar as contas da competência." onRetry={() => contas.refetch()} />
      ) : contas.isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      ) : contasGeradas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          A competência {rotuloCompetencia(competencia)} ainda não foi gerada.
        </p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {contasGeradas.map((c) => {
                // Salário se identifica por QUEM recebe; despesa, pelo que é.
                // Sem o nome, o título já é a descrição — repeti-la embaixo
                // gastaria a linha dizendo duas vezes a mesma coisa.
                const nome = c.colaboradorId ? nomePorUsuario.get(c.colaboradorId) : null;
                return (
                <div key={c.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{nome ?? c.descricao}</span>
                    <span className="text-xs text-muted-foreground">
                      {nome ? `${c.descricao} · ` : ""}vence{" "}
                      {diaMesAno(c.vencimento)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={c.status === "PAGA" ? "default" : "secondary"}>
                      {c.status === "PAGA" ? "Paga" : "Prevista"}
                    </Badge>
                    <span className="font-serif tabular-nums">{brl(c.valorPrevisto)}</span>
                  </div>
                </div>
                );
              })}
            </div>
            <div className="border-t px-4 py-3 text-right text-xs text-muted-foreground">
              As contas geradas são pagas em{" "}
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
          {recorrencias.isError ? (
            <ErroListagem
              mensagem="Falha ao buscar as recorrências."
              onRetry={() => recorrencias.refetch()}
            />
          ) : salarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum salário-base definido ainda.</p>
          ) : (
            <ul className="divide-y">
              {salarios.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">
                      {(s.usuarioId && nomePorUsuario.get(s.usuarioId)) ?? "Colaboradora"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      vence dia {s.diaVencimento}
                      {s.ativo ? "" : " · inativo"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums">{brl(s.valor)}</span>
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
                          disabled={atualizarRecorrencia.isPending}
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

          {podeCriar && (
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
              <Button size="sm" onClick={onCriarSalario} disabled={criarRecorrencia.isPending}>
                {criarRecorrencia.isPending ? "Salvando…" : "Definir salário"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* — Despesas recorrentes (E48): aluguel, assinatura, fornecedor fixo.
          Mesmo motor do salário — a única diferença é não ter colaborador. — */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <p className="font-medium">Despesas recorrentes</p>
            <p className="text-xs text-muted-foreground">
              Aluguel, assinatura, fornecedor fixo — o que se repete todo mês e era relançado à mão.
              Vira conta a pagar pelo mesmo caminho do salário, na mesma geração.
            </p>
          </div>
          {despesasRecorrentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma despesa recorrente cadastrada ainda.
            </p>
          ) : (
            <ul className="divide-y" data-testid="lista-despesas-recorrentes">
              {despesasRecorrentes.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{r.descricao}</span>
                    <span className="text-xs text-muted-foreground">
                      vence dia {r.diaVencimento}
                      {r.fornecedor ? ` · ${r.fornecedor}` : ""}
                      {r.ativo ? "" : " · inativa"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums">{brl(r.valor)}</span>
                    {podeEditar && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => abrirEdicao(r)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={atualizarRecorrencia.isPending}
                          onClick={() => alternarAtivo(r)}
                        >
                          {r.ativo ? "Desativar" : "Reativar"}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {podeCriar && (
            <div className="flex flex-wrap items-end gap-2 border-t pt-3">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground" htmlFor="despesa-descricao">
                  Descrição
                </Label>
                <Input
                  id="despesa-descricao"
                  className="w-52"
                  value={novaDescricao}
                  onChange={(e) => setNovaDescricao(e.target.value)}
                  placeholder="Aluguel da loja"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground" htmlFor="despesa-fornecedor">
                  Fornecedor (opcional)
                </Label>
                <Input
                  id="despesa-fornecedor"
                  className="w-44"
                  value={novoFornecedor}
                  onChange={(e) => setNovoFornecedor(e.target.value)}
                  placeholder="Imobiliária X"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground" htmlFor="despesa-valor">
                  Valor (R$)
                </Label>
                <Input
                  id="despesa-valor"
                  className="w-32"
                  inputMode="decimal"
                  value={novoValorDespesa}
                  onChange={(e) => setNovoValorDespesa(e.target.value)}
                  placeholder="4.500,00"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground" htmlFor="despesa-dia">
                  Vence dia
                </Label>
                <Input
                  id="despesa-dia"
                  className="w-20"
                  inputMode="numeric"
                  value={novoDiaDespesa}
                  onChange={(e) => setNovoDiaDespesa(e.target.value)}
                  placeholder="10"
                />
              </div>
              <Button size="sm" onClick={onCriarDespesa} disabled={criarRecorrencia.isPending}>
                {criarRecorrencia.isPending ? "Salvando…" : "Adicionar despesa"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(aberto) => !aberto && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editando?.tipo === "SALARIO" ? "Salário-base" : "Despesa recorrente"}
              {editando ? ` — ${rotuloRecorrencia(editando, nomePorUsuario)}` : ""}
            </DialogTitle>
            <DialogDescription>
              Vale das próximas gerações em diante. As competências já geradas não mudam — a conta
              lançada é o que foi combinado naquele mês.
            </DialogDescription>
          </DialogHeader>
          {/* E136/E6: Enter salva — o diálogo de dinheiro não tinha <form>. */}
          <form onSubmit={(e) => { e.preventDefault(); void onSalvarEdicao(); }}>
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
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={atualizarRecorrencia.isPending}>
              {atualizarRecorrencia.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
          </form>
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
              /* F34: NÃO desabilita por `pendentesEnvio`, que conta só as
                 saídas. Desde que o mês fecha nos dois lados, um período sem
                 pagamento pendente pode ter recebimentos por declarar — e o
                 botão desabilitado esconderia justamente o lado que acabou de
                 nascer. Quem responde "não havia nada" é a rota, com zero. */
              disabled={enviarContabilidade.isPending}
            >
              {enviarContabilidade.isPending ? "Marcando…" : "Declarar o mês"}
            </Button>
          </div>

          {/* S-RM28 — o aviso fica ENTRE os campos e o "Declarar o mês", que é
              o carimbo de mão única desta tela. */}
          <AvisoPontasTrocadas ini={searchParams.get("ini")} fim={searchParams.get("fim")} />

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
                    <span className="tabular-nums">{brl(p.valorPago)}</span>
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


/** E139: um passo do roteiro — número, estado honesto e a porta da tela. */
function PassoDoRoteiro({
  numero,
  titulo,
  estado,
  pendencia,
  href,
  rotuloLink,
}: {
  numero: number;
  titulo: string;
  estado: PassoEstado;
  pendencia: string;
  href?: string;
  rotuloLink?: string;
}) {
  return (
    <li className="flex items-start gap-3" data-testid={`passo-fechar-${numero}`}>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
          estado === "feito" ? "border-transparent bg-positivo text-white" : "text-muted-foreground"
        }`}
        aria-hidden="true"
      >
        {estado === "feito" ? "✓" : numero}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-xs text-muted-foreground">
          {estado === "conferindo" && "Conferindo…"}
          {estado === "semResposta" && "Sem resposta agora — recarregue para conferir este passo."}
          {estado === "feito" && "Feito."}
          {estado === "pendente" && (
            <>
              {pendencia}
              {href && rotuloLink && (
                <>
                  {" "}
                  <Link to={href} className="text-primary-texto underline underline-offset-4">
                    {rotuloLink}
                  </Link>
                </>
              )}
            </>
          )}
        </p>
      </div>
    </li>
  );
}
