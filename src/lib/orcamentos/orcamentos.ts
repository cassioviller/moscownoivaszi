// src/lib/orcamentos/orcamentos.ts
// Orçamentos — a negociação com a noiva registrada (itens, desconto, status). O
// aprovado é a base de valores do contrato (S3). Tudo escopado por loja via
// tenantPrisma. Dinheiro: Decimal(10,2) no banco, string na borda; a aritmética roda
// em CENTAVOS inteiros (sem float). Decisão: docs/.../2026-06-03-s2-orcamentos-design.md.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { paraCentavos, deCentavos, decParaCentavos } from "@/lib/dinheiro";
import type { OrcamentoStatus, OrcamentoItemTipo, DescontoTipo, Prisma } from "@/generated/prisma/client";

const EDITAVEIS: OrcamentoStatus[] = ["RASCUNHO", "ENVIADO"];
const TIPOS_ITEM = new Set<OrcamentoItemTipo>(["VESTIDO", "SERVICO", "AJUSTE"]);

export type Totais = { subtotal: string; desconto: string; total: string };

export function calcularTotais(
  itens: { valorUnitario: Prisma.Decimal | string; quantidade: number }[],
  descontoTipo: DescontoTipo | null,
  descontoValor: Prisma.Decimal | string | null,
): Totais {
  const subtotalC = itens.reduce((s, it) => s + decParaCentavos(it.valorUnitario) * it.quantidade, 0);
  let descontoC = 0;
  if (descontoTipo === "PERCENTUAL" && descontoValor != null) {
    descontoC = Math.round((subtotalC * Number(descontoValor)) / 100);
  } else if (descontoTipo === "VALOR" && descontoValor != null) {
    descontoC = decParaCentavos(descontoValor);
  }
  descontoC = Math.max(0, Math.min(descontoC, subtotalC)); // nunca passa do subtotal nem fica negativo
  return {
    subtotal: deCentavos(subtotalC),
    desconto: deCentavos(descontoC),
    total: deCentavos(subtotalC - descontoC),
  };
}

// — Criar / validar —

export type ResultadoCriar =
  | { ok: true; orcamentoId: string }
  | { ok: false; motivo: "lead_invalido" | "atendimento_invalido" | "vendedora_invalida" };

export async function criarOrcamento(
  lojaId: string,
  input: { leadId: string; atendimentoId?: string | null; vendedoraId: string },
): Promise<ResultadoCriar> {
  const db = tenantPrisma(prisma, lojaId);
  const { leadId, atendimentoId, vendedoraId } = input;

  const [lead, atend, vinc] = await Promise.all([
    db.lead.findUnique({ where: { id: leadId }, select: { id: true } }),
    atendimentoId
      ? db.atendimento.findUnique({ where: { id: atendimentoId }, select: { id: true } })
      : Promise.resolve(true as const),
    prisma.usuarioLoja.findUnique({
      where: { usuarioId_lojaId: { usuarioId: vendedoraId, lojaId } },
      select: { usuarioId: true },
    }),
  ]);
  if (!lead) return { ok: false, motivo: "lead_invalido" };
  if (atendimentoId && !atend) return { ok: false, motivo: "atendimento_invalido" };
  if (!vinc) return { ok: false, motivo: "vendedora_invalida" };

  const criado = await db.orcamento.create({
    // tenantPrisma carimba lojaId; cast pela mesma razão de reservarVestido/criarVestido.
    data: { leadId, atendimentoId: atendimentoId ?? null, vendedoraId } as never,
  });
  return { ok: true, orcamentoId: criado.id };
}

// — Itens —

export type ResultadoItem =
  | { ok: true; itemId: string }
  | { ok: false; motivo: "orcamento_invalido" | "nao_editavel" | "tipo_invalido" | "valor_invalido" | "sem_descricao" | "vestido_invalido" };

