import {
  db,
  orcamentoItensTable,
  orcamentoVersoesTable,
  lookbookItensTable,
  vestidosTable,
  vestidoFotosTable,
  vestidoAtributosTable,
  atributosTable,
  atributoOpcoesTable,
  type Orcamento,
} from "@workspace/db";
import { eq, asc, desc, inArray } from "drizzle-orm";
import { brutoEmCentavos, liquidoEmCentavos, reais } from "@workspace/financeiro-core";

/**
 * E78 — as visões que a NOIVA vê, num lugar só. Nasceram nas rotas públicas
 * do orçamento (E13/E75) e do lookbook (E21); viraram funções quando o portal
 * passou a exibir as MESMAS seções — a noiva e a vendedora (e agora o portal
 * e o link antigo) precisam ver o MESMO número.
 */

/**
 * A visão pública do orçamento: a última versão ENVIADA quando existe (E75 —
 * a edição posterior não muda o que está sob os olhos dela); o conteúdo vivo
 * para orçamento anterior ao versionamento.
 */
export async function montarOrcamentoPublico(
  orcamento: Orcamento,
  lojaNome: string,
  noivaNome: string,
) {
  const [versao] = await db
    .select()
    .from(orcamentoVersoesTable)
    .where(eq(orcamentoVersoesTable.orcamentoId, orcamento.id))
    .orderBy(desc(orcamentoVersoesTable.numero))
    .limit(1);

  if (versao) {
    return {
      lojaNome,
      noivaNome,
      status: orcamento.status,
      validade: orcamento.validade,
      observacoes: orcamento.observacoes,
      descontoTipo: versao.descontoTipo,
      descontoValor: versao.descontoValor,
      totalBruto: versao.totalBruto,
      totalLiquido: versao.totalLiquido,
      versaoNumero: versao.numero,
      aceitoEm: orcamento.aceitoEm,
      itens: versao.itens,
    };
  }

  const itens = await db
    .select()
    .from(orcamentoItensTable)
    .where(eq(orcamentoItensTable.orcamentoId, orcamento.id))
    .orderBy(asc(orcamentoItensTable.createdAt));

  // O mesmo cálculo da tela de gestão — a noiva e a vendedora precisam ver o
  // MESMO número. Desde o E95 é literalmente a mesma função (C1/A11): este é o
  // ramo do orçamento SEM versão congelada, anterior ao E75; com versão, os
  // totais saem do snapshot acima e continuam sendo o que ela viu.
  const brutoC = brutoEmCentavos(itens);
  const totalBruto = reais(brutoC);
  const totalLiquido = reais(
    liquidoEmCentavos(brutoC, orcamento.descontoTipo, orcamento.descontoValor),
  );

  return {
    lojaNome,
    noivaNome,
    status: orcamento.status,
    validade: orcamento.validade,
    observacoes: orcamento.observacoes,
    descontoTipo: orcamento.descontoTipo,
    descontoValor: orcamento.descontoValor,
    totalBruto,
    totalLiquido: Math.max(0, totalLiquido),
    versaoNumero: null,
    aceitoEm: orcamento.aceitoEm,
    itens: itens.map((it) => ({
      tipo: it.tipo,
      descricao: it.descricao,
      valorUnitario: it.valorUnitario,
      quantidade: it.quantidade,
    })),
  };
}

export type VestidoLookbookPublico = {
  vestidoId: string;
  nome: string;
  precoBase: number;
  fotos: { ordem: number; atualizadaEm: Date }[];
  atributos: { atributo: string; valor: string }[];
};

/**
 * Os vestidos de um lookbook com fotos (referências, não bytes) e
 * características legíveis (E44), na ordem do lookbook.
 */
export async function montarVestidosLookbook(lookbookId: string): Promise<VestidoLookbookPublico[]> {
  const itens = await db
    .select({
      vestidoId: lookbookItensTable.vestidoId,
      nome: vestidosTable.nome,
      precoBase: vestidosTable.precoBase,
      fotoOrdem: vestidoFotosTable.ordem,
      fotoAtualizadaEm: vestidoFotosTable.updatedAt,
    })
    .from(lookbookItensTable)
    .innerJoin(vestidosTable, eq(vestidosTable.id, lookbookItensTable.vestidoId))
    .leftJoin(vestidoFotosTable, eq(vestidoFotosTable.vestidoId, lookbookItensTable.vestidoId))
    .where(eq(lookbookItensTable.lookbookId, lookbookId))
    .orderBy(asc(lookbookItensTable.ordem), asc(vestidoFotosTable.ordem));

  const porVestido = new Map<string, VestidoLookbookPublico>();
  for (const it of itens) {
    const v = porVestido.get(it.vestidoId) ?? {
      vestidoId: it.vestidoId,
      nome: it.nome,
      precoBase: it.precoBase,
      fotos: [],
      atributos: [],
    };
    if (it.fotoOrdem !== null && it.fotoAtualizadaEm !== null) {
      v.fotos.push({ ordem: it.fotoOrdem, atualizadaEm: it.fotoAtualizadaEm });
    }
    porVestido.set(it.vestidoId, v);
  }

  const vestidoIds = [...porVestido.keys()];
  if (vestidoIds.length > 0) {
    const attrs = await db
      .select({
        vestidoId: vestidoAtributosTable.vestidoId,
        atributo: atributosTable.nome,
        valor: atributoOpcoesTable.valor,
      })
      .from(vestidoAtributosTable)
      .innerJoin(atributosTable, eq(atributosTable.id, vestidoAtributosTable.atributoId))
      .innerJoin(atributoOpcoesTable, eq(atributoOpcoesTable.id, vestidoAtributosTable.opcaoId))
      .where(inArray(vestidoAtributosTable.vestidoId, vestidoIds))
      .orderBy(asc(atributosTable.ordem));
    for (const a of attrs) {
      porVestido.get(a.vestidoId)?.atributos.push({ atributo: a.atributo, valor: a.valor });
    }
  }

  return [...porVestido.values()];
}
