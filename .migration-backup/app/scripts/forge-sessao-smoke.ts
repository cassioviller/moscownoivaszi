import { criarSessao, definirLojaAtiva } from "../src/lib/auth/sessao";
import { prisma } from "../src/lib/db";

// Forja uma sessão da vendedora com loja-moscow ativa, só para o smoke do B.2-T3.
async function main() {
  const email = "vendedora@lojateste.local";
  const u = await prisma.usuario.findUnique({ where: { email } });
  if (!u) throw new Error(`usuário ${email} não existe`);
  const vinc = await prisma.usuarioLoja.findFirst({ where: { usuarioId: u.id } });
  if (!vinc) throw new Error("vendedora sem vínculo de loja");

  const sessao = await criarSessao(u.id);
  await definirLojaAtiva(sessao.id, vinc.lojaId, u.id);

  console.log(JSON.stringify({ sessaoId: sessao.id, lojaAtiva: vinc.lojaId, usuario: u.id }));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
