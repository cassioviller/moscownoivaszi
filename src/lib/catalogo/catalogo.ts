// src/lib/catalogo/catalogo.ts
//
// Catálogo de atributos COMPARTILHADO entre VESTIDO e INTERESSE — a base da
// indicação de vestido por interesse. Como os dois lados escolhem das mesmas
// opções (Atributo/AtributoOpcao), casar noiva × vestido vira só contar os pares
// (atributo, opção) em comum.
//
// SEGURANÇA (ver tenant.ts): Atributo é tenant model (tem lojaId) → lido via
// tenantPrisma. As opções (AtributoOpcao, sem lojaId) só sobem por `include` do
// pai escopado — nunca acesso direto.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import type { AtributoTipo } from "@/generated/prisma/client";

export type CatalogoOpcao = { id: string; valor: string };
export type CatalogoAtributo = {
  id: string;
  nome: string;
  tipo: AtributoTipo;
  opcoes: CatalogoOpcao[];
};

/** Seleção validada de uma opção para um atributo, pronta pra gravar no join. */
export type Selecao = { atributoId: string; opcaoId: string };

/** Catálogo ativo da loja (atributos + opções ativas), ordenado por `ordem`. */
export async function listarCatalogo(lojaId: string): Promise<CatalogoAtributo[]> {
  const attrs = await tenantPrisma(prisma, lojaId).atributo.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
    include: {
      opcoes: {
        where: { ativo: true },
        orderBy: { ordem: "asc" },
        select: { id: true, valor: true },
      },
    },
  });
  return attrs.map((a) => ({ id: a.id, nome: a.nome, tipo: a.tipo, opcoes: a.opcoes }));
}

/** Lê do FormData os campos `attr-<id>` declarados no catálogo. */
export function escolhasDoForm(
  catalogo: CatalogoAtributo[],
  formData: FormData,
): Record<string, string> {
  const escolhas: Record<string, string> = {};
  for (const attr of catalogo) {
    escolhas[attr.id] = String(formData.get(`attr-${attr.id}`) ?? "");
  }
  return escolhas;
}

/**
 * Valida um mapa atributoId→opcaoId (vindo do form) contra o catálogo.
 * Ignora vazios. Lança se um opcaoId não pertencer ao atributo — barra form
 * forjado e garante integridade do join (falha fechada).
 */
export function validarSelecoes(
  catalogo: CatalogoAtributo[],
  escolhas: Record<string, string>,
): Selecao[] {
  const out: Selecao[] = [];
  for (const attr of catalogo) {
    const opcaoId = (escolhas[attr.id] ?? "").trim();
    if (!opcaoId) continue;
    if (!attr.opcoes.some((o) => o.id === opcaoId)) {
      throw new Error(`Opção inválida para "${attr.nome}"`);
    }
    out.push({ atributoId: attr.id, opcaoId });
  }
  return out;
}

// ─────────────────────────── CRUD do catálogo (admin) ───────────────────────
// Gestão por loja, gateada pelo módulo "config". Atributo é tenant model (via
// tenantPrisma); as opções (AtributoOpcao) são tocadas SÓ por escrita aninhada
// no pai escopado. Não há DELETE de opção — opções em uso são referenciadas por
// VestidoAtributo/LeadInteresseAtributo (FK), então em vez de apagar, desativa-se.

export type OpcaoAdmin = { id: string; valor: string; ativo: boolean; ordem: number };
export type AtributoAdmin = {
  id: string;
  nome: string;
  tipo: AtributoTipo;
  ativo: boolean;
  opcoes: OpcaoAdmin[];
};

const TIPOS_VALIDOS = new Set<AtributoTipo>(["OPCAO_UNICA", "ESCALA"]);

function parseLinhas(raw: string | undefined): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const linha of (raw ?? "").split("\n")) {
    const v = linha.trim();
    if (!v) continue;
    const chave = v.toLocaleLowerCase("pt-BR");
    if (vistos.has(chave)) continue; // dedup case-insensitive
    vistos.add(chave);
    out.push(v);
  }
  return out;
}

function exigirTipo(raw: string): AtributoTipo {
  if (!TIPOS_VALIDOS.has(raw as AtributoTipo)) throw new Error("Tipo de atributo inválido");
  return raw as AtributoTipo;
}

