// src/lib/indicacao/indicacao.ts
//
// Indicação de vestido por interesse. Vestido e noiva escolhem do MESMO catálogo
// (Atributo/AtributoOpcao), então a afinidade é só contar os pares (atributo,
// opção) que coincidem. Orçamento entra como filtro suave: dentro do teto vem
// primeiro, mas fora do teto ainda aparece (a vendedora decide). Empate de
// afinidade dentro do mesmo orçamento → mais barato primeiro.
//
// LIMITE consciente: `naoQuerUsar`/`algoAMais` são texto livre — não dá pra
// casar com segurança contra o catálogo, então NÃO entram no score. O caller
// mostra o "não quer usar" como lembrete manual ao lado das sugestões.
//
// SEGURANÇA: Lead e Vestido são tenant models (via tenantPrisma). LeadInteresse
// (sem lojaId) só é lido DEPOIS de confirmar que o Lead é da loja.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { listarCatalogo } from "@/lib/catalogo/catalogo";

export type AtributoCombinado = { nome: string; valor: string };

export type VestidoIndicado = {
  id: string;
  codigo: string;
  nome: string;
  precoBase: string;
  pontos: number; // nº de atributos que coincidem com o interesse
  total: number; // nº de atributos que a noiva preencheu
  combinam: AtributoCombinado[]; // o que casou (atributo + valor) — o "porquê"
  faltam: string[]; // atributos desejados que este vestido NÃO atende (lacunas)
  dentroDoOrcamento: boolean;
};

/**
 * Heurística SÓ de exibição (não pontua, não ordena — respeita o LIMITE deste
 * módulo): true se algum token de `naoQuerUsar` (palavras com ≥ 4 letras)
 * aparece no nome ou nos atributos que combinaram. É um sinal para a vendedora
 * olhar com atenção; o julgamento continua humano.
 */
export function conflitaComRecusa(
  naoQuerUsar: string | null | undefined,
  alvo: { nome: string; combinam: { valor: string }[] },
): boolean {
  const txt = (naoQuerUsar ?? "").toLowerCase();
  if (!txt.trim()) return false;
  const tokens = txt.split(/[^a-zà-ú0-9]+/i).filter((t) => t.length >= 4);
  if (tokens.length === 0) return false;
  const haystack = [alvo.nome, ...alvo.combinam.map((c) => c.valor)].join(" ").toLowerCase();
  return tokens.some((t) => haystack.includes(t));
}

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

  // Catálogo → valor de cada opção (pra explicar o match) e a ORDEM dos
  // atributos. Iterar pelo catálogo dá ordem determinística no combinam/faltam e
  // descarta atributo desejado que tenha sido desativado depois (não conta no total).
  const catalogo = await listarCatalogo(lojaId);
  const valorPorOpcao = new Map<string, string>();
  for (const a of catalogo) for (const o of a.opcoes) valorPorOpcao.set(o.id, o.valor);
  const desejadoOrdenado = catalogo
    .filter((a) => desejado.has(a.id))
    .map((a) => ({ atributoId: a.id, nome: a.nome, opcaoId: desejado.get(a.id)! }));

  const total = desejadoOrdenado.length;
  if (total === 0) return []; // todos os atributos desejados foram desativados

  const vestidos = await tp.vestido.findMany({
    where: { status: "ativo" },
    include: { atributos: { select: { atributoId: true, opcaoId: true } } },
  });

  const indicados: VestidoIndicado[] = vestidos.map((v) => {
    const opcaoDoVestido = new Map(v.atributos.map((a) => [a.atributoId, a.opcaoId]));
    const combinam: AtributoCombinado[] = [];
    const faltam: string[] = [];
    for (const d of desejadoOrdenado) {
      if (opcaoDoVestido.get(d.atributoId) === d.opcaoId) {
        combinam.push({ nome: d.nome, valor: valorPorOpcao.get(d.opcaoId) ?? "—" });
      } else {
        faltam.push(d.nome);
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
      faltam,
      dentroDoOrcamento: teto === null ? true : preco <= teto,
    };
  });

  return indicados
    .filter((i) => i.pontos > 0)
    .sort((a, b) => {
      if (a.dentroDoOrcamento !== b.dentroDoOrcamento) {
        return Number(b.dentroDoOrcamento) - Number(a.dentroDoOrcamento);
      }
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      return Number(a.precoBase) - Number(b.precoBase); // empate → mais barato primeiro
    })
    .slice(0, limite);
}