export async function adicionarItem(
  lojaId: string,
  orcamentoId: string,
  input: { tipo: OrcamentoItemTipo; vestidoId?: string | null; descricao: string; valorUnitario: string; quantidade?: number },
): Promise<ResultadoItem> {
  const db = tenantPrisma(prisma, lojaId);
  const orc = await db.orcamento.findUnique({ where: { id: orcamentoId }, select: { status: true } });
  if (!orc) return { ok: false, motivo: "orcamento_invalido" };
  if (!EDITAVEIS.includes(orc.status)) return { ok: false, motivo: "nao_editavel" };
  if (!TIPOS_ITEM.has(input.tipo)) return { ok: false, motivo: "tipo_invalido" };

  const descricao = input.descricao.trim();
  if (!descricao) return { ok: false, motivo: "sem_descricao" };

  let centavos: number;
  try {
    centavos = paraCentavos(input.valorUnitario);
  } catch {
    return { ok: false, motivo: "valor_invalido" };
  }
  const quantidade = Math.trunc(input.quantidade ?? 1);
  if (!Number.isInteger(quantidade) || quantidade < 1) return { ok: false, motivo: "valor_invalido" };

  if (input.vestidoId) {
    const v = await db.vestido.findUnique({ where: { id: input.vestidoId }, select: { id: true } });
    if (!v) return { ok: false, motivo: "vestido_invalido" };
  }

  const criado = await db.orcamentoItem.create({
    data: {
      orcamentoId,
      tipo: input.tipo,
      vestidoId: input.vestidoId ?? null,
      descricao,
      valorUnitario: deCentavos(centavos),
      quantidade,
    } as never,
  });
  return { ok: true, itemId: criado.id };
}

export type ResultadoOp =
  | { ok: true }
  | { ok: false; motivo: "item_invalido" | "orcamento_invalido" | "nao_editavel" | "valor_invalido" | "desconto_invalido" | "transicao_invalida" | "orcamento_vazio" };

// Status do orçamento dono de um item (p/ checar editabilidade). null se não for da loja.
async function statusDoOrcamentoDoItem(db: ReturnType<typeof tenantPrisma>, itemId: string) {
  const item = await db.orcamentoItem.findUnique({
    where: { id: itemId },
    select: { orcamento: { select: { status: true } } },
  });
  return item?.orcamento.status ?? null;
}

export async function editarItem(
  lojaId: string,
  itemId: string,
  patch: { descricao?: string; valorUnitario?: string; quantidade?: number },
): Promise<ResultadoOp> {
  const db = tenantPrisma(prisma, lojaId);
  const status = await statusDoOrcamentoDoItem(db, itemId);
  if (!status) return { ok: false, motivo: "item_invalido" };
  if (!EDITAVEIS.includes(status)) return { ok: false, motivo: "nao_editavel" };

  const data: Record<string, unknown> = {};
  if (patch.descricao !== undefined) {
    const d = patch.descricao.trim();
    if (!d) return { ok: false, motivo: "valor_invalido" };
    data.descricao = d;
  }
  if (patch.valorUnitario !== undefined) {
    try {
      data.valorUnitario = deCentavos(paraCentavos(patch.valorUnitario));
    } catch {
      return { ok: false, motivo: "valor_invalido" };
    }
  }
  if (patch.quantidade !== undefined) {
    const q = Math.trunc(patch.quantidade);
    if (!Number.isInteger(q) || q < 1) return { ok: false, motivo: "valor_invalido" };
    data.quantidade = q;
  }
  await db.orcamentoItem.updateMany({ where: { id: itemId }, data });
  return { ok: true };
}

export async function removerItem(lojaId: string, itemId: string): Promise<ResultadoOp> {
  const db = tenantPrisma(prisma, lojaId);
  const status = await statusDoOrcamentoDoItem(db, itemId);
  if (!status) return { ok: false, motivo: "item_invalido" };
  if (!EDITAVEIS.includes(status)) return { ok: false, motivo: "nao_editavel" };
  await db.orcamentoItem.deleteMany({ where: { id: itemId } });
  return { ok: true };
}

// — Desconto —

