// src/lib/tenant.ts
//
// Guard multitenant da Moscow Noivas.
// tenantPrisma(base, lojaId) devolve um client Prisma onde TODA operação em models
// com lojaId é filtrada/carimbada pela loja — vazamento cross-loja vira impossível
// por construção. "A coisa que constrói a coisa": toda feature futura usa isto e
// ganha isolamento de graça.
//
// Premissa: Prisma 7 — extendedWhereUnique é comportamento padrão, então o `where`
// de findUnique/update/delete/upsert aceita `lojaId` como filtro extra.

import { PrismaClient } from "@/generated/prisma/client";

// Fonte da verdade: models que carregam coluna `lojaId` e cujo escopo de leitura é
// SEMPRE uma loja. Mantenha em sincronia com schema.prisma.
//
// EXCEÇÃO consciente: `UsuarioLoja` também tem `lojaId` mas NÃO entra aqui.
//   É a tabela de controle de acesso. O fluxo "que lojas esse usuário pode ver?"
//   é cross-loja por construção (roda ANTES de existir lojaAtivaId na sessão), e
//   sua PK é composta (`@@id([usuarioId, lojaId])`) — injetar lojaId top-level no
//   where de findUnique colide com o input `usuarioId_lojaId`. UsuarioLoja deve
//   ser sempre lido via `base` direto, com filtro por `usuarioId` na mão.
//
// LIMITAÇÃO conhecida: as 4 tabelas-filha SEM coluna lojaId (`AtributoOpcao`,
//   `VestidoAtributo`, `LeadInteresse`, `LeadInteresseAtributo`) NÃO são escopadas
//   por este guard. Acesso direto a elas é uma rota de vazamento. Regra atual:
//   só leia/escreva via `include` do model-pai que tem lojaId.
export const TENANT_MODELS = [
  "Vestido",
  "Lead",
  "Atributo",
  "BloqueioVestido",
  "RegraDisponibilidade",
  "PerfilOverrideLoja",
] as const;

const TENANT_MODEL_SET = new Set<string>(TENANT_MODELS);

// Operações que aceitam `where` → injetamos lojaId no where.
// findUnique/update/delete/upsert usam where único: com extendedWhereUnique o lojaId
// entra como filtro extra. Se a linha for de OUTRA loja, o where não casa →
// findUnique* retorna null e update/delete/upsert lançam P2025 (falha fechada). ✔
const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

// Operações que escrevem linhas → carimbamos lojaId no `data`.
const CREATE_OPS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "upsert", // upsert: where (acima) + payload de create (aqui)
]);

// Operações cujo `data` NÃO pode reescrever lojaId (re-tenantar uma linha).
const UPDATE_OPS = new Set(["update", "updateMany", "updateManyAndReturn"]);

function stampLojaIntoData<T extends Record<string, unknown>>(
  data: T,
  lojaId: string,
): T {
  // lojaId por ÚLTIMO: se o chamador passar uma loja diferente, sobrescrevemos.
  // Falha fechada — ninguém contrabandeia linha pra outra loja. ✔
  return { ...data, lojaId };
}

export function tenantPrisma(base: PrismaClient, lojaId: string) {
  if (!lojaId) {
    throw new Error("tenantPrisma: lojaId obrigatório (sessão sem loja ativa?).");
  }

  return base.$extends({
    name: "tenant-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODEL_SET.has(model)) {
            return query(args);
          }

          const a = (args ?? {}) as Record<string, any>;

          // 1) Filtro por loja em tudo que tem where.
          if (WHERE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), lojaId };
          }

          // 2) Carimbo de loja em tudo que cria linha.
          if (CREATE_OPS.has(operation)) {
            if (operation === "createMany" || operation === "createManyAndReturn") {
              const data = a.data;
              a.data = Array.isArray(data)
                ? data.map((d: Record<string, unknown>) => stampLojaIntoData(d, lojaId))
                : stampLojaIntoData(data ?? {}, lojaId);
            } else if (operation === "upsert") {
              a.create = stampLojaIntoData(a.create ?? {}, lojaId);
              // a parte `update` do upsert cai na regra (3) abaixo.
            } else {
              // create
              a.data = stampLojaIntoData(a.data ?? {}, lojaId);
            }
          }

          // 3) Impede que um update troque a loja da linha (re-tenant).
          if (UPDATE_OPS.has(operation) && a.data && typeof a.data === "object") {
            delete (a.data as Record<string, unknown>).lojaId;
          }
          if (operation === "upsert" && a.update && typeof a.update === "object") {
            delete (a.update as Record<string, unknown>).lojaId;
          }

          return query(a);
        },
      },
    },
  });
}

export type TenantPrisma = ReturnType<typeof tenantPrisma>;

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ O BURACO QUE ESTE GUARD NÃO TAPA: queries raw.
//
// $queryRaw / $executeRaw / $queryRawUnsafe / $executeRawUnsafe são operações de
// CLIENT, não de model — elas NÃO passam por $allModels/$allOperations e portanto
// NÃO recebem o filtro de lojaId. Se qualquer código rodar SQL cru numa tabela com
// lojaId sem `WHERE loja_id = ...`, vaza, e o guard não percebe.
//
// Mitigação adotada (robusta e independente de versão do Prisma):
//   - REGRA: dados de tenant só são acessados via tenantPrisma(...). Raw em tabela
//     de tenant é proibido. Se precisar de raw, use o `base` explicitamente e
//     escreva o WHERE de loja na mão, com revisão.
//   - O teste em tests/tenant.proveZeroVazamento.test.ts inclui um SCAN estático
//     que falha o CI se um raw aparecer junto de um model de tenant no src/.
//
// (Override de $queryRaw pra lançar via client-extension é possível, mas o
//  comportamento varia entre versões do Prisma — preferimos o canário estático,
//  que é determinístico.)
// ─────────────────────────────────────────────────────────────────────────────
