import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useListParcelas,
  getListParcelasQueryKey,
  useListPagamentos,
  getListPagamentosQueryKey,
} from "@workspace/api-client-react";
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
import { brl } from "@/lib/formatos";

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

const dataFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
});

function diaCurto(ymd: string): string {
  return dataFmt.format(new Date(`${ymd}T12:00:00-03:00`));
}

export default function Conciliacao() {
  const { lojaId } = useParams();
  const { activeLojaId } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [transacoes, setTransacoes] = useState<TransacaoExtrato[] | null>(null);
  const [formato, setFormato] = useState<"ofx" | "csv" | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const parcelas = useListParcelas(activeLojaId!, undefined, {
    query: { queryKey: getListParcelasQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const pagamentos = useListPagamentos(activeLojaId!, undefined, {
    query: { queryKey: getListPagamentosQueryKey(activeLojaId!), enabled: !!activeLojaId },
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

  // A janela de comparação é a do PRÓPRIO extrato (±2 dias de tolerância):
  // movimentos do sistema fora dela não são pendência — só não estão no arquivo.
  const conciliacao = useMemo(() => {
    if (!transacoes || transacoes.length === 0) return null;
    const dias = transacoes.map((t) => t.data).sort();
    const inicio = addDias(dias[0], -2);
    const fim = addDias(dias[dias.length - 1], 2);

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
  }, [transacoes, parcelas.data, pagamentos.data]);

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

      {conciliacao && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Bateu</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-positivo">{conciliacao.casadas.length}</div>
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
                  <Link to={`/loja/${lojaId}/financeiro/receber`} className="text-primary underline underline-offset-4">
                    receber
                  </Link>{" "}
                  ou{" "}
                  <Link to={`/loja/${lojaId}/financeiro/pagar`} className="text-primary underline underline-offset-4">
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

          {conciliacao.soSistema.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">No sistema, mas não no banco</CardTitle>
                <CardDescription>
                  Registrado aqui e sem par no extrato — pode ser dinheiro em espécie, outra
                  conta, ou um lançamento errado.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {conciliacao.soSistema.map((m) => (
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
