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
/**
 * S-M14 — o que a pessoa digitou vira LITERAL dentro do LIKE.
 *
 * `%${busca}%` cru deixava `%` e `_` valendo como curinga: buscar `%`
 * devolvia o cadastro inteiro, e colar "50% entrada" de um orçamento buscava
 * outra coisa sem dizer que buscou. O escape é o do Postgres (`\`), e a
 * própria contrabarra entra primeiro — senão `\%` digitado escaparia o
 * escape. Régua única para as DUAS buscas de noiva (esta e a do listLeads).
 */
export function padraoDeBusca(busca: string): string {
  return `%${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function leadsQueCasam(lojaId: string, busca: string) {
  const padrao = padraoDeBusca(busca);
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
