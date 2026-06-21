import { Router } from "express";
import { query, queryOne, execute } from "../lib/db.js";
import { gerarHash } from "../lib/auth.js";

const router = Router();

// Create default seed data (perfis + super admin)
router.post("/seed", async (req, res) => {
  try {
    const { adminSenha = "admin123" } = req.body ?? {};

    // Create default perfis
    const perfis = [
      {
        id: "perfil-admin",
        nome: "Admin",
        acessos: { leads: { ver: true, criar: true, editar: true }, interesses: { ver: true, criar: true, editar: true }, vestidos: { ver: true, criar: true, editar: true }, ajustes: { ver: true, criar: true, editar: true }, config: { ver: true, criar: true, editar: true }, financeiro: { ver: true, criar: true, editar: true } },
      },
      {
        id: "perfil-vendedora",
        nome: "Vendedora",
        acessos: { leads: { ver: true, criar: true, editar: true }, interesses: { ver: true, criar: true, editar: true }, vestidos: { ver: true, criar: false, editar: false }, ajustes: { ver: false, criar: false, editar: false }, config: { ver: false, criar: false, editar: false }, financeiro: { ver: false, criar: false, editar: false } },
      },
      {
        id: "perfil-recepcao",
        nome: "Recepção",
        acessos: { leads: { ver: true, criar: true, editar: false }, interesses: { ver: true, criar: false, editar: false }, vestidos: { ver: true, criar: false, editar: false }, ajustes: { ver: false, criar: false, editar: false }, config: { ver: false, criar: false, editar: false }, financeiro: { ver: false, criar: false, editar: false } },
      },
    ];

    for (const p of perfis) {
      const exists = await queryOne(`SELECT id FROM "Perfil" WHERE id = $1`, [p.id]);
      if (!exists) {
        await execute(
          `INSERT INTO "Perfil" (id, nome, "acessosModulos", "updatedAt") VALUES ($1, $2, $3, NOW())`,
          [p.id, p.nome, JSON.stringify(p.acessos)],
        );
      }
    }

    // Create super admin if doesn't exist
    const existing = await queryOne(`SELECT id FROM "Usuario" WHERE "isSuperAdmin" = true LIMIT 1`);
    if (!existing) {
      const hash = await gerarHash(adminSenha);
      await execute(
        `INSERT INTO "Usuario" (id, nome, email, "senhaHash", "isSuperAdmin", "updatedAt")
         VALUES ('super-admin', 'Super Admin', 'admin@moscownoivas.com', $1, true, NOW())`,
        [hash],
      );
    }

    // Create a demo loja and link super-admin if no lojas exist
    const lojaExistente = await queryOne(`SELECT id FROM "Loja" LIMIT 1`);
    if (!lojaExistente) {
      const lojaId = "loja-demo";
      await execute(
        `INSERT INTO "Loja" (id, nome, ativo, "updatedAt") VALUES ($1, 'Moscow Noivas SP', true, NOW())`,
        [lojaId],
      );
      // Link super-admin to the loja
      const admin = await queryOne(`SELECT id FROM "Usuario" WHERE "isSuperAdmin" = true LIMIT 1`);
      if (admin) {
        const ulExists = await queryOne(`SELECT 1 FROM "UsuarioLoja" WHERE "usuarioId" = $1 AND "lojaId" = $2`, [admin.id, lojaId]);
        if (!ulExists) {
          await execute(
            `INSERT INTO "UsuarioLoja" ("usuarioId", "lojaId", "perfilId") VALUES ($1, $2, 'perfil-admin')`,
            [admin.id, lojaId],
          );
        }
      }
    }

    res.json({ ok: true, mensagem: "Seed executado com sucesso" });
  } catch (err: any) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
