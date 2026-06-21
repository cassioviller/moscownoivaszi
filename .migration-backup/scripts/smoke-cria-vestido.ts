import { criarVestido } from "../src/lib/vestidos/vestidos";
import { prisma } from "../src/lib/db";
async function main() {
  const v = await criarVestido("loja-moscow", { codigo: "SMOKE-1", nome: "Vestido Smoke", precoBase: "2.400,00", tamanho: "38", cor: "Off-white" });
  console.log("criado:", v.id);
}
main().then(()=>prisma.$disconnect()).catch(e=>{console.error(e);return prisma.$disconnect().finally(()=>process.exit(1));});
