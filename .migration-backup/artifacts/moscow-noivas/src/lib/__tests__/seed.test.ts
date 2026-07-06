import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";

describe("seed inicial", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("criou a loja Moscow Noivas", async () => {
    const loja = await prisma.loja.findUnique({ where: { id: "loja-moscow" } });
    expect(loja?.nome).toBe("Moscow Noivas");
  });

  it("criou a regra de disponibilidade padrão", async () => {
    const regra = await prisma.regraDisponibilidade.findUnique({
      where: { lojaId: "loja-moscow" },
    });
    expect(regra).not.toBeNull();
    expect(regra?.provaDiasAntes).toBe(14);
    expect(regra?.lavagemDiasDepois).toBe(7);
  });

  it("criou o usuário admin vinculado à loja com perfil Admin", async () => {
    const admin = await prisma.usuario.findUnique({
      where: { email: "admin@moscownoivas.local" },
      include: { lojas: { include: { perfil: true } } },
    });
    expect(admin).not.toBeNull();
    expect(admin?.lojas[0]?.perfil.nome).toBe("Admin");
  });

  it("perfil Admin: vestidos e config com ver+criar+editar (S1)", async () => {
    const perfil = await prisma.perfil.findUnique({ where: { id: "perfil-admin" } });
    const a = perfil?.acessosModulos as Record<string, Record<string, boolean>>;
    expect(a.vestidos).toEqual({ ver: true, criar: true, editar: true });
    expect(a.config).toEqual({ ver: true, criar: true, editar: true });
  });

  it("perfil Vendedora: vestidos só ver; config tudo false (S1)", async () => {
    const perfil = await prisma.perfil.findUnique({ where: { id: "perfil-vendedora" } });
    const v = perfil?.acessosModulos as Record<string, Record<string, boolean>>;
    expect(v.vestidos).toEqual({ ver: true, criar: false, editar: false });
    expect(v.config).toEqual({ ver: false, criar: false, editar: false });
  });

  it("semeou o catálogo de atributos com pelo menos Decote e suas opções", async () => {
    const decote = await prisma.atributo.findFirst({
      where: { lojaId: "loja-moscow", nome: "Decote" },
      include: { opcoes: true },
    });
    expect(decote).not.toBeNull();
    expect(decote!.opcoes.length).toBeGreaterThanOrEqual(3);
  });

  it("tabela Sessao existe e aceita writes/reads", async () => {
    const ID = "smoke-sessao-task1";
    const admin = await prisma.usuario.findUnique({ where: { email: "admin@moscownoivas.local" } });
    expect(admin).not.toBeNull();
    // idempotente entre execuções: limpa antes pra evitar UniqueConstraint se um run anterior caiu.
    await prisma.sessao.deleteMany({ where: { id: ID } });
    try {
      const sessao = await prisma.sessao.create({
        data: { id: ID, usuarioId: admin!.id, expiraEm: new Date(Date.now() + 60_000) },
      });
      expect(sessao.id).toBe(ID);
      const lida = await prisma.sessao.findUnique({ where: { id: ID } });
      expect(lida?.usuarioId).toBe(admin!.id);
    } finally {
      await prisma.sessao.deleteMany({ where: { id: ID } });
    }
  });
});
