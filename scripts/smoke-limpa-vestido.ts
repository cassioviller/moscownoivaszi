import { prisma } from "../src/lib/db";
prisma.vestido.deleteMany({ where: { lojaId: "loja-moscow", codigo: "SMOKE-1" } }).then(r=>console.log("removidos:",r.count)).finally(()=>process.exit(0));
