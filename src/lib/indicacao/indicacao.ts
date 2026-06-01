// src/lib/indicacao/indicacao.ts
//
// Indicação de vestido por interesse. Vestido e noiva escolhem do MESMO catálogo
// (Atributo/AtributoOpcao), então a afinidade é só contar os pares (atributo,
// opção) que coincidem. Orçamento entra como filtro suave: dentro do teto vem
// primeiro, mas fora do teto ainda aparece (a vendedora decide).
//
// SEGURANÇA: Lead e Vestido são tenant models (via tenantPrisma). LeadInteresse
// (sem lojaId) só é lido DEPOIS de confirmar que o Lead é da loja.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { listarCatalogo } from "@/lib/catalogo/catalogo";

export type VestidoIndicado = {
  id: string;
  codigo: string;
  nome: string;
  precoBase: string;
  pontos: number; // nº de atributos que coincidem com o interesse
  total: number; // nº de atributos que a noiva preencheu
  combinam: string[]; // nomes dos atributos que casaram (pra UI)
  dentroDoOrcamento: boolean;
};

/**
 * Vestidos ativos da loja ranqueados pela afinidade com o interesse da noiva.
 * Retorna [] se a noiva não é da loja, não tem interesse, ou não preencheu nenhum
 * atributo. Só lista vestidos com ao menos 1 atributo em comum.
 */
export async function indicarVestidos(
  lojaId: string,
  leadId: string,
  limite = 6,
): Promise<VestidoIndicado[]> {
  const tp = tenantPrisma(prisma, lojaId);

  const lead = await tp.lead.findUnique({ where: { id: leadId }, select: { id: true } });
  if (!lead) return []; // não é da loja (falha fechada)

  const interesse = await prisma.leadInteresse.findUnique({
    where: { leadId },
    select: {
      tetoOrcamento: true,
      atributos: { select: { atributoId: true, opcaoId: true } },
    },
  });
  if (!interesse || interesse.atributos.length === 0) return [];

  // O que a noiva quer: atributoId → opcaoId.
  const desejado = new Map(interesse.atributos.map((a) => [a.atributoId, a.opcaoId]));
  const teto = interesse.tetoOrcamento ? Number(interesse.tetoOrcamento) : null;

  const catalogo = await listarCatalogo(lojaId);
  const nomePorAttr = new Map(catalogo.map((a) => [a.id, a.nome]));

  const vestidos = await tp.vestido.findMany({
    where: { status: "ativo" },
    include: { atributos: { select: { atributoId: true, opcaoId: true } } },
  });

  const total = desejado.size;
  const indicados: VestidoIndicado[] = vestidos.map((v) => {
    const combinam: string[] = [];
    for (const a of v.atributos) {
      if (desejado.get(a.atributoId) === a.opcaoId) {
        combinam.push(nomePorAttr.get(a.atributoId) ?? "—");
      }
    }
    const preco = Number(v.precoBase);
    return {
      id: v.id,
      codigo: v.codigo,
      nome: v.nome,
      precoBase: v.precoBase.toString(),
      pontos: combinam.length,
      total,
      combinam,
      dentroDoOrcamento: teto === null ? true : preco <= teto,
    };
  });

  return indicados
    .filter((i) => i.pontos > 0)
    .sort((a, b) =>
      a.dentroDoOrcamento !== b.dentroDoOrcamento
        ? Number(b.dentroDoOrcamento) - Number(a.dentroDoOrcamento)
        : b.pontos - a.pontos,
    )
    .slice(0, limite);
}
