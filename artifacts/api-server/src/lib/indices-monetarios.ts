import { db, indicesMonetariosTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

/**
 * P4/E237 — o IPCA da loja, por competência, no formato que a conta pura da
 * mora recebe (`"YYYY-MM"` → %). Uma leitura por handler: quem devolve
 * parcelas com `mora` carrega o mapa uma vez e passa a `moraDe(p, ipca)`.
 */
export async function ipcaDaLoja(lojaId: string): Promise<Map<string, number>> {
  const linhas = await db
    .select({ competencia: indicesMonetariosTable.competencia, pct: indicesMonetariosTable.variacaoPct })
    .from(indicesMonetariosTable)
    .where(and(eq(indicesMonetariosTable.lojaId, lojaId), eq(indicesMonetariosTable.indice, "IPCA")));
  return new Map(linhas.map((l) => [l.competencia, Number(l.pct)]));
}
