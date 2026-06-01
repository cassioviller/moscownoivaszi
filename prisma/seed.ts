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
  // Dimensões que antes eram campos fixos de LeadInteresse — agora moram no
  // catálogo, pra vestido e interesse falarem o MESMO vocabulário (base da
  // indicação). ESCALA = grau Pouco/Médio/Muito; Fenda fica OPCAO_UNICA.
  {
    nome: "Volume da saia",
    tipo: "ESCALA",
    opcoes: ["Pouco", "Médio", "Muito"],
  },
  {
    nome: "Brilho",
    tipo: "ESCALA",
    opcoes: ["Pouco", "Médio", "Muito"],
  },
  {
    nome: "Cauda",
    tipo: "ESCALA",
    opcoes: ["Pouco", "Médio", "Muito"],
  },
  {
    nome: "Fenda",
    tipo: "OPCAO_UNICA",
    opcoes: ["Sim", "Não", "Talvez"],
  },
];

// Módulos existentes na Base, para o mapa de acesso dos perfis.
const MODULOS = ["leads", "interesses", "vestidos", "config"] as const;

type Acoes = { ver: boolean; criar: boolean; editar: boolean };
const TODAS: ("ver" | "criar" | "editar")[] = ["ver", "criar", "editar"];

// Recebe ações habilitadas por módulo; preenche o resto com false (shape completo).
function acessos(
  porModulo: Partial<Record<(typeof MODULOS)[number], ("ver" | "criar" | "editar")[]>>,
): Record<string, Acoes> {
  return Object.fromEntries(
    MODULOS.map((m) => {
      const on = porModulo[m] ?? [];
      return [m, { ver: on.includes("ver"), criar: on.includes("criar"), editar: on.includes("editar") }];
    }),
  );
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
    update: { acessosModulos: acessos({ leads: TODAS, interesses: TODAS, vestidos: TODAS, config: TODAS }) },
    create: {
      id: "perfil-admin",
      nome: "Admin",
      acessosModulos: acessos({ leads: TODAS, interesses: TODAS, vestidos: TODAS, config: TODAS }),
    },
  });
  await prisma.perfil.upsert({
    where: { id: "perfil-vendedora" },
    update: { acessosModulos: acessos({ leads: TODAS, interesses: TODAS, vestidos: ["ver"] }) },
    create: {
      id: "perfil-vendedora",
      nome: "Vendedora",
      acessosModulos: acessos({ leads: TODAS, interesses: TODAS, vestidos: ["ver"] }),
    },
  });
  await prisma.perfil.upsert({
    where: { id: "perfil-recepcao" },
    update: { acessosModulos: acessos({ leads: ["ver", "criar"], interesses: ["ver"], vestidos: ["ver"] }) },
    create: {
      id: "perfil-recepcao",
      nome: "Recepção",
      acessosModulos: acessos({ leads: ["ver", "criar"], interesses: ["ver"], vestidos: ["ver"] }),
    },
  });

  // 4) Usuário admin (senha: admin123 — trocar no primeiro acesso)
  const senhaHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.usuario.upsert({
    where: { email: "admin@moscownoivas.local" },
    update: { isSuperAdmin: true },
    create: {
      nome: "Administrador",
      email: "admin@moscownoivas.local",
      senhaHash,
      isSuperAdmin: true, // staff da plataforma: vê todas as lojas no seletor (B.2-T1b)
    },
  });
  await prisma.usuarioLoja.upsert({
    where: { usuarioId_lojaId: { usuarioId: admin.id, lojaId: loja.id } },
    update: { perfilId: perfilAdmin.id },
    create: { usuarioId: admin.id, lojaId: loja.id, perfilId: perfilAdmin.id },
  });

  // 4b) Admin DE LOJA (perfil Admin, NÃO super-admin). Gerencia a loja — equipe,
  // permissões, catálogo — mas SEM poder sobre o CRUD de admins/lojas, que é
  // exclusivo do super-admin acima. É a conta para o dia a dia da gerência;
  // o /admin (criar admins/lojas) nem aparece pra ela. Senha: gerente123.
  const senhaGerente = await bcrypt.hash("gerente123", 10);
  const gerente = await prisma.usuario.upsert({
    where: { email: "gerente@moscow.local" },
    update: { isSuperAdmin: false }, // defensivo: nunca promove no re-seed
    create: {
      nome: "Gerente da Loja",
      email: "gerente@moscow.local",
      senhaHash: senhaGerente,
      isSuperAdmin: false,
    },
  });
  await prisma.usuarioLoja.upsert({
    where: { usuarioId_lojaId: { usuarioId: gerente.id, lojaId: loja.id } },
    update: { perfilId: perfilAdmin.id },
    create: { usuarioId: gerente.id, lojaId: loja.id, perfilId: perfilAdmin.id },
  });

  // 4c) Usuários de SMOKE/DEV — credenciais previsíveis APENAS para
  // desenvolvimento e testes manuais. NÃO usar em produção. Um por perfil
  // restante (Vendedora, Recepção), vinculados à loja padrão com o perfil do
  // seed (não altera permissões). Idempotente; nunca promove a super-admin.
  // A conta manual vendedora@lojateste.local NÃO é tocada.
  const smokeUsers = [
    { email: "vendedora@moscow.local", nome: "Vendedora (dev)", senha: "vendedora123", perfilId: "perfil-vendedora" },
    { email: "recepcao@moscow.local", nome: "Recepção (dev)", senha: "recepcao123", perfilId: "perfil-recepcao" },
  ];
  for (const su of smokeUsers) {
    const usuario = await prisma.usuario.upsert({
      where: { email: su.email },
      update: { isSuperAdmin: false }, // defensivo: nunca promove no re-seed
      create: {
        nome: su.nome,
        email: su.email,
        senhaHash: await bcrypt.hash(su.senha, 10),
        isSuperAdmin: false,
      },
    });
    await prisma.usuarioLoja.upsert({
      where: { usuarioId_lojaId: { usuarioId: usuario.id, lojaId: loja.id } },
      update: { perfilId: su.perfilId },
      create: { usuarioId: usuario.id, lojaId: loja.id, perfilId: su.perfilId },
    });
  }

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
