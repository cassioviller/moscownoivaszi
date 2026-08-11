import { useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { comFiltros } from "@/lib/filtro-url";
import { useAuth } from "@/hooks/use-auth";
import { podeNoModulo } from "@/lib/permissoes";
import {
  useListParcelas,
  getListParcelasQueryKey,
  useListPagamentos,
  getListPagamentosQueryKey,
  useMarcarConciliado,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  parseExtrato,
  conciliarExtrato,
  diaLocal,
  addDias,
  type TransacaoExtrato,
  type MovimentoSistema,
} from "@workspace/financeiro-core";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, FileUp, CheckCircle2 } from "lucide-react";
import { Carregando, Erro } from "@/components/estado";
import { estadoDasConsultas } from "@/lib/estado-consulta";
import { brl, instanteDiaMes } from "@/lib/formatos";
import { mensagemApi } from "@/lib/erro-api";

/**
 * E70 — a conciliação que era planilha.
 *
 * Sem gateway bancário, conferir o banco contra o sistema era exportar dois
 * arquivos e casar na mão. Aqui a dona SOBE o extrato que o banco dela já
 * exporta (OFX ou CSV) e o pareamento acontece NO NAVEGADOR — parser e
 * casamento são do financeiro-core, puros e testados; o arquivo não sai da
 * máquina. O resultado responde as três perguntas da conciliação: o que
 * bateu, o que está no banco e não no sistema, o que está no sistema e não
 * apareceu no banco.
 */


function diaCurto(ymd: string): string {
  return instanteDiaMes(`${ymd}T12:00:00-03:00`);
}

