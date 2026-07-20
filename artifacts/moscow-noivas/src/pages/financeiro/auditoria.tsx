import { Link, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useListAuditoria,
  getListAuditoriaQueryKey,
  type AuditoriaItem,
} from "@workspace/api-client-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { brl } from "@/lib/formatos";

// Exportados para o log de atividade da equipe (E18) — mesma trilha, outra lente.
export const ROTULO_ACAO: Record<string, string> = {
  PARCELA_RECEBIDA: "Parcela recebida",
  RECEBIMENTO_ESTORNADO: "Recebimento estornado",
  CONTA_PAGA: "Conta paga",
  PAGAMENTO_REGISTRADO: "Pagamento registrado",
  PAGAMENTO_ESTORNADO: "Pagamento estornado",
  ESTORNO_COMISSAO_BAIXADO: "Estorno de comissão baixado",
};

// Estornos desfazem dinheiro — merecem olho mais atento na lista.
const ACOES_DESTAQUE = new Set(["RECEBIMENTO_ESTORNADO", "PAGAMENTO_ESTORNADO"]);

const quandoFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Uma frase com o que a ação mexeu, extraída do detalhe jsonb. */
export function resumoDetalhe(item: AuditoriaItem): string | null {
  const d = (item.detalhe ?? {}) as Record<string, unknown>;
  const partes: string[] = [];
  const valor = d.valorRecebido ?? d.valorPago ?? d.valorBaixado;
  if (typeof valor === "number") partes.push(`R$ ${brl(valor)}`);
  if (typeof d.descricao === "string") partes.push(d.descricao);
  if (typeof d.competencia === "string") partes.push(`competência ${d.competencia}`);
  if (typeof d.motivo === "string" && d.motivo) partes.push(`motivo: ${d.motivo}`);
  if (Array.isArray(d.contas)) partes.push(`${d.contas.length} conta${d.contas.length === 1 ? "" : "s"}`);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/**
 * Trilha de auditoria (E10): quem recebeu, estornou, pagou e baixou — a
 * pergunta "quem fez isso?" respondida sem abrir chamado para o suporte.
 */
export default function Auditoria() {
  const { lojaId } = useParams();
  const { activeLojaId } = useAuth();

  const trilha = useListAuditoria(activeLojaId!, {
    query: { queryKey: getListAuditoriaQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/loja/${lojaId}/financeiro`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Financeiro
        </Link>
        <h1 className="text-3xl font-serif mt-1">Trilha de auditoria</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Toda ação que mexe em dinheiro deixa linha aqui: quem fez, o quê e quando. Os 200
          registros mais recentes.
        </p>
      </div>

      {trilha.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar a trilha</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>Falha ao buscar os registros.</span>
            <Button variant="outline" size="sm" onClick={() => trilha.refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : trilha.isLoading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-muted rounded-md" />
          ))}
        </div>
      ) : (trilha.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma ação registrada ainda — a trilha começa a contar a partir de agora.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {trilha.data!.map((item) => {
            const resumo = resumoDetalhe(item);
            return (
              <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                  {quandoFmt.format(new Date(item.criadoEm)).replace(", ", " às ")}
                </span>
                <Badge variant={ACOES_DESTAQUE.has(item.acao) ? "destructive" : "secondary"}>
                  {ROTULO_ACAO[item.acao] ?? item.acao}
                </Badge>
                <span className="text-sm font-medium">{item.usuarioNome}</span>
                {resumo && <span className="text-sm text-muted-foreground">{resumo}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
