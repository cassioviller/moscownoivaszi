// src/lib/vestidos/vestidos.ts
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import type { Vestido } from "@/generated/prisma/client";
import type { Selecao } from "@/lib/catalogo/catalogo";

export type NovoVestido = {
  codigo: string;
  nome: string;
  precoBase: string; // chega como string do form; normalizado aqui
  tamanho?: string;
  cor?: string;
  categoria?: string;
  observacoes?: string;
  // Características do vestido vindas do catálogo (mesmo vocabulário do interesse).
  // Ausente nos testes/callers legados → não toca VestidoAtributo.
  atributos?: Selecao[];
};

// Vestido + suas seleções de catálogo (pra prefill da edição e p/ indicação).
export type VestidoComAtributos = Vestido & {
  atributos: { atributoId: string; opcaoId: string }[];
};

function vazioNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

// pt-BR: vírgula = decimal, ponto = milhar. "2.400,00" → 2400 ; "150,50" → 150.5 ; "100" → 100.
function parsePreco(raw: string): number {
  const limpo = raw.trim().replace(/\s/g, "");
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(normalizado);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Informe um preço válido");
  return n;
}

function validar(input: NovoVestido): { codigo: string; nome: string; preco: number } {
  const codigo = input.codigo.trim();
  const nome = input.nome.trim();
  if (!codigo) throw new Error("Código é obrigatório");
  if (!nome) throw new Error("Nome é obrigatório");
  return { codigo, nome, preco: parsePreco(input.precoBase) };
}

function traduzirErro(e: unknown): never {
  if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
    throw new Error("Já existe um vestido com esse código");
  }
  throw e;
}

function dados(input: NovoVestido, codigo: string, nome: string, preco: number) {
  return {
    codigo,
    nome,
    precoBase: preco.toFixed(2),
    tamanho: vazioNull(input.tamanho),
    cor: vazioNull(input.cor),
    categoria: vazioNull(input.categoria),
    observacoes: vazioNull(input.observacoes),
  };
}

export async function listarVestidos(lojaId: string): Promise<Vestido[]> {
  return tenantPrisma(prisma, lojaId).vestido.findMany({ orderBy: { nome: "asc" } });
}

// Vestido como peça de acervo: identidade + capa (foto ordem 0) para a grade.
// `versaoFoto` = updatedAt da foto 0 p/ cache-busting na URL (mesmo padrão do
// destaque e dos pré-escolhidos da noiva — orcamentos.ts).
export type VestidoAcervo = {
  id: string;
  codigo: string;
  nome: string;
  categoria: string | null;
  status: string;
  precoBase: string; // "1234.56"
  temFoto: boolean;
  versaoFoto: number;
};

export async function listarAcervo(lojaId: string): Promise<VestidoAcervo[]> {
  const vs = await tenantPrisma(prisma, lojaId).vestido.findMany({
    orderBy: { nome: "asc" },
    select: {
      id: true,
      codigo: true,
      nome: true,
      categoria: true,
      status: true,
      precoBase: true,
      fotos: { where: { ordem: 0 }, select: { updatedAt: true } },
    },
  });
  return vs.map((v) => ({
    id: v.id,
    codigo: v.codigo,
    nome: v.nome,
    categoria: v.categoria,
    status: v.status,
    precoBase: Number(v.precoBase).toFixed(2),
    temFoto: v.fotos.length > 0,
    versaoFoto: v.fotos[0]?.updatedAt.getTime() ?? 0,
  }));
}

export async function obterVestido(
  lojaId: string,
  vestidoId: string,
): Promise<VestidoComAtributos | null> {
  return tenantPrisma(prisma, lojaId).vestido.findUnique({
    where: { id: vestidoId },
    include: { atributos: { select: { atributoId: true, opcaoId: true } } },
  });
}

// Escrita aninhada de VestidoAtributo: a tabela-filha NÃO tem lojaId, então só a
// tocamos pelo pai escopado (regra do tenant.ts). `create` na criação; na edição
// `deleteMany` + `create` substitui o conjunto inteiro (1 opção por atributo).
function nestedAtributos(input: NovoVestido, modo: "create" | "replace") {
  if (!input.atributos) return {};
  const create = input.atributos.map((s) => ({ atributoId: s.atributoId, opcaoId: s.opcaoId }));
  return modo === "create"
    ? { atributos: { create } }
    : { atributos: { deleteMany: {}, create } };
}

export async function criarVestido(lojaId: string, input: NovoVestido): Promise<Vestido> {
  const { codigo, nome, preco } = validar(input);
  try {
    // O guard tenantPrisma carimba lojaId em runtime; o tipo do create exige lojaId,
    // por isso o cast (mesmo motivo do `as any` em tenant.test.ts).
    return await tenantPrisma(prisma, lojaId).vestido.create({
      data: { ...dados(input, codigo, nome, preco), ...nestedAtributos(input, "create") } as never,
    });
  } catch (e) {
    traduzirErro(e);
  }
}

export async function editarVestido(lojaId: string, vestidoId: string, input: NovoVestido): Promise<Vestido> {
  const { codigo, nome, preco } = validar(input);
  try {
    return await tenantPrisma(prisma, lojaId).vestido.update({
      where: { id: vestidoId },
      data: { ...dados(input, codigo, nome, preco), ...nestedAtributos(input, "replace") },
    });
  } catch (e) {
    traduzirErro(e);
  }
}
