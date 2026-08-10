import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { brl, diaMesAno } from "@/lib/formatos";
import { reais } from "@/lib/financeiro/dinheiro";
import type { ParcelaPlanejada } from "@/lib/financeiro/plano";

/**
 * F16/S10 — o carnê que vai ser criado, à vista, antes de criar.
 *
 * A noiva pergunta "quanto fica por mês?" e a vendedora dividia de cabeça: o
 * plano só aparecia DEPOIS de gerado, numa outra tela. Nasceu inline na tela de
 * orçamento (E95) e saiu para cá quando a tela de contrato ganhou a mesma
 * prévia (S10) — duas grafias do mesmo desenho é a classe que a regra 26
 * proíbe.
 *
 * As linhas vêm de `montarPlanoParcelas` — a MESMA função que o servidor usa
 * para gravar. Não há segunda conta entre o que a noiva vê e o que vai para o
 * banco: no orçamento o array é o próprio corpo do `POST /contratos`; no
 * contrato o `gerar-plano` refaz a conta no servidor com a mesma função e os
 * mesmos parâmetros.
 */
export function PreviaDoCarne({ erro, linhas }: { erro: string | null; linhas: ParcelaPlanejada[] | null }) {
  if (erro) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{erro}</AlertDescription>
      </Alert>
    );
  }
  if (!linhas || linhas.length === 0) return null;

  const entrada = linhas.find((l) => l.numero === 0);
  const parcelas = linhas.filter((l) => l.numero > 0);
  const primeira = parcelas[0];
  const ultima = parcelas[parcelas.length - 1];
  // A última só difere das irmãs quando a divisão não é exata — e é por isso
  // que ela merece ser dita: é o centavo que a noiva confere no carnê.
  const ultimaDifere = !!primeira && !!ultima && ultima.valorCentavos !== primeira.valorCentavos;

  return (
    <div className="bg-muted/40 space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">
        {entrada ? `Entrada de ${brl(reais(entrada.valorCentavos))} em ${diaMesAno(entrada.vencimento)}` : null}
        {entrada && parcelas.length > 0 ? " · " : null}
        {parcelas.length > 0 ? (
          <>
            {parcelas.length}× de {brl(reais(primeira.valorCentavos))}
            {ultimaDifere ? ` (a última de ${brl(reais(ultima.valorCentavos))})` : null}
            {parcelas.length > 1 ? `, de ${diaMesAno(primeira.vencimento)} a ${diaMesAno(ultima.vencimento)}` : ` em ${diaMesAno(primeira.vencimento)}`}
          </>
        ) : null}
      </p>
      <ul className="max-h-40 space-y-0.5 overflow-y-auto text-sm">
        {linhas.map((l) => (
          <li key={l.numero} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{l.descricao}</span>
            <span className="tabular-nums">
              {brl(reais(l.valorCentavos))} · {diaMesAno(l.vencimento)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