export async function definirDesconto(
  lojaId: string,
  orcamentoId: string,
  desconto: { tipo: DescontoTipo; valor: string } | null,
): Promise<ResultadoOp> {
  const db = tenantPrisma(prisma, lojaId);
  const orc = await db.orcamento.findUnique({ where: { id: orcamentoId }, select: { status: true } });
  if (!orc) return { ok: false, motivo: "orcamento_invalido" };
  if (!EDITAVEIS.includes(orc.status)) return { ok: false, motivo: "nao_editavel" };

  if (desconto === null) {
    await db.orcamento.updateMany({ where: { id: orcamentoId }, data: { descontoTipo: null, descontoValor: null } });
    return { ok: true };
  }
  if (desconto.tipo !== "PERCENTUAL" && desconto.tipo !== "VALOR") return { ok: false, motivo: "desconto_invalido" };
  let centavos: number;
  try {
    centavos = paraCentavos(desconto.valor);
  } catch {
    return { ok: false, motivo: "desconto_invalido" };
  }
  // Percentual: 0–100 (guardado como Decimal, ex.: "10.00" = 10%).
  if (desconto.tipo === "PERCENTUAL" && centavos > 100_00) return { ok: false, motivo: "desconto_invalido" };
  await db.orcamento.updateMany({
    where: { id: orcamentoId },
    data: { descontoTipo: desconto.tipo, descontoValor: deCentavos(centavos) },
  });
  return { ok: true };
}

// — Status (ciclo de vida) —

// Transições válidas. APROVADO e RECUSADO são terminais.
const TRANSICOES: Record<OrcamentoStatus, OrcamentoStatus[]> = {
  RASCUNHO: ["ENVIADO", "APROVADO", "RECUSADO"],
  ENVIADO: ["RASCUNHO", "APROVADO", "RECUSADO"],
  APROVADO: [],
  RECUSADO: [],
};

export async function mudarStatus(
  lojaId: string,
  orcamentoId: string,
  novo: OrcamentoStatus,
): Promise<ResultadoOp> {
  const db = tenantPrisma(prisma, lojaId);
  const orc = await db.orcamento.findUnique({
    where: { id: orcamentoId },
    select: { status: true, _count: { select: { itens: true } } },
  });
  if (!orc) return { ok: false, motivo: "orcamento_invalido" };
  if (!TRANSICOES[orc.status].includes(novo)) return { ok: false, motivo: "transicao_invalida" };
  if (novo === "APROVADO" && orc._count.itens === 0) return { ok: false, motivo: "orcamento_vazio" };

  await db.orcamento.updateMany({
    where: { id: orcamentoId },
    data: { status: novo, aprovadoEm: novo === "APROVADO" ? new Date() : null },
  });
  return { ok: true };
}

// — Leitura —

export type OrcamentoResumo = {
  id: string;
  status: OrcamentoStatus;
  createdAt: Date;
  leadId: string;
  noivaNome: string | null;
  total: string;
  qtdItens: number;
};

function resumo(o: {
  id: string;
  status: OrcamentoStatus;
  createdAt: Date;
  leadId: string;
  lead: { noivaNome: string | null } | null;
  descontoTipo: DescontoTipo | null;
  descontoValor: Prisma.Decimal | null;
  itens: { valorUnitario: Prisma.Decimal; quantidade: number }[];
}): OrcamentoResumo {
  return {
    id: o.id,
    status: o.status,
    createdAt: o.createdAt,
    leadId: o.leadId,
    noivaNome: o.lead?.noivaNome ?? null,
    total: calcularTotais(o.itens, o.descontoTipo, o.descontoValor).total,
    qtdItens: o.itens.length,
  };
}

const INCLUDE_RESUMO = {
  lead: { select: { noivaNome: true } },
  itens: { select: { valorUnitario: true, quantidade: true } },
} as const;

export async function listarOrcamentosDaLoja(
  lojaId: string,
  opts: { status?: OrcamentoStatus } = {},
): Promise<OrcamentoResumo[]> {
  const rows = await tenantPrisma(prisma, lojaId).orcamento.findMany({
    where: opts.status ? { status: opts.status } : {},
    orderBy: { createdAt: "desc" },
    include: INCLUDE_RESUMO,
  });
  return rows.map(resumo);
}

export async function listarOrcamentosDaNoiva(lojaId: string, leadId: string): Promise<OrcamentoResumo[]> {
  const rows = await tenantPrisma(prisma, lojaId).orcamento.findMany({
    where: { leadId },
    orderBy: { createdAt: "desc" },
    include: INCLUDE_RESUMO,
  });
  return rows.map(resumo);
}

