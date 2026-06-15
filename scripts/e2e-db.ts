/**
 * CLI de banco para a suíte E2E (Playwright). Roda via `tsx` em subprocess porque o
 * client Prisma gerado é CommonJS (`exports`) e o loader do Playwright o trata como ESM
 * — importar o client direto de dentro do Playwright quebra com "exports is not defined".
 * O `seed.ts` já usa o mesmo padrão (`tsx prisma/seed.ts`).
 *
 * Comandos:
 *   setup              cria a loja efêmera + admin + cabine/horário (idempotente)
 *   teardown           apaga a loja (cascade) + usuário + sessões
 *   criar-noiva <nome> cria um Lead e imprime o leadId em stdout
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const LOJA = process.env.E2E_LOJA ?? "loja-e2e";
const EMAIL = process.env.E2E_EMAIL ?? "admin-e2e@moscow.local";
const SENHA = process.env.E2E_SENHA ?? "e2e-12345";

const ADMIN_ID = "usuario-e2e-admin";
const PERFIL_ADMIN_ID = "perfil-admin"; // id estável do seed; podeNoModulo libera tudo p/ ele.
const LOJAS_REAIS = new Set(["loja-moscow", "loja-teste-2"]);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/** Cria a loja efêmera + admin + pré-requisitos do agendamento. Idempotente. */
async function setup(): Promise<void> {
  if (LOJAS_REAIS.has(LOJA)) throw new Error(`E2E_LOJA "${LOJA}" colide com uma loja real — abortando.`);

  // Corrida anterior órfã: o cascade da Loja leva todo dado de tenant.
  await prisma.loja.deleteMany({ where: { id: LOJA } });
  await prisma.usuario.deleteMany({ where: { email: EMAIL } });

  await prisma.loja.create({ data: { id: LOJA, nome: "Atelier E2E (efêmero)" } });

  // Perfil Admin global (id do seed). Upsert não-destrutivo se já existir.
  await prisma.perfil.upsert({
    where: { id: PERFIL_ADMIN_ID },
    update: {},
    create: { id: PERFIL_ADMIN_ID, nome: "Admin", acessosModulos: {} },
  });

  const senhaHash = await bcrypt.hash(SENHA, 10);
  await prisma.usuario.create({
    data: { id: ADMIN_ID, nome: "Admin E2E", email: EMAIL, senhaHash, isSuperAdmin: false },
  });
  await prisma.usuarioLoja.create({
    data: { usuarioId: ADMIN_ID, lojaId: LOJA, perfilId: PERFIL_ADMIN_ID },
  });

  // Pré-requisitos do fluxo de agendamento.
  await prisma.regraDisponibilidade.create({
    data: { lojaId: LOJA, atendimentoAberturaHora: 9, atendimentoFechamentoHora: 19 },
  });
  await prisma.cabine.create({ data: { lojaId: LOJA, nome: "Cabine E2E" } });
}

/** Apaga tudo que o setup criou. Cascade da Loja leva o dado de tenant. */
async function teardown(): Promise<void> {
  await prisma.sessao.deleteMany({ where: { usuario: { email: EMAIL } } });
  await prisma.loja.deleteMany({ where: { id: LOJA } });
  await prisma.usuario.deleteMany({ where: { email: EMAIL } });
}

/** Cria uma noiva na loja e2e e imprime o leadId. */
async function criarNoiva(noivaNome: string): Promise<void> {
  if (!noivaNome) throw new Error("criar-noiva exige um nome.");
  const lead = await prisma.lead.create({ data: { lojaId: LOJA, noivaNome } });
  process.stdout.write(lead.id);
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "setup":
      return setup();
    case "teardown":
      return teardown();
    case "criar-noiva":
      return criarNoiva(args[0]);
    default:
      throw new Error(`Comando e2e-db desconhecido: ${cmd ?? "(vazio)"}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
