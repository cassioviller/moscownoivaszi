import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useListIndicesMonetarios,
  getListIndicesMonetariosQueryKey,
  useGravarIndiceMonetario,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Percent } from "lucide-react";
import { mensagemApi } from "@/lib/erro-api";
import { Carregando, Erro } from "@/components/estado";
import { competenciaAtual, rotuloCompetencia, ultimasCompetencias } from "@/lib/financeiro/datas";

/**
 * **P4/E237 — o IPCA informado por competência.**
 *
 * A cláusula 9ª manda corrigir e não nomeia índice; em 15/08/2026 a dona
 * escolheu o IPCA. O sistema não busca o índice em lugar nenhum: a dona digita
 * a variação do mês aqui, e a mora corrige o saldo das parcelas vencidas pelos
 * meses CHEIOS entre o vencimento e hoje. Mês sem número é mês sem correção —
 * a frase da mora, na fila e no carnê, diz qual mês falta.
 *
 * A tela mostra os últimos 24 meses (o mês corrente incluso, embora ele nunca
 * seja "cheio" ainda — vale para o mês que vem) e um campo por mês; salvar é
 * UPSERT: corrigir um número errado é digitar de novo, e a trilha guarda quem.
 */
// A variação em %, na grafia brasileira. Número, não data — mas a régua D15 lê o método de locale como
// data em potencial, e o formatador nomeado é o que ela reconhece (o mesmo desenho do `brl`).
const pctFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const pct = (v: number) => `${pctFmt.format(v)}%`;

export function IndicesMonetarios() {
  const { activeLojaId } = useAuth();
  const indices = useListIndicesMonetarios(activeLojaId!, {
    query: { queryKey: getListIndicesMonetariosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const gravar = useGravarIndiceMonetario();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  const competencias = useMemo(() => ultimasCompetencias(competenciaAtual(), 24).reverse(), []);
  const gravado = useMemo(() => new Map((indices.data ?? []).map((i) => [i.competencia, i.variacaoPct])), [indices.data]);

  async function salvar(competencia: string) {
    const texto = (rascunho[competencia] ?? "").replace(",", ".").trim();
    const variacaoPct = Number(texto);
    if (texto === "" || !Number.isFinite(variacaoPct)) {
      toast({ title: "Digite a variação do mês", description: "Em pontos percentuais — o IPCA de 0,42% é 0,42.", variant: "destructive" });
      return;
    }
    try {
      await gravar.mutateAsync({ lojaId: activeLojaId!, data: { competencia, variacaoPct } });
      await queryClient.invalidateQueries({ queryKey: getListIndicesMonetariosQueryKey(activeLojaId!) });
      setRascunho((r) => ({ ...r, [competencia]: "" }));
      toast({ title: `IPCA de ${rotuloCompetencia(competencia)} gravado`, description: `${pct(variacaoPct)} — as parcelas vencidas já leem o número novo.` });
    } catch (err) {
      toast({ title: "Não deu para gravar", description: mensagemApi(err, "Tente novamente."), variant: "destructive" });
    }
  }

  return (
    <Card data-testid="card-indices-ipca">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="h-4 w-4 text-primary" />
          Índices — IPCA (cláusula 9ª)
        </CardTitle>
        <CardDescription>
          A parcela vencida é corrigida pelo IPCA dos meses cheios de atraso — com o número que você informa
          aqui. Mês sem número não corrige, e a fila diz qual falta. Digite a variação do mês em pontos
          percentuais (0,42% é <strong>0,42</strong>).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {indices.isError && <Erro titulo="Não deu para ler os índices" erro={indices.error} onTentarNovamente={() => void indices.refetch()} />}
        {indices.isLoading && <Carregando forma="lista" linhas={4} />}
        {indices.data && (
          <ul className="divide-y">
            {competencias.map((c) => {
              const atual = gravado.get(c);
              return (
                <li key={c} className="flex flex-wrap items-center gap-3 py-2" data-testid={`indice-${c}`}>
                  <span className="w-40 text-sm">{rotuloCompetencia(c)}</span>
                  <span className="w-28 text-sm text-muted-foreground" data-testid={`indice-${c}-atual`}>
                    {atual !== undefined ? pct(atual) : "— não informado"}
                  </span>
                  <Label htmlFor={`ipca-${c}`} className="sr-only">
                    IPCA de {rotuloCompetencia(c)}
                  </Label>
                  <Input
                    id={`ipca-${c}`}
                    className="w-28"
                    inputMode="decimal"
                    placeholder={atual !== undefined ? String(atual).replace(".", ",") : "0,42"}
                    value={rascunho[c] ?? ""}
                    onChange={(e) => setRascunho((r) => ({ ...r, [c]: e.target.value }))}
                  />
                  <Button size="sm" variant="outline" onClick={() => void salvar(c)} disabled={gravar.isPending || !(rascunho[c] ?? "").trim()}>
                    {atual !== undefined ? "Corrigir" : "Gravar"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