// Vestido escolhido em algum atendimento da noiva (item tipo VESTIDO). Peça de
// acervo para mostrar no perfil — sem valor, só identidade + capa. Deduplicado:
// o mesmo vestido pode aparecer em mais de um atendimento, mas é um card só.
export type VestidoPreEscolhido = {
  id: string;
  codigo: string;
  nome: string;
  categoria: string | null;
  status: string;
  temFoto: boolean;
  versaoFoto: number; // updatedAt da foto 0 — cache-busting na URL (igual ao destaque)
};

export async function listarVestidosPreEscolhidosDaNoiva(
  lojaId: string,
  leadId: string,
): Promise<VestidoPreEscolhido[]> {
  const itens = await tenantPrisma(prisma, lojaId).orcamentoItem.findMany({
    where: { tipo: "VESTIDO", vestidoId: { not: null }, orcamento: { leadId } },
    orderBy: { createdAt: "asc" },
    select: {
      vestido: {
        select: {
          id: true,
          codigo: true,
          nome: true,
          categoria: true,
          status: true,
          fotos: { where: { ordem: 0 }, select: { updatedAt: true } },
        },
      },
    },
  });

  const vistos = new Set<string>();
  const out: VestidoPreEscolhido[] = [];
  for (const { vestido: v } of itens) {
    if (!v || vistos.has(v.id)) continue;
    vistos.add(v.id);
    out.push({
      id: v.id,
      codigo: v.codigo,
      nome: v.nome,
      categoria: v.categoria,
      status: v.status,
      temFoto: v.fotos.length > 0,
      versaoFoto: v.fotos[0]?.updatedAt.getTime() ?? 0,
    });
  }
  return out;
}

export type OrcamentoItemView = {
  id: string;
  tipo: OrcamentoItemTipo;
  vestidoId: string | null;
  descricao: string;
  valorPadrao: string | null; // preço de tabela do vestido (referência); null se não for vestido
  valorUnitario: string; // o valor combinado com a noiva
  quantidade: number;
  subtotal: string;
};
export type OrcamentoDetalhe = {
  id: string;
  status: OrcamentoStatus;
  leadId: string;
  noivaNome: string | null;
  vendedoraNome: string;
  atendimentoId: string | null;
  validade: Date | null;
  observacoes: string | null;
  aprovadoEm: Date | null;
  descontoTipo: DescontoTipo | null;
  descontoValor: string | null;
  itens: OrcamentoItemView[];
  totais: Totais;
  editavel: boolean;
  contratoId: string | null; // se o orçamento já virou contrato (S3)
};

export async function obterOrcamento(lojaId: string, orcamentoId: string): Promise<OrcamentoDetalhe | null> {
  const o = await tenantPrisma(prisma, lojaId).orcamento.findUnique({
    where: { id: orcamentoId },
    include: {
      lead: { select: { noivaNome: true } },
      vendedora: { select: { nome: true } },
      itens: { orderBy: { createdAt: "asc" }, include: { vestido: { select: { precoBase: true } } } },
      contrato: { select: { id: true } },
    },
  });
  if (!o) return null;
  return {
    id: o.id,
    status: o.status,
    leadId: o.leadId,
    noivaNome: o.lead?.noivaNome ?? null,
    vendedoraNome: o.vendedora.nome,
    atendimentoId: o.atendimentoId,
    validade: o.validade,
    observacoes: o.observacoes,
    aprovadoEm: o.aprovadoEm,
    descontoTipo: o.descontoTipo,
    descontoValor: o.descontoValor != null ? Number(o.descontoValor).toFixed(2) : null,
    itens: o.itens.map((it) => ({
      id: it.id,
      tipo: it.tipo,
      vestidoId: it.vestidoId,
      descricao: it.descricao,
      valorPadrao: it.vestido?.precoBase != null ? Number(it.vestido.precoBase).toFixed(2) : null,
      valorUnitario: Number(it.valorUnitario).toFixed(2),
      quantidade: it.quantidade,
      subtotal: deCentavos(decParaCentavos(it.valorUnitario) * it.quantidade),
    })),
    totais: calcularTotais(o.itens, o.descontoTipo, o.descontoValor),
    editavel: EDITAVEIS.includes(o.status),
    contratoId: o.contrato?.id ?? null,
  };
}
