import { prisma } from "../src/lib/db";

async function main() {
  const dupCabine = await prisma.$queryRawUnsafe<{ c: number }[]>(
    `SELECT "cabineId", inicio, count(*)::int c FROM "Atendimento" GROUP BY "cabineId", inicio HAVING count(*) > 1`,
  );
  const dupVend = await prisma.$queryRawUnsafe<{ c: number }[]>(
    `SELECT "lojaId", "vendedoraId", inicio, count(*)::int c FROM "Atendimento" GROUP BY "lojaId", "vendedoraId", inicio HAVING count(*) > 1`,
  );
  const total = await prisma.atendimento.count();
  console.log(JSON.stringify({ total, dup_cabine: dupCabine.length, dup_vendedora: dupVend.length }));
  await prisma.$disconnect();
}
main();
