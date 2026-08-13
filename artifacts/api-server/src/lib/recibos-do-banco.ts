import { auditLogTable, db } from "@workspace/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";
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
  return trilhaDosRecebimentos(lojaId, [...parcelaIds, contratoId]);
}

/**
 * S-C31 — a MESMA leitura, para o caixa realizado.
 *
 * O fluxo, o DRE e o CSV da contabilidade passaram a datar cada recebimento
 * pelo dia dele (`lib/recebimentos-do-caixa.ts`), e o dia de cada ato mora onde
 * o recibo já o lia. Uma leitura só, um formato só: se o corte do estorno
 * mudar, ele muda para o papel e para o caixa no mesmo lugar.
 *
 * Os alvos são as parcelas **e** os contratos delas — o segundo estorno
 * (`CONTRATO_CANCELADO` com `destinoPago: "estornar"`) aponta o contrato.
 */
export async function trilhaDosRecebimentos(
  lojaId: string,
  alvos: readonly string[],
): Promise<LinhaDaTrilha[]> {
  const unicos = [...new Set(alvos)];
  if (unicos.length === 0) return [];
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
        inArray(auditLogTable.entidadeId, unicos),
        or(
          eq(auditLogTable.acao, "PARCELA_RECEBIDA"),
          eq(auditLogTable.acao, "RECEBIMENTO_ESTORNADO"),
          eq(auditLogTable.acao, "CONTRATO_CANCELADO"),
        ),
      ),
    );
}

/**
 * S-C31 — as parcelas que têm um recebimento DENTRO da janela e cujo
 * `recebido_em` está FORA dela.
 *
 * Sem esta pergunta o conserto não alcançaria o caso que o motiva. As três
 * consultas do caixa recortam por `parcelas.recebido_em`, que é o instante do
 * ÚLTIMO pedaço: a parcela paga **R$ 300,00 em 28/02** e **R$ 700,00 em 15/03**
 * tem `recebido_em = 15/03` e **não entra** na consulta de fevereiro — o mês
 * continuaria fechando R$ 300,00 a menos por mais que o motor soubesse dividir.
 *
 * Devolve ids para o `WHERE` da consulta de parcelas: o SQL entrega um
 * SUPERCONJUNTO da janela e os motores recortam com a régua exata, que é como
 * as três já trabalham.
 *
 * O dia do ato é `detalhe->>'recebidoEm'`, com queda para `criado_em` nos atos
 * anteriores ao E221 — o mesmo `??` do recibo, pela mesma razão: é o único dia
 * que o sistema guardou daqueles atos.
 */
export async function parcelasComRecebimentoNaJanela(
  lojaId: string,
  de: Date,
  ate: Date,
): Promise<string[]> {
  const diaDoAto = sql`coalesce((${auditLogTable.detalhe} ->> 'recebidoEm')::timestamptz, ${auditLogTable.criadoEm})`;
  const linhas = await db
    .selectDistinct({ entidadeId: auditLogTable.entidadeId })
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.lojaId, lojaId),
        eq(auditLogTable.acao, "PARCELA_RECEBIDA"),
        sql`${diaDoAto} >= ${de.toISOString()}::timestamptz`,
        sql`${diaDoAto} < ${ate.toISOString()}::timestamptz`,
      ),
    );
  return linhas.map((l) => l.entidadeId);
}
