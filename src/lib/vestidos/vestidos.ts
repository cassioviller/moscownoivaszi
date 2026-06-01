// src/lib/vestidos/vestidos.ts
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import type { Vestido } from "@/generated/prisma/client";

export type NovoVestido = {
  codigo: string;
  nome: string;
  precoBase: string; // chega como string do form; normalizado aqui
  tamanho?: string;
  cor?: string;
  categoria?: string;
  observacoes?: string;
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

export async function obterVestido(lojaId: string, vestidoId: string): Promise<Vestido | null> {
  return tenantPrisma(prisma, lojaId).vestido.findUnique({ where: { id: vestidoId } });
}

export async function criarVestido(lojaId: string, input: NovoVestido): Promise<Vestido> {
  const { codigo, nome, preco } = validar(input);
  try {
    // O guard tenantPrisma carimba lojaId em runtime; o tipo do create exige lojaId,
    // por isso o cast (mesmo motivo do `as any` em tenant.test.ts).
    return await tenantPrisma(prisma, lojaId).vestido.create({
      data: dados(input, codigo, nome, preco) as never,
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
      data: dados(input, codigo, nome, preco),
    });
  } catch (e) {
    traduzirErro(e);
  }
}
