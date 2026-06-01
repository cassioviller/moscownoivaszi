import { criarSessao, definirLojaAtiva } from "../src/lib/auth/sessao";
import { prisma } from "../src/lib/db";

// Forja sessões (admin + vendedora) na loja-moscow para o smoke do módulo Vestidos.
async function sessaoPara(email: string) {
  const u = await prisma.usuario.findUnique({ where: { email } });
  if (!u) throw new Error(`usuário ${email} não existe`);
  const s = await criarSessao(u.id);
  await definirLojaAtiva(s.id, "loja-moscow", u.id);
  return s.id;
}

async function main() {
  const admin = await sessaoPara("admin@moscownoivas.local");
  const vendedora = await sessaoPara("vendedora@lojateste.local");
  console.log(JSON.stringify({ admin, vendedora }));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
