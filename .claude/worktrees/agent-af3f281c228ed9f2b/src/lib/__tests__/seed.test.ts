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

  it("o perfil Admin tem acesso ao módulo de config", async () => {
    const perfil = await prisma.perfil.findUnique({ where: { id: "perfil-admin" } });
    const acessos = perfil?.acessosModulos as Record<string, boolean>;
    expect(acessos.config).toBe(true);
  });

  it("o perfil Vendedora NÃO tem acesso ao módulo de config", async () => {
    const perfil = await prisma.perfil.findUnique({ where: { id: "perfil-vendedora" } });
    const acessos = perfil?.acessosModulos as Record<string, boolean>;
    expect(acessos.config).toBe(false);
  });

  it("semeou o catálogo de atributos com pelo menos Decote e suas opções", async () => {
    const decote = await prisma.atributo.findFirst({
      where: { lojaId: "loja-moscow", nome: "Decote" },
      include: { opcoes: true },
    });
    expect(decote).not.toBeNull();
    expect(decote!.opcoes.length).toBeGreaterThanOrEqual(3);
  });
});
