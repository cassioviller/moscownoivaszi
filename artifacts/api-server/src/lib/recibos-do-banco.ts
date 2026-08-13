import { auditLogTable, db } from "@workspace/db";
import { and, eq, inArray, or } from "drizzle-orm";
import type { LinhaDaTrilha } from "./recibo-do-papel";

/**
 * E221 — as linhas de trilha que o recibo lê, num tiro só.
 *
 * A montagem do papel (`lib/recibo-do-papel.ts`) é PURA de propósito: ela
 * decide o que vale e o que foi estornado sem saber que existe banco. Esta é a
 * camada que a alimenta, e ela existe separada porque **duas rotas leem o mesmo
 * conjunto** — a da loja e a do portal da noiva — e a única diferença entre as
 * duas é a prova de quem pode ver (a loja da URL contra o token), que fica na
 * rota, como no PDF do contrato.
 *
 * O `lojaId` entra na consulta e não é decoração: ele é a fronteira de loja que
 * a `varredura-fronteira-loja-api` cobra, e o índice `(loja_id, entidade_id)`
 * que o E221 criou é exatamente esta pergunta.
 *
 * Traz as três ações que decidem um recibo: o recebimento e os DOIS estornos —
 * o avulso, que aponta a parcela, e o cancelamento do contrato com
 * `destinoPago: "estornar"`, que aponta o contrato.
 */
export async function trilhaDosRecibos(
  lojaId: string,
  contratoId: string,
  parcelaIds: string[],
): Promise<LinhaDaTrilha[]> {
  const alvos = [...parcelaIds, contratoId];
  if (alvos.length === 0) return [];
  return db
    .select({
      id: auditLogTable.id,
      acao: auditLogTable.acao,
      entidadeId: auditLogTable.entidadeId,
      usuarioNome: auditLogTable.usuarioNome,
      criadoEm: auditLogTable.criadoEm,
      detalhe: auditLogTable.detalhe,
    })
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.lojaId, lojaId),
        inArray(auditLogTable.entidadeId, alvos),
        or(
          eq(auditLogTable.acao, "PARCELA_RECEBIDA"),
          eq(auditLogTable.acao, "RECEBIMENTO_ESTORNADO"),
          eq(auditLogTable.acao, "CONTRATO_CANCELADO"),
        ),
      ),
    );
}
