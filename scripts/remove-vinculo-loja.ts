import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const USUARIO_ID = "user-vendedora-pzv";
const LOJA_REMOVER = "loja-teste-2"; // Filial Teste — vínculo a excluir
const LOJA_MANTER = "loja-moscow"; // Moscow Noivas — vínculo a manter

async function main() {
  await prisma.$transaction(async (tx) => {
    // 1) Remove o vínculo usuário-loja da loja indicada.
    const del = await tx.usuarioLoja.delete({
      where: { usuarioId_lojaId: { usuarioId: USUARIO_ID, lojaId: LOJA_REMOVER } },
    });
    console.log(`Vínculo removido: usuario=${del.usuarioId} loja=${del.lojaId}`);

    // 2) Zera a loja ativa de sessões que apontem para a loja removida (evita
    //    sessão ativa em loja que o usuário não pertence mais).
    const upd = await tx.sessao.updateMany({
      where: { usuarioId: USUARIO_ID, lojaAtivaId: LOJA_REMOVER },
      data: { lojaAtivaId: LOJA_MANTER },
    });
    console.log(`Sessões reapontadas para a loja mantida: ${upd.count}`);
  });

  // Verificação final.
  const restante = await prisma.usuarioLoja.findMany({
    where: { usuarioId: USUARIO_ID },
    include: { loja: { select: { nome: true, id: true } }, perfil: { select: { nome: true } } },
  });
  console.log(`\nVínculos restantes do usuário (${restante.length}):`);
  for (const v of restante) {
    console.log(`  - ${v.loja.nome} (${v.loja.id}) | perfil: ${v.perfil.nome}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
