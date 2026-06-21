import { PrismaClient, AtributoTipo } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

// Prisma 7 exige um driver adapter no construtor (não mais uma URL no schema).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Catálogo inicial de atributos compartilhados (interesses + vestidos).
// Valores de exemplo — a loja edita depois via CRUD.
const ATRIBUTOS: { nome: string; tipo: AtributoTipo; opcoes: string[] }[] = [
  {
    nome: "Decote",
    tipo: "OPCAO_UNICA",
    opcoes: ["Tomara que caia", "V", "Coração", "Ombro a ombro", "Canoa", "Halter"],
  },
  {
    nome: "Costas",
    tipo: "OPCAO_UNICA",
    opcoes: ["Fechada", "Aberta", "Renda", "Botões", "Decote nas costas"],
  },
  {
    nome: "Alças e mangas",
    tipo: "OPCAO_UNICA",
    opcoes: ["Sem alça", "Alça fina", "Manga longa", "Manga curta", "Mangas de renda"],
  },
  {
    nome: "Tipo de saia",
    tipo: "OPCAO_UNICA",
    opcoes: ["Lisa", "Com detalhe", "Princesa", "Sereia", "Reta", "Evasê"],
  },
];

// Módulos existentes na Base, para o mapa de acesso dos perfis.
const MODULOS = ["leads", "interesses", "vestidos", "config"] as const;

function acessos(habilitados: string[]): Record<string, boolean> {
  return Object.fromEntries(MODULOS.map((m) => [m, habilitados.includes(m)]));
}

async function main() {
  // 1) Loja
  const loja = await prisma.loja.upsert({
    where: { id: "loja-moscow" },
    update: {},
    create: {
      id: "loja-moscow",
      nome: "Moscow Noivas",
      cnpj: null,
      endereco: null,
      telefone: null,
    },
  });

  // 2) Regra de disponibilidade padrão (exemplo do spec: 14 / 2 / 3 / 2 / 7)
  await prisma.regraDisponibilidade.upsert({
    where: { lojaId: loja.id },
    update: {},
    create: {
      lojaId: loja.id,
      provaDiasAntes: 14,
      provaDuracao: 2,
      usoDiasAntes: 3,
      usoDiasDepois: 2,
      lavagemDiasDepois: 7,
    },
  });

  // 3) Perfis
  const perfilAdmin = await prisma.perfil.upsert({
    where: { id: "perfil-admin" },
    update: { acessosModulos: acessos(["leads", "interesses", "vestidos", "config"]) },
    create: {
      id: "perfil-admin",
      nome: "Admin",
      acessosModulos: acessos(["leads", "interesses", "vestidos", "config"]),
    },
  });
  await prisma.perfil.upsert({
    where: { id: "perfil-vendedora" },
    update: { acessosModulos: acessos(["leads", "interesses", "vestidos"]) },
    create: {
      id: "perfil-vendedora",
      nome: "Vendedora",
      acessosModulos: acessos(["leads", "interesses", "vestidos"]),
    },
  });
  await prisma.perfil.upsert({
    where: { id: "perfil-recepcao" },
    update: { acessosModulos: acessos(["leads", "interesses"]) },
    create: {
      id: "perfil-recepcao",
      nome: "Recepção",
      acessosModulos: acessos(["leads", "interesses"]),
    },
  });

  // 4) Usuário admin (senha: admin123 — trocar no primeiro acesso)
  const senhaHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.usuario.upsert({
    where: { email: "admin@moscownoivas.local" },
    update: {},
    create: {
      nome: "Administrador",
      email: "admin@moscownoivas.local",
      senhaHash,
    },
  });
  await prisma.usuarioLoja.upsert({
    where: { usuarioId_lojaId: { usuarioId: admin.id, lojaId: loja.id } },
    update: { perfilId: perfilAdmin.id },
    create: { usuarioId: admin.id, lojaId: loja.id, perfilId: perfilAdmin.id },
  });

  // 5) Catálogo de atributos + opções
  let ordemAttr = 0;
  for (const attr of ATRIBUTOS) {
    const atributo = await prisma.atributo.upsert({
      where: { id: `attr-${attr.nome.toLowerCase().replace(/\s+/g, "-")}` },
      update: {},
      create: {
        id: `attr-${attr.nome.toLowerCase().replace(/\s+/g, "-")}`,
        lojaId: loja.id,
        nome: attr.nome,
        tipo: attr.tipo,
        ordem: ordemAttr++,
      },
    });
    let ordemOpc = 0;
    for (const valor of attr.opcoes) {
      await prisma.atributoOpcao.upsert({
        where: { id: `opc-${atributo.id}-${ordemOpc}` },
        update: { valor },
        create: {
          id: `opc-${atributo.id}-${ordemOpc}`,
          atributoId: atributo.id,
          valor,
          ordem: ordemOpc,
        },
      });
      ordemOpc++;
    }
  }

  console.log("Seed concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
