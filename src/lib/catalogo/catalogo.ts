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
