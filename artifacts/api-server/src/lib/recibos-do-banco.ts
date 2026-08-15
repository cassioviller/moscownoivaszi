import { auditLogTable, db, parcelasTable } from "@workspace/db";
import { and, eq, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { addDias, inicioDoDia } from "@workspace/financeiro-core";
import type { LinhaDaTrilha } from "./recibo-do-papel";
import { porRecebimento, type ParcelaDoCaixa } from "./recebimentos-do-caixa";

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

/**
 * S-C31 — as parcelas do caixa REALIZADO da janela, uma linha por recebimento.
 *
 * As três leituras do realizado (fluxo, CSV do fluxo e DRE) recortavam por
 * `parcelas.recebido_em`, que guarda **só o último pedaço**: R$ 300,00 que
 * entraram em 01/03 eram contados no dia 15/03, quando os R$ 700,00 quitaram a
 * parcela. Aqui a mesma janela é respondida em dois passos, e os dois são
 * necessários:
 *
 * 1. **quem entra na consulta** — o `recebido_em` da janela (o de sempre) MAIS
 *    as parcelas com um ato dentro dela e o `recebido_em` fora (sem isso, o mês
 *    do pedaço antigo continuaria vazio);
 * 2. **como cada linha é datada** — `porRecebimento` divide o que a trilha
 *    fecha e deixa intacto o que ela não fecha.
 *
 * O total do período NÃO muda por isso: o que muda é o dia (e a forma) de cada
 * pedaço. Quem recorta a janela continua sendo o motor do `financeiro-core`,
 * sobre o superconjunto que o SQL entrega.
 *
 * **E235**: saíram de `routes/financeiro.ts` para cá porque a conciliação passou
 * a montar os movimentos do sistema pela mesma leitura — quatro leituras, uma
 * régua.
 */
export async function realizadoPorRecebimento<T extends ParcelaDoCaixa>(
  lojaId: string,
  parcelas: readonly T[],
): Promise<T[]> {
  const alvos = parcelas.flatMap((p) => [p.id, p.contratoId]);
  return porRecebimento(parcelas, await trilhaDosRecebimentos(lojaId, alvos));
}

/** O `WHERE` do passo 1: o `recebido_em` da janela ou um ato dentro dela. */
export async function recebidasNaJanela(lojaId: string, iniYMD: string, fimYMD: string) {
  const de = inicioDoDia(iniYMD);
  const ate = inicioDoDia(addDias(fimYMD, 1));
  const comAto = await parcelasComRecebimentoNaJanela(lojaId, de, ate);
  return and(
    eq(parcelasTable.lojaId, lojaId),
    or(
      and(isNotNull(parcelasTable.recebidoEm), gte(parcelasTable.recebidoEm, de), lt(parcelasTable.recebidoEm, ate)),
      ...(comAto.length > 0 ? [inArray(parcelasTable.id, comAto)] : []),
    ),
  );
}
