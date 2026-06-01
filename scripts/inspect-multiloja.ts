import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const usuarios = await prisma.usuario.findMany({
    include: {
      lojas: {
        include: {
          loja: { select: { id: true, nome: true } },
          perfil: { select: { nome: true } },
        },
      },
    },
    orderBy: { nome: "asc" },
  });

  const multi = usuarios.filter((u) => u.lojas.length > 1);

  console.log(`Total de usuários: ${usuarios.length}`);
  console.log(`Usuários vinculados a mais de uma loja: ${multi.length}\n`);

  for (const u of multi) {
    console.log(`• ${u.nome} <${u.email}> (id=${u.id})${u.isSuperAdmin ? " [SUPER ADMIN]" : ""}`);
    for (const v of u.lojas) {
      console.log(`    - loja: ${v.loja.nome} (${v.loja.id}) | perfil: ${v.perfil.nome}`);
    }
    console.log("");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
