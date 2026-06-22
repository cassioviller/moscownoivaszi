import { Client } from "pg";
import bcrypt from "bcryptjs";
import { TEST_DATABASE_URL, SENHA, LOJA_A, LOJA_B } from "./constants";

// Mesmo formato de acessosModulos do seed de produção (api-server/src/routes/seed.ts).
const ACESSOS = {
  admin: { leads: { ver: true, criar: true, editar: true }, interesses: { ver: true, criar: true, editar: true }, vestidos: { ver: true, criar: true, editar: true }, ajustes: { ver: true, criar: true, editar: true }, config: { ver: true, criar: true, editar: true }, financeiro: { ver: true, criar: true, editar: true } },
  vendedora: { leads: { ver: true, criar: true, editar: true }, interesses: { ver: true, criar: true, editar: true }, vestidos: { ver: true, criar: false, editar: false }, ajustes: { ver: false, criar: false, editar: false }, config: { ver: false, criar: false, editar: false }, financeiro: { ver: false, criar: false, editar: false } },
  recepcao: { leads: { ver: true, criar: true, editar: false }, interesses: { ver: true, criar: false, editar: false }, vestidos: { ver: true, criar: false, editar: false }, ajustes: { ver: false, criar: false, editar: false }, config: { ver: false, criar: false, editar: false }, financeiro: { ver: false, criar: false, editar: false } },
};

export async function seed(): Promise<void> {
  const hash = await bcrypt.hash(SENHA, 12);
  const db = new Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  try {
    // Perfis
    for (const [id, nome, acessos] of [
      ["perfil-admin", "Admin", ACESSOS.admin],
      ["perfil-vendedora", "Vendedora", ACESSOS.vendedora],
      ["perfil-recepcao", "Recepção", ACESSOS.recepcao],
    ] as const) {
      await db.query(
        `INSERT INTO "Perfil" (id, nome, "acessosModulos", "updatedAt") VALUES ($1, $2, $3, NOW())`,
        [id, nome, JSON.stringify(acessos)],
      );
    }

    // Lojas
    await db.query(
      `INSERT INTO "Loja" (id, nome, ativo, "updatedAt") VALUES ($1, 'Atelier SP', true, NOW()), ($2, 'Atelier RJ', true, NOW())`,
      [LOJA_A, LOJA_B],
    );

    // Usuários (senha única; super sem vínculo de loja)
    const usuarios: Array<[string, string, string, boolean]> = [
      ["e2e-super", "Super E2E", "super@e2e.test", true],
      ["e2e-admin-a", "Admin A", "admin-a@e2e.test", false],
      ["e2e-vend-a", "Vendedora A", "vend-a@e2e.test", false],
      ["e2e-recep-a", "Recepção A", "recep-a@e2e.test", false],
      ["e2e-admin-b", "Admin B", "admin-b@e2e.test", false],
    ];
    for (const [id, nome, email, isSuper] of usuarios) {
      await db.query(
        `INSERT INTO "Usuario" (id, nome, email, "senhaHash", ativo, "isSuperAdmin", "updatedAt")
         VALUES ($1, $2, $3, $4, true, $5, NOW())`,
        [id, nome, email, hash, isSuper],
      );
    }

    // Vínculos usuário-loja-perfil
    const vinculos: Array<[string, string, string]> = [
      ["e2e-admin-a", LOJA_A, "perfil-admin"],
      ["e2e-vend-a", LOJA_A, "perfil-vendedora"],
      ["e2e-recep-a", LOJA_A, "perfil-recepcao"],
      ["e2e-admin-b", LOJA_B, "perfil-admin"],
    ];
    for (const v of vinculos) {
      await db.query(
        `INSERT INTO "UsuarioLoja" ("usuarioId", "lojaId", "perfilId") VALUES ($1, $2, $3)`,
        v,
      );
    }

    // Vestidos (loja-a)
    await db.query(
      `INSERT INTO "Vestido" (id, "lojaId", codigo, nome, "precoBase", status, "updatedAt") VALUES
        ('e2e-vest-1', $1, 'VEST-001', 'Vestido Sereia', 4500, 'ativo', NOW()),
        ('e2e-vest-2', $1, 'VEST-002', 'Vestido Princesa', 6200, 'ativo', NOW())`,
      [LOJA_A],
    );

    // Leads/noivas (loja-a) — "Ana Isolamento" é o marcador do teste de isolamento
    await db.query(
      `INSERT INTO "Lead" (id, "lojaId", "noivaNome", "updatedAt") VALUES
        ('e2e-lead-iso', $1, 'Ana Isolamento', NOW()),
        ('e2e-lead-b', $1, 'Beatriz Teste', NOW())`,
      [LOJA_A],
    );

    // Contrato (loja-a) — vendedora = admin-a, lead = Beatriz
    await db.query(
      `INSERT INTO "Contrato" (id, "lojaId", "leadId", "vendedoraId", "valorTotal", "updatedAt")
       VALUES ('e2e-contrato-1', $1, 'e2e-lead-b', 'e2e-admin-a', 8000, NOW())`,
      [LOJA_A],
    );
  } finally {
    await db.end();
  }
}
