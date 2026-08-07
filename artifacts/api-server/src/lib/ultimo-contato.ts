import { db, registrosCobrancaTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";

/**
 * Último contato de cada lead (E27): `max(contatoData)` de registros_cobranca.
 * É uma query agregada à parte, não uma subquery correlacionada dentro do
 * relational builder — ali o drizzle aliasa a tabela e a correlação com
 * `leads.id` sai errada em silêncio. Um SELECT a mais, limitado à página.
 *
 * Alimenta o "parada há N dias sem contato" do funil e, desde a S-D13, o
 * `ultimoContatoEm` que a lista de parcelas embute — é o que deixa a marca de
 * "cobrada hoje" da fila de mensagens sobreviver ao F5. Morava em `leads.ts`;
 * subiu para cá quando o financeiro passou a ser o quinto chamador.
 */
export async function ultimoContatoPorLead(leadIds: string[]): Promise<Map<string, Date>> {
  if (leadIds.length === 0) return new Map();
  const linhas = await db
    .select({
      leadId: registrosCobrancaTable.leadId,
      ultimo: sql<Date>`max(${registrosCobrancaTable.contatoData})`,
    })
    .from(registrosCobrancaTable)
    .where(inArray(registrosCobrancaTable.leadId, leadIds))
    .groupBy(registrosCobrancaTable.leadId);
  return new Map(linhas.map((l) => [l.leadId, l.ultimo]));
}
