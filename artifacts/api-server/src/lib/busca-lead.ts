import { db, leadsTable } from "@workspace/db";
import { and, eq, ilike, or, sql } from "drizzle-orm";

/**
 * E124/D1 — a busca "pela noiva" como subconsulta, a MESMA régua do listLeads
 * (`routes/leads.ts`): nome da noiva/noivo por ilike (os índices trigram
 * `leads_noiva_nome_trgm_idx`/`leads_noivo_nome_trgm_idx` cobrem — medido no
 * mapeamento: 0,7 ms de execução no banco de dev) e dígitos contra o WhatsApp
 * sem máscara ("11988" encontra "(11) 98888-7777").
 *
 * Devolve os ids de lead que casam, para recortar contratos e orçamentos por
 * `inArray` — uma condição só, escrita uma vez, para as duas listas do acervo.
 */
export function leadsQueCasam(lojaId: string, busca: string) {
  const padrao = `%${busca}%`;
  const porCampo = [ilike(leadsTable.noivaNome, padrao), ilike(leadsTable.noivoNome, padrao)];
  const soDigitos = busca.replace(/\D/g, "");
  if (soDigitos.length >= 4) {
    porCampo.push(
      sql`regexp_replace(coalesce(${leadsTable.whatsapp}, ''), '\\D', '', 'g') LIKE ${`%${soDigitos}%`}`,
    );
  }
  return db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(eq(leadsTable.lojaId, lojaId), or(...porCampo)!));
}
