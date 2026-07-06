import { db, lojasTable, usuariosTable, perfisTable, usuariosLojasTable, vestidosTable, leadsTable, cabinesTable, atendimentosTable, orcamentosTable, contratosTable, parcelasTable, contasPagarTable, comissaoFaixasTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

async function seed() {
  console.log("Starting seed...");

  const adminSenhaHash = await bcrypt.hash("admin123", 12);

  // 1. Loja
  const lojaId = randomUUID();
  await db.insert(lojasTable).values({
    id: lojaId,
    nome: "Moscow Noivas SP",
    cnpj: "12.345.678/0001-99",
    endereco: "Rua das Noivas, 123, São Paulo - SP",
    telefone: "(11) 99999-9999",
  });

  // 2. Perfis
  const adminPerfilId = "perfil-admin";
  const vendedoraPerfilId = "perfil-vendedora";

  await db.insert(perfisTable).values([
    {
      id: adminPerfilId,
      nome: "Admin",
      acessosModulos: { 
        leads: true, 
        vestidos: true, 
        agenda: true, 
        financeiro: true, 
        comissao: true,
        admin: true
      },
    },
    {
      id: vendedoraPerfilId,
      nome: "Vendedora",
      acessosModulos: { 
        leads: true, 
        vestidos: true, 
        agenda: true, 
        financeiro: false, 
        comissao: false,
        admin: false
      },
    }
  ]);

  // 3. Usuarios
  const superAdminId = randomUUID();
  await db.insert(usuariosTable).values([
    {
      id: superAdminId,
      nome: "Super Admin",
      email: "admin@moscownoivas.com",
      senhaHash: adminSenhaHash,
      isSuperAdmin: true,
    },
    {
      id: randomUUID(),
      nome: "Vendedora Maria",
      email: "maria@moscownoivas.com",
      senhaHash: adminSenhaHash,
      isSuperAdmin: false,
    }
  ]);

  // Link super admin to loja
  await db.insert(usuariosLojasTable).values({
    usuarioId: superAdminId,
    lojaId: lojaId,
    perfilId: adminPerfilId,
  });

  // 4. Vestidos
  await db.insert(vestidosTable).values([
    {
      id: randomUUID(),
      lojaId,
      codigo: "V001",
      nome: "Princesa Encantada",
      precoBase: 5000.00,
      tamanho: "38",
      cor: "Off-white",
      categoria: "Princesa",
    },
    {
      id: randomUUID(),
      lojaId,
      codigo: "V002",
      nome: "Sereia Glamour",
      precoBase: 7500.00,
      tamanho: "40",
      cor: "Branco",
      categoria: "Sereia",
    }
  ] as any);

  // 5. Leads
  const leadId = randomUUID();
  await db.insert(leadsTable).values([
    {
      id: leadId,
      lojaId,
      noivaNome: "Ana Silva",
      whatsapp: "(11) 98888-8888",
      etapa: "NOVO",
      origem: "WHATSAPP",
    },
    {
      id: randomUUID(),
      lojaId,
      noivaNome: "Julia Santos",
      whatsapp: "(11) 97777-7777",
      etapa: "CONTRATO_FECHADO",
      origem: "LOJA",
    }
  ]);

  // 6. Cabines & Atendimentos
  const cabineId = randomUUID();
  await db.insert(cabinesTable).values({
    id: cabineId,
    lojaId,
    nome: "Cabine Luxo 1",
  });

  await db.insert(atendimentosTable).values({
    id: randomUUID(),
    lojaId,
    leadId,
    cabineId,
    vendedoraId: superAdminId,
    inicio: new Date(),
    tipo: "ATENDIMENTO",
    situacao: "AGENDADO",
  });

  // 7. Financeiro
  const contratoId = randomUUID();
  await db.insert(contratosTable).values({
    id: contratoId,
    lojaId,
    leadId,
    vendedoraId: superAdminId,
    valorTotal: 5000.00,
    status: "ATIVO",
    fechadoEm: new Date(),
  } as any);

  await db.insert(parcelasTable).values({
    id: randomUUID(),
    lojaId,
    contratoId,
    numero: 1,
    valorPrevisto: 5000.00,
    vencimento: new Date(),
    status: "PREVISTA",
  } as any);

  await db.insert(contasPagarTable).values({
    id: randomUUID(),
    lojaId,
    tipo: "DESPESA",
    descricao: "Aluguel",
    valorPrevisto: 2000.00,
    vencimento: new Date(),
    status: "PREVISTA",
  } as any);

  // 8. Comissao
  await db.insert(comissaoFaixasTable).values({
    id: randomUUID(),
    lojaId,
    minimoVenda: 0.00,
    percentual: 5.00,
  } as any);

  console.log("Seed completed!");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
