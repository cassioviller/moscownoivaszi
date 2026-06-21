import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  criarLoja,
  listarLojas,
  criarAdmin,
  listarAdmins,
  criarVendedora,
  listarEquipe,
  ehAdminDaLoja,
  PERFIL_ADMIN_ID,
  PERFIL_VENDEDORA_ID,
} from "@/lib/admin/usuarios";

const PREFIX = "t-adm"; // emails de fixture: t-adm-*@test.local
const LOJA_1 = "t-adm-loja-1";
const LOJA_2 = "t-adm-loja-2";
const LOJA_NOME_PREFIX = "ZZ Loja Admin Test";

async function limpar(): Promise<void> {
  // UsuarioLoja cascateia ao deletar Usuario/Loja.
  await prisma.usuario.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.loja.deleteMany({ where: { id: { in: [LOJA_1, LOJA_2] } } });
  await prisma.loja.deleteMany({ where: { nome: { startsWith: LOJA_NOME_PREFIX } } });
}

beforeEach(async () => {
  await limpar();
  await prisma.loja.create({ data: { id: LOJA_1, nome: `${LOJA_NOME_PREFIX} 1` } });
  await prisma.loja.create({ data: { id: LOJA_2, nome: `${LOJA_NOME_PREFIX} 2` } });
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("criarLoja / listarLojas", () => {
  it("cria loja com nome aparado e aparece em listarLojas", async () => {
    const loja = await criarLoja(`  ${LOJA_NOME_PREFIX} Nova  `);
    expect(loja.nome).toBe(`${LOJA_NOME_PREFIX} Nova`);
    expect(loja.ativo).toBe(true);
    const todas = await listarLojas();
    expect(todas.some((l) => l.id === loja.id)).toBe(true);
  });

  it("rejeita nome vazio", async () => {
    await expect(criarLoja("   ")).rejects.toThrow(/obrigatório/);
  });
});

describe("criarAdmin", () => {
  it("cria Usuario (não super-admin) + vínculo perfil Admin na loja", async () => {
    const u = await criarAdmin({
      nome: "Admin Teste",
      email: `${PREFIX}-a@test.local`,
      senha: "senha1234",
      lojaIds: [LOJA_1],
    });
    expect(u.isSuperAdmin).toBe(false);
    const vinc = await prisma.usuarioLoja.findUnique({
      where: { usuarioId_lojaId: { usuarioId: u.id, lojaId: LOJA_1 } },
    });
    expect(vinc?.perfilId).toBe(PERFIL_ADMIN_ID);

    const admins = await listarAdmins();
    const achado = admins.find((a) => a.email === `${PREFIX}-a@test.local`);
    expect(achado).toBeTruthy();
    expect(achado!.lojas).toContain(`${LOJA_NOME_PREFIX} 1`);
  });

  it("admin pode receber mais de uma loja (1 vínculo por loja)", async () => {
    const u = await criarAdmin({
      nome: "Admin Multi",
      email: `${PREFIX}-multi@test.local`,
      senha: "senha1234",
      lojaIds: [LOJA_1, LOJA_2],
    });
    const vinculos = await prisma.usuarioLoja.count({ where: { usuarioId: u.id } });
    expect(vinculos).toBe(2);
  });

  it("normaliza e-mail (trim + lowercase)", async () => {
    const u = await criarAdmin({
      nome: "Admin Case",
      email: `  ${PREFIX}-CASE@TEST.local  `,
      senha: "senha1234",
      lojaIds: [LOJA_1],
    });
    expect(u.email).toBe(`${PREFIX}-case@test.local`);
  });

  it("rejeita e-mail duplicado", async () => {
    const dados = {
      nome: "Admin Dup",
      email: `${PREFIX}-dup@test.local`,
      senha: "senha1234",
      lojaIds: [LOJA_1],
    };
    await criarAdmin(dados);
    await expect(criarAdmin(dados)).rejects.toThrow(/já existe/i);
  });

  it("rejeita senha curta", async () => {
    await expect(
      criarAdmin({ nome: "X", email: `${PREFIX}-s@test.local`, senha: "123", lojaIds: [LOJA_1] }),
    ).rejects.toThrow(/ao menos/);
  });

  it("rejeita sem loja", async () => {
    await expect(
      criarAdmin({ nome: "X", email: `${PREFIX}-nl@test.local`, senha: "senha1234", lojaIds: [] }),
    ).rejects.toThrow(/ao menos uma loja/);
  });

  it("rejeita loja inexistente (e não cria o usuário)", async () => {
    await expect(
      criarAdmin({
        nome: "X",
        email: `${PREFIX}-ghost@test.local`,
        senha: "senha1234",
        lojaIds: ["loja-que-nao-existe"],
      }),
    ).rejects.toThrow(/inexistente/);
    const u = await prisma.usuario.findUnique({ where: { email: `${PREFIX}-ghost@test.local` } });
    expect(u).toBeNull();
  });

  it("listarAdmins não inclui super-admins", async () => {
    await prisma.usuario.create({
      data: {
        email: `${PREFIX}-sa@test.local`,
        nome: "SA",
        senhaHash: "x",
        isSuperAdmin: true,
      },
    });
    const admins = await listarAdmins();
    expect(admins.some((a) => a.email === `${PREFIX}-sa@test.local`)).toBe(false);
  });
});

describe("criarVendedora / listarEquipe / ehAdminDaLoja", () => {
  it("cria vendedora com perfil Vendedora na loja e aparece na equipe", async () => {
    const v = await criarVendedora({
      nome: "Vend Teste",
      email: `${PREFIX}-v@test.local`,
      senha: "senha1234",
      lojaId: LOJA_1,
    });
    const vinc = await prisma.usuarioLoja.findUnique({
      where: { usuarioId_lojaId: { usuarioId: v.id, lojaId: LOJA_1 } },
    });
    expect(vinc?.perfilId).toBe(PERFIL_VENDEDORA_ID);

    const equipe = await listarEquipe(LOJA_1);
    const membro = equipe.find((m) => m.email === `${PREFIX}-v@test.local`);
    expect(membro?.perfil).toBe("Vendedora");
  });

  it("ehAdminDaLoja: admin da loja → true; em loja onde não é admin → false", async () => {
    const admin = await criarAdmin({
      nome: "Admin L1",
      email: `${PREFIX}-adminl1@test.local`,
      senha: "senha1234",
      lojaIds: [LOJA_1],
    });
    expect(await ehAdminDaLoja(admin.id, LOJA_1)).toBe(true);
    expect(await ehAdminDaLoja(admin.id, LOJA_2)).toBe(false);
  });

  it("ehAdminDaLoja: vendedora → false (não gerencia)", async () => {
    const v = await criarVendedora({
      nome: "Vend Sem Poder",
      email: `${PREFIX}-vsp@test.local`,
      senha: "senha1234",
      lojaId: LOJA_1,
    });
    expect(await ehAdminDaLoja(v.id, LOJA_1)).toBe(false);
  });

  it("ehAdminDaLoja: super-admin → true em qualquer loja (mesmo sem vínculo)", async () => {
    const sa = await prisma.usuario.create({
      data: {
        email: `${PREFIX}-sa-mgr@test.local`,
        nome: "SA Mgr",
        senhaHash: "x",
        isSuperAdmin: true,
      },
    });
    expect(await ehAdminDaLoja(sa.id, LOJA_1)).toBe(true);
    expect(await ehAdminDaLoja(sa.id, LOJA_2)).toBe(true);
  });
});
