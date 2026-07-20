import { auditLogTable } from "@workspace/db";
import { randomUUID } from "node:crypto";
import type { DbExecutor } from "./disponibilidade";

/**
 * Trilha de auditoria (E10). Registrar SEMPRE dentro da transação da ação:
 * se o log falhar, a ação não acontece — ação sensível sem rastro é pior que
 * um 500. União fechada de ações: quem inventa ação nova passa por aqui e o
 * relatório já a conhece.
 */
export const ACOES_AUDITORIA = [
  "PARCELA_RECEBIDA",
  "RECEBIMENTO_ESTORNADO",
  "CONTA_PAGA",
  "PAGAMENTO_REGISTRADO",
  "PAGAMENTO_ESTORNADO",
  "ESTORNO_COMISSAO_BAIXADO",
] as const;
export type AcaoAuditoria = (typeof ACOES_AUDITORIA)[number];

export interface RegistroAuditoria {
  lojaId: string;
  /** Autor da sessão (req.usuario) — id + nome desnormalizado. */
  usuario: { id: string; nome: string };
  acao: AcaoAuditoria;
  entidade: "parcela" | "conta_pagar" | "pagamento" | "contrato";
  entidadeId: string;
  detalhe?: Record<string, unknown>;
}

export async function registrarAuditoria(
  executor: DbExecutor,
  registro: RegistroAuditoria,
): Promise<void> {
  await executor.insert(auditLogTable).values({
    id: randomUUID(),
    lojaId: registro.lojaId,
    usuarioId: registro.usuario.id,
    usuarioNome: registro.usuario.nome,
    acao: registro.acao,
    entidade: registro.entidade,
    entidadeId: registro.entidadeId,
    detalhe: registro.detalhe ?? null,
  });
}
