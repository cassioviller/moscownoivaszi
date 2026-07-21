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
  "COMISSAO_FECHAMENTO_REABERTO",
] as const;
export type AcaoAuditoria = (typeof ACOES_AUDITORIA)[number];

export function acaoValida(s: string): s is AcaoAuditoria {
  return (ACOES_AUDITORIA as readonly string[]).includes(s);
}

/**
 * Rótulos legíveis das ações, para o CSV da trilha (E47).
 *
 * ESPELHO de `ROTULO_ACAO` em moscow-noivas/src/pages/financeiro/auditoria.tsx
 * — a planilha da contadora e a tela têm de chamar a mesma coisa pelo mesmo
 * nome. Ação nova entra na união acima e o TypeScript cobra o rótulo aqui;
 * do outro lado o mapa é frouxo (cai no código cru) de propósito, porque tela
 * velha lendo trilha nova não pode quebrar.
 */
export const ROTULO_ACAO: Record<AcaoAuditoria, string> = {
  PARCELA_RECEBIDA: "Parcela recebida",
  RECEBIMENTO_ESTORNADO: "Recebimento estornado",
  CONTA_PAGA: "Conta paga",
  PAGAMENTO_REGISTRADO: "Pagamento registrado",
  PAGAMENTO_ESTORNADO: "Pagamento estornado",
  ESTORNO_COMISSAO_BAIXADO: "Estorno de comissão baixado",
  COMISSAO_FECHAMENTO_REABERTO: "Fechamento de comissão reaberto",
};

const quandoFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * "21/07/2026 14:32" no fuso da loja. A trilha é INSTANTE, e a hora importa
 * tanto quanto o dia: "quem estornou às 23h50" é metade da pergunta.
 */
export function quandoLocalSP(instante: Date): string {
  return quandoFmt.format(instante).replace(", ", " ");
}

export interface RegistroAuditoria {
  lojaId: string;
  /** Autor da sessão (req.usuario) — id + nome desnormalizado. */
  usuario: { id: string; nome: string };
  acao: AcaoAuditoria;
  entidade: "parcela" | "conta_pagar" | "pagamento" | "contrato" | "comissao_fechamento";
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
