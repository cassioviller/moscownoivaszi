import { brl } from "@/lib/formatos";
import type { RecebimentosPorForma } from "@/lib/financeiro/forma";

/**
 * O que entrou, por MEIO de pagamento (E50) — a visão que a loja usa para
 * conciliar: a taxa do cartão contra a maquininha, o Pix contra o extrato, o
 * dinheiro contra a gaveta.
 *
 * Puramente apresentacional: a agregação é o `porMeio` do servidor
 * (`entradasPorMeio`, E79 — o client-side saiu no E88), e por isso o total
 * daqui fecha por construção com o "Recebimentos" do DRE e com as entradas do
 * fluxo — as três leituras saem do mesmo filtro.
 *
 * A barra é proporcional ao MAIOR meio, não ao total: comparar os meios entre
 * si é a pergunta ("o cartão pesa mais que o Pix?"), e contra o total quase
 * tudo vira faixa fina.
 */
export function RecebimentosPorFormaLista({ dados }: { dados: RecebimentosPorForma }) {
  if (dados.linhas.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum recebimento no período.</p>;
  }

  const maior = Math.max(...dados.linhas.map((l) => l.total), 0.01);

  return (
    <div className="space-y-3" data-testid="recebimentos-por-forma">
      <ul className="space-y-2">
        {dados.linhas.map((l) => (
          <li key={l.forma ?? "sem-forma"} className="space-y-1">
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 truncate text-sm">
                {l.rotulo}
                <span className="ml-2 text-xs text-muted-foreground">
                  {l.qtd} {l.qtd === 1 ? "recebimento" : "recebimentos"}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-positivo">{brl(l.total)}</span>
            </div>
            <div className="h-1.5 rounded-sm bg-muted" aria-hidden="true">
              <div
                className={`h-full rounded-sm ${l.forma === null ? "bg-muted-foreground/40" : "bg-primary/60"}`}
                style={{ width: `${(l.total / maior) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {/* A ressalva que o dado impõe: a parcela guarda UMA forma, a do último
          recebimento. Desde a E49 ela pode ser paga em partes, e metade no Pix
          + metade no cartão aparece inteira no cartão. Quem concilia precisa
          saber onde o número pode escorregar. */}
      <p className="text-xs text-muted-foreground">
        Cada parcela entra pelo meio do último recebimento — uma paga em partes por meios
        diferentes conta inteira no último.
      </p>
    </div>
  );
}
