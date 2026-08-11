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
  bloqueioVestidosTable,
  contratoBloqueiosTable,
  ajustesTable,
  atendimentosTable,
  type Orcamento,
} from "@workspace/db";
import { eq, and, asc, desc, inArray, isNull } from "drizzle-orm";
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
      // O7/C5 (E166): a página lê o SNAPSHOT — observações e validade eram as
      // duas únicas coisas da tela dela vindas da linha viva, impressas logo
      // acima do comprovante. Nulo = versão anterior às colunas: cai na linha,
      // como sempre foi.
      validade: versao.validade ?? orcamento.validade,
      observacoes: versao.observacoes ?? orcamento.observacoes,
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

/**
 * E100/F39 — "O seu vestido": a fase que o portal não cobria.
 *
 * Ele respondia a fase comercial (proposta, contrato, parcelas) e parava. As
 * duas fases mais ansiosas da noiva — os ajustes e a retirada — eram perguntas
 * repetidas no WhatsApp cujas respostas o sistema já tinha.
 *
 * **Correção ao diagnóstico.** O F39 aponta `ajuste.proximaProva` como fonte da
 * "próxima prova depois dessa". Essa coluna NÃO existe: `ajustes` tem id,
 * lojaId, atendimentoId, descricao, status e os carimbos, e nada mais. A
 * pergunta, porém, já estava respondida — a seção "Suas próximas provas" lista
 * as futuras desde o E78. O que faltava mesmo era a retirada e o andamento dos
 * ajustes, e é só isso que esta função monta.
 *
 * O que fica FORA, e é decisão: o `ajuste_checklist_itens`. O checklist é a
 * conversa da loja com a costureira ("soltar bainha 3cm", "refazer alça") e é
 * escrito nesse registro; a noiva quer saber se ficou pronto, não como. O épico
 * escreve isso em letras maiúsculas e ele tem razão.
 */
export type VestidoDaNoiva = {
  vestidoId: string;
  nome: string;
  fotos: { ordem: number; atualizadaEm: Date }[];
  retiradaPrevista: Date | null;
  retiradaFeitaEm: Date | null;
  ajustes: { descricao: string; pronto: boolean }[];
};

export async function montarVestidoDaNoiva(contrato: {
  id: string;
  lojaId: string;
  leadId: string;
  bloqueioVestidoId: string | null;
  dataRetirada: Date | null;
}): Promise<VestidoDaNoiva | null> {
  /**
   * O vínculo vivo é o N:N `contrato_bloqueios` (E72) — a coluna singular
   * `contratos.bloqueio_vestido_id` é legado "lido, nunca mais escrito", e a
   * decisão estava escrita no schema.
   *
   * Decidir só por ela deixava esta seção MORTA em produção: o único caminho
   * de criação de contrato do app manda `bloqueioVestidoIds` (a tela do
   * orçamento) e o servidor grava `bloqueioVestidoId: … ?? null`, então a
   * coluna nasce nula sempre e a função devolvia `null` na primeira linha. A
   * noiva nunca via "O seu vestido" — foto, retirada prevista, andamento dos
   * ajustes —, e o teste só passava porque preenchia a coluna com um `update`
   * à mão, sem passar pela rota.
   */
  const vinculos = await db
    .select({ bloqueioId: contratoBloqueiosTable.bloqueioId })
    .from(contratoBloqueiosTable)
    .where(eq(contratoBloqueiosTable.contratoId, contrato.id));
  const bloqueioIds = [
    ...new Set([
      ...(contrato.bloqueioVestidoId ? [contrato.bloqueioVestidoId] : []),
      ...vinculos.map((v) => v.bloqueioId),
    ]),
  ];
  // Sem reserva física no contrato não há "o seu vestido" — o contrato pode ser
  // só de serviço, e inventar uma seção vazia é pior que não a ter.
  if (bloqueioIds.length === 0) return null;

  // Bloqueio cancelado fica de fora no WHERE: a reserva foi desfeita e o
  // contrato ainda aponta para ela (`set null` só dispara quando a LINHA some).
  // Mostrar seria prometer um vestido que a loja já liberou para outra noiva.
  // Com mais de uma peça presa (vestido + véu), a seção mostra a mais antiga —
  // a primeira reservada é a que a noiva chama de "o meu vestido".
  const [bloqueio] = await db
    .select({
      vestidoId: bloqueioVestidosTable.vestidoId,
      retiradaDataReal: bloqueioVestidosTable.retiradaDataReal,
      nome: vestidosTable.nome,
    })
    .from(bloqueioVestidosTable)
    .innerJoin(vestidosTable, eq(vestidosTable.id, bloqueioVestidosTable.vestidoId))
    .where(and(
      inArray(bloqueioVestidosTable.id, bloqueioIds),
      eq(bloqueioVestidosTable.lojaId, contrato.lojaId),
      isNull(bloqueioVestidosTable.canceladoEm),
    ))
    .orderBy(asc(bloqueioVestidosTable.createdAt))
    .limit(1);
  if (!bloqueio) return null;

  const [fotos, ajustes] = await Promise.all([
    db
      .select({ ordem: vestidoFotosTable.ordem, atualizadaEm: vestidoFotosTable.updatedAt })
      .from(vestidoFotosTable)
      .where(eq(vestidoFotosTable.vestidoId, bloqueio.vestidoId))
      .orderBy(asc(vestidoFotosTable.ordem)),
    // Os ajustes penduram no ATENDIMENTO, não no contrato: o caminho até ela é
    // pelo lead, e o `lojaId` entra junto porque um id nunca anda sozinho aqui.
    db
      .select({ descricao: ajustesTable.descricao, status: ajustesTable.status })
      .from(ajustesTable)
      .innerJoin(atendimentosTable, eq(atendimentosTable.id, ajustesTable.atendimentoId))
      .where(
        and(
          eq(atendimentosTable.leadId, contrato.leadId),
          eq(atendimentosTable.lojaId, contrato.lojaId),
        ),
      )
      .orderBy(asc(ajustesTable.createdAt)),
  ]);

  return {
    vestidoId: bloqueio.vestidoId,
    nome: bloqueio.nome,
    fotos,
    // A data COMBINADA no contrato é a que ela assinou; a real diz que já
    // aconteceu, e aí a promessa vira registro.
    retiradaPrevista: contrato.dataRetirada,
    retiradaFeitaEm: bloqueio.retiradaDataReal,
    ajustes: ajustes.map((a) => ({ descricao: a.descricao, pronto: a.status === "FEITO" })),
  };
}