export default function Conciliacao() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  // S42 — a comparação com o extrato é leitura pura no navegador e fica para
  // qualquer sessão; o que ESCREVE é só o "Marcar como conferidas".
  //
  // S-M21 (fecha sítio da S-M9): o gate era `criar`, e o comentário afirmava
  // esse guard como fato — mas `marcar` está em POST_QUE_MUTA desde o E115
  // (carimba linhas EXISTENTES), então o servidor deriva **editar**. Quem
  // tinha {ver, criar} via o botão e levava 403 depois de casar o extrato
  // inteiro; quem tinha {ver, editar} — a única pessoa que o servidor aceita
  // — não via o botão. O comentário nasceu errado uma semana DEPOIS do E115.
  const podeMarcar = podeNoModulo(acessosModulos, "financeiro", "editar");
  const inputRef = useRef<HTMLInputElement>(null);

  const [transacoes, setTransacoes] = useState<TransacaoExtrato[] | null>(null);
  const [formato, setFormato] = useState<"ofx" | "csv" | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  /**
   * A janela de comparação é a do PRÓPRIO extrato (±2 dias de tolerância):
   * movimentos do sistema fora dela não são pendência — só não estão no
   * arquivo.
   *
   * E93/D2: ela é derivada ANTES das queries, não depois. A tela pedia TODAS
   * as parcelas e TODOS os pagamentos da loja no MOUNT, antes de o arquivo ser
   * escolhido — numa loja com 200 contratos são ~2.400 parcelas mais a
   * carteira inteira de saídas, baixadas para comparar com um extrato de 30
   * dias, e a metade das vezes ninguém chega a subir arquivo nenhum. A tela
   * sempre soube a janela; só a pedia tarde demais.
   */
  const janela = useMemo(() => {
    if (!transacoes || transacoes.length === 0) return undefined;
    const dias = transacoes.map((t) => t.data).sort();
    return { de: addDias(dias[0], -2), ate: addDias(dias[dias.length - 1], 2) };
  }, [transacoes]);

  /**
   * ATENÇÃO ao parâmetro: `de`/`ate` de `listParcelas` recortam por
   * VENCIMENTO, e esta tela compara por `recebidoEm`. Usá-los aqui apagaria da
   * conciliação toda parcela recebida num mês diferente do de vencimento — ou
   * seja, exatamente as pagas em atraso, que são as que dão trabalho de
   * conferir. O recorte certo é `recebidasDe` (E79), que filtra pelo dia do
   * RECEBIMENTO; o teto fica com o filtro do cliente, logo abaixo.
   */
  const paramsRecebidas = janela ? { recebidasDe: janela.de } : undefined;
  const parcelas = useListParcelas(activeLojaId!, paramsRecebidas, {
    query: {
      queryKey: getListParcelasQueryKey(activeLojaId!, paramsRecebidas),
      enabled: !!activeLojaId && !!paramsRecebidas,
    },
  });
  const pagamentos = useListPagamentos(activeLojaId!, janela, {
    query: {
      queryKey: getListPagamentosQueryKey(activeLojaId!, janela),
      enabled: !!activeLojaId && !!janela,
    },
  });

  const aoEscolherArquivo = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErro(null);
    const texto = await arquivo.text();
    const resultado = parseExtrato(texto);
    if (!resultado.ok) {
      setTransacoes(null);
      setFormato(null);
      setNomeArquivo(arquivo.name);
      setErro(resultado.erro);
      return;
    }
    setTransacoes(resultado.transacoes);
    setFormato(resultado.formato);
    setNomeArquivo(arquivo.name);
  };

  /**
   * E121/C2 — o estado das DUAS consultas, lido antes de qualquer veredito.
   *
   * A sequência que enganava: a dona escolhe o arquivo → as queries são
   * habilitadas naquele instante → no MESMO render o veredito rodava com
   * `data ?? []` → um extrato de 45 transações dizia "Bateu 0 · Só no banco
   * 45", com a instrução "lance em receber ou pagar" logo abaixo. Obedecer é
   * contar o mesmo dinheiro duas vezes no caixa. E se uma query falhasse, o
   * veredito errado ficava PARA SEMPRE, sem uma linha de erro.
   */
  const consultas = estadoDasConsultas(parcelas, pagamentos);

  const conciliacao = useMemo(() => {
    if (!transacoes || transacoes.length === 0 || !janela) return null;
    // C2: sem as duas respostas não existe veredito — nem para computar.
    if (!parcelas.data || !pagamentos.data) return null;
    const { de: inicio, ate: fim } = janela;

    const movimentos: MovimentoSistema[] = [];
    for (const p of parcelas.data ?? []) {
      if (!p.recebidoEm || !p.valorRecebido) continue;
      const dia = diaLocal(p.recebidoEm);
      if (dia < inicio || dia > fim) continue;
      movimentos.push({
        id: `parcela:${p.id}`,
        data: dia,
        valor: p.valorRecebido,
        tipo: "recebimento",
        descricao: `${p.numero === 0 ? "Entrada" : `Parcela ${p.numero}`}${p.descricao ? ` · ${p.descricao}` : ""}`,
      });
    }
    for (const pg of pagamentos.data ?? []) {
      const dia = diaLocal(pg.data);
      if (dia < inicio || dia > fim) continue;
      movimentos.push({
        id: `pagamento:${pg.id}`,
        data: dia,
        valor: pg.valorPago,
        tipo: "pagamento",
        descricao: pg.colaborador?.nome ?? pg.observacoes ?? "Pagamento",
      });
    }
    return conciliarExtrato(transacoes, movimentos);
  }, [transacoes, janela, parcelas.data, pagamentos.data]);

  /**
   * F32/E103 — o carimbo por id SINTÉTICO, num mapa ao lado.
   *
   * Ele não entra no `MovimentoSistema` de propósito: aquele tipo é do motor de
   * CASAMENTO (`conciliarExtrato`), que compara valor e data e não tem por que
   * saber o que é conciliação. Misturar as duas coisas faria o núcleo do E70
   * carregar um conceito do E103.
   */
  const carimboPorMovimento = useMemo(() => {
    const mapa = new Map<string, string | null>();
    for (const p of parcelas.data ?? []) mapa.set(`parcela:${p.id}`, p.conciliadoEm ?? null);
    for (const pg of pagamentos.data ?? []) mapa.set(`pagamento:${pg.id}`, pg.conciliadoEm ?? null);
    return mapa;
  }, [parcelas.data, pagamentos.data]);

  const marcar = useMarcarConciliado();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  /** As casadas que AINDA não têm carimbo — é o que o botão vai marcar. */
  const casadasNovas = useMemo(
    () => (conciliacao?.casadas ?? []).filter((c) => !carimboPorMovimento.get(c.movimento.id)),
    [conciliacao, carimboPorMovimento],
  );

  // E129/D5: só o FILTRO vai à URL (`recorte=todas` quando se escolhe ver as
  // já conferidas; default fora) — o extrato carregado é memória de sessão e
  // não viaja num link.
  const [searchParams, setSearchParams] = useSearchParams();
  const soNaoConciliado = searchParams.get("recorte") !== "todas";
  const definirSoNaoConciliado = (v: boolean) =>
    setSearchParams((p) => comFiltros(p, { recorte: v ? null : "todas" }), { replace: true });

  /** Divergências do sistema que alguém já olhou e marcou em outra passada. */
  const jaConferidasNoSistema = useMemo(
    () => (conciliacao?.soSistema ?? []).filter((m) => carimboPorMovimento.get(m.id)).length,
    [conciliacao, carimboPorMovimento],
  );
  const soSistemaVisivel = useMemo(
    () =>
      (conciliacao?.soSistema ?? []).filter(
        (m) => !soNaoConciliado || !carimboPorMovimento.get(m.id),
      ),
    [conciliacao, carimboPorMovimento, soNaoConciliado],
  );

  async function onMarcarConciliadas() {
    const parcelaIds: string[] = [];
    const pagamentoIds: string[] = [];
    for (const { movimento } of casadasNovas) {
      const [tipo, id] = movimento.id.split(":");
      if (tipo === "parcela") parcelaIds.push(id);
      else pagamentoIds.push(id);
    }
    try {
      const r = await marcar.mutateAsync({
        lojaId: activeLojaId!,
        data: { parcelaIds, pagamentoIds },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListParcelasQueryKey(activeLojaId!) }),
        queryClient.invalidateQueries({ queryKey: getListPagamentosQueryKey(activeLojaId!) }),
      ]);
      toast({
        title: `${r.parcelas + r.pagamentos} movimento(s) conferido(s)`,
        description: "Na próxima conciliação eles não voltam como novidade.",
      });
    } catch (err) {
      toast({
        title: "Não deu para marcar",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif">Conciliação</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suba o extrato que o seu banco exporta (OFX ou CSV) e confira o banco contra o
          sistema. O arquivo é lido aqui mesmo — nada sai do seu computador.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <input
            ref={inputRef}
            type="file"
            accept=".ofx,.csv,.txt"
            className="hidden"
            onChange={(e) => aoEscolherArquivo(e.target.files?.[0])}
            data-testid="input-extrato"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => inputRef.current?.click()} className="gap-2">
              <FileUp className="h-4 w-4" />
              Escolher extrato
            </Button>
            {nomeArquivo && (
              <span className="text-sm text-muted-foreground">
                {nomeArquivo}
                {formato && (
                  <Badge variant="secondary" className="ml-2 font-normal uppercase">
                    {formato}
                  </Badge>
                )}
                {transacoes && ` · ${transacoes.length} transações`}
              </span>
            )}
          </div>
          {erro && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Não deu para ler o arquivo</AlertTitle>
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* E121/C2 — enquanto o lado do sistema não respondeu, esqueleto (por
          seção, não a página inteira); se falhou, a frase e a saída. O veredito
          só desenha quando as duas consultas existem — `conciliacao` é null
          antes disso. */}
      {transacoes && transacoes.length > 0 && consultas === "erro" && (
        <Erro
          titulo="Não deu para comparar com o sistema"
          erro={parcelas.error ?? pagamentos.error}
          onTentarNovamente={() => {
            void parcelas.refetch();
            void pagamentos.refetch();
          }}
        />
      )}
      {transacoes && transacoes.length > 0 && consultas === "carregando" && (
        <Carregando forma="cards" linhas={3} />
      )}
      {conciliacao && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Bateu</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold text-positivo">{conciliacao.casadas.length}</div>
                {/* F32/E103 — a memória que faltava. Sem ela a conferência morria
                    com a aba, e as divergências já perdoadas voltavam todo mês
                    indistinguíveis das novas. O botão some quando não há nada
                    novo a marcar: dizer "0 conferidos" seria oferecer trabalho
                    que não existe. */}
                {casadasNovas.length > 0 ? (
                  // Sem o gate não há botão nem o texto do ramo vazio: dizer
                  // "todas já conferidas" com novas na tela seria mentira.
                  podeMarcar && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={marcar.isPending}
                      onClick={onMarcarConciliadas}
                      data-testid="marcar-conciliadas"
                    >
                      {marcar.isPending
                        ? "Marcando…"
                        : `Marcar ${casadasNovas.length} como conferidas`}
                    </Button>
                  )
                ) : (
                  conciliacao.casadas.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Todas já conferidas em conciliações anteriores.
                    </p>
                  )
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Só no banco
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{conciliacao.soExtrato.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Só no sistema
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{conciliacao.soSistema.length}</div>
              </CardContent>
            </Card>
          </div>

          {conciliacao.soExtrato.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">No banco, mas não no sistema</CardTitle>
                <CardDescription>
                  Entrou ou saiu dinheiro que o sistema não registrou — lance em{" "}
                  <Link to={`/loja/${lojaId}/financeiro/receber`} className="text-primary-texto underline underline-offset-4">
                    receber
                  </Link>{" "}
                  ou{" "}
                  <Link to={`/loja/${lojaId}/financeiro/pagar`} className="text-primary-texto underline underline-offset-4">
                    pagar
                  </Link>
                  .
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {conciliacao.soExtrato.map((t, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="tabular-nums text-muted-foreground">{diaCurto(t.data)}</span>{" "}
                        {t.descricao || "(sem descrição)"}
                      </span>
                      <span
                        className={`tabular-nums font-medium whitespace-nowrap ${t.valor > 0 ? "text-positivo" : "text-destructive"}`}
                      >
                        {t.valor > 0 ? "+" : "−"}{brl(Math.abs(t.valor))}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {soSistemaVisivel.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">No sistema, mas não no banco</CardTitle>
                <CardDescription>
                  Registrado aqui e sem par no extrato — pode ser dinheiro em espécie, outra
                  conta, ou um lançamento errado.
                </CardDescription>
                {/* F32/E103 — o filtro que a memória destrava, e o motivo de ela
                    existir. Uma divergência já olhada e perdoada (dinheiro em
                    espécie, conta de outro banco) volta em TODA conciliação,
                    indistinguível das novas. Marcá-la como conferida a tira da
                    lista, e o contador diz quantas foram escondidas — esconder
                    em silêncio seria trocar um problema por outro. */}
                {jaConferidasNoSistema > 0 && (
                  <label className="mt-2 flex items-center gap-2 text-sm font-normal">
                    <Checkbox
                      checked={soNaoConciliado}
                      onCheckedChange={(v) => definirSoNaoConciliado(v === true)}
                      data-testid="filtro-nao-conciliado"
                    />
                    <span className="text-muted-foreground">
                      Esconder as {jaConferidasNoSistema} já conferidas em conciliações
                      anteriores
                    </span>
                  </label>
                )}
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {soSistemaVisivel.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="tabular-nums text-muted-foreground">{diaCurto(m.data)}</span>{" "}
                        {m.descricao}
                        <Badge variant="outline" className="ml-2 font-normal">
                          {m.tipo === "recebimento" ? "recebimento" : "pagamento"}
                        </Badge>
                      </span>
                      <span className="tabular-nums font-medium whitespace-nowrap">
                        {brl(m.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {conciliacao.casadas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5 text-positivo" />
                  Conferido — bateu dos dois lados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {conciliacao.casadas.map(({ transacao, movimento }) => (
                    <li key={movimento.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate text-muted-foreground">
                        <span className="tabular-nums">{diaCurto(transacao.data)}</span>{" "}
                        {movimento.descricao}
                      </span>
                      <span className="tabular-nums whitespace-nowrap">
                        {brl(movimento.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
