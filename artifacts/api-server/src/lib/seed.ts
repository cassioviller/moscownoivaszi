import { db, usuariosTable, lojasTable, perfisTable, usuariosLojasTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Cria os dados iniciais (loja + perfis + admin) se o banco estiver vazio.
 * Roda uma única vez na subida do servidor — idempotente via ON CONFLICT DO NOTHING.
 */
export async function seedInicial(): Promise<void> {
  const existentes = await db.select().from(usuariosTable).limit(1);
  if (existentes.length > 0) return; // já tem dados, não faz nada

  logger.info("Banco vazio — aplicando seed inicial...");

  // 1. Loja
  await db.insert(lojasTable).values({
    id: "84e539bd-9199-4551-8ae5-7619868f62d3",
    nome: "Moscow Noivas SP",
    cnpj: "12.345.678/0001-99",
    endereco: "Rua das Noivas, 123, São Paulo - SP",
    telefone: "(11) 99999-9999",
    ativo: true,
  }).onConflictDoNothing();

  // 2. Perfis de sistema
  await db.insert(perfisTable).values([
    {
      id: "perfil-vendedora",
      nome: "Vendedora",
      acessosModulos: { admin: false, leads: true, agenda: true, comissao: false, vestidos: true, financeiro: false },
      sistema: false,
    },
    {
      id: "perfil-admin",
      nome: "Admin",
      acessosModulos: { admin: true, leads: true, agenda: true, comissao: true, vestidos: true, financeiro: true },
      sistema: true,
    },
  ]).onConflictDoNothing();

  // 3. Usuário super admin
  // Senha: admin123 (hash bcrypt gerado no dev)
  await db.insert(usuariosTable).values({
    id: "66df29bc-77a2-438a-9825-a7e11233896a",
    nome: "Super Admin",
    email: "admin@moscownoivas.com",
    senhaHash: "$2b$12$b8tSTFDJuZ5kuDfxzue.1.4UKUrrOdUDuLYM6yOperp4F2zpc0Tm6",
    ativo: true,
    isSuperAdmin: true,
    precisaTrocarSenha: false,
  }).onConflictDoNothing();

  // 4. Vínculo admin ↔ loja
  await db.insert(usuariosLojasTable).values({
    usuarioId: "66df29bc-77a2-438a-9825-a7e11233896a",
    lojaId: "84e539bd-9199-4551-8ae5-7619868f62d3",
    perfilId: "perfil-admin",
  }).onConflictDoNothing();

  logger.info("Seed inicial concluído — admin@moscownoivas.com / admin123");
}