/** Lista TODOS os atributos da loja (inclui inativos) — visão de gestão. */
export async function listarAtributosAdmin(lojaId: string): Promise<AtributoAdmin[]> {
  return tenantPrisma(prisma, lojaId).atributo.findMany({
    orderBy: { ordem: "asc" },
    include: {
      opcoes: {
        orderBy: { ordem: "asc" },
        select: { id: true, valor: true, ativo: true, ordem: true },
      },
    },
  });
}

/** Um atributo da loja (com opções) ou null se não for da loja. */
export async function obterAtributo(lojaId: string, atributoId: string): Promise<AtributoAdmin | null> {
  return tenantPrisma(prisma, lojaId).atributo.findUnique({
    where: { id: atributoId },
    include: {
      opcoes: {
        orderBy: { ordem: "asc" },
        select: { id: true, valor: true, ativo: true, ordem: true },
      },
    },
  });
}

export type NovoAtributo = { nome: string; tipo: string; opcoes: string };

// Nome único por loja (case-insensitive): a indicação e o backfill casam por
// nome, então duplicatas tornariam o vocabulário ambíguo. `exceto` ignora o
// próprio atributo na edição.
async function exigirNomeLivre(lojaId: string, nome: string, exceto?: string): Promise<void> {
  const existentes = await tenantPrisma(prisma, lojaId).atributo.findMany({ select: { id: true, nome: true } });
  const alvo = nome.toLocaleLowerCase("pt-BR");
  if (existentes.some((a) => a.id !== exceto && a.nome.toLocaleLowerCase("pt-BR") === alvo)) {
    throw new Error("Já existe um atributo com esse nome");
  }
}

export async function criarAtributo(lojaId: string, input: NovoAtributo): Promise<void> {
  const nome = input.nome.trim();
  if (!nome) throw new Error("Nome do atributo é obrigatório");
  const tipo = exigirTipo(input.tipo);
  const opcoes = parseLinhas(input.opcoes);
  if (opcoes.length === 0) throw new Error("Adicione ao menos uma opção");
  await exigirNomeLivre(lojaId, nome);

  const tp = tenantPrisma(prisma, lojaId);
  const max = await tp.atributo.aggregate({ _max: { ordem: true } });
  const ordem = (max._max.ordem ?? -1) + 1;

  await tp.atributo.create({
    data: {
      nome,
      tipo,
      ordem,
      opcoes: { create: opcoes.map((valor, i) => ({ valor, ordem: i })) },
    } as never,
  });
}

export type EdicaoAtributo = {
  nome: string;
  tipo: string;
  ativo: boolean;
  opcoesExistentes: { id: string; valor: string; ativo: boolean }[];
  novasOpcoes: string;
};

export async function editarAtributo(
  lojaId: string,
  atributoId: string,
  input: EdicaoAtributo,
): Promise<void> {
  const nome = input.nome.trim();
  if (!nome) throw new Error("Nome do atributo é obrigatório");
  const tipo = exigirTipo(input.tipo);
  for (const o of input.opcoesExistentes) {
    if (!o.valor.trim()) throw new Error("As opções não podem ficar em branco");
  }
  await exigirNomeLivre(lojaId, nome, atributoId);

  const tp = tenantPrisma(prisma, lojaId);
  const atual = await tp.atributo.findUnique({
    where: { id: atributoId },
    include: { opcoes: { select: { ordem: true } } },
  });
  if (!atual) throw new Error("Atributo não encontrado");
  const novas = parseLinhas(input.novasOpcoes);
  const ordemBase = Math.max(-1, ...atual.opcoes.map((o) => o.ordem)) + 1;

  await tp.atributo.update({
    where: { id: atributoId },
    data: {
      nome,
      tipo,
      ativo: input.ativo,
      opcoes: {
        // Renomeia/(des)ativa as existentes; cria as novas. Nunca apaga (FK).
        update: input.opcoesExistentes.map((o) => ({
          where: { id: o.id },
          data: { valor: o.valor.trim(), ativo: o.ativo },
        })),
        create: novas.map((valor, i) => ({ valor, ordem: ordemBase + i })),
      },
    },
  });
}
