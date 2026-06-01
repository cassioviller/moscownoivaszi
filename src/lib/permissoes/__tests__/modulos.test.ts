// src/lib/permissoes/__tests__/modulos.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { podeNoModulo } from "@/lib/permissoes/modulos";

const MARK = "t-pm-";
const HASH = "$2a$10$dummydummydummydummydummydummydummydummydummydummyd";
let loja = "";
let perfilFull = "";
let perfilVend = "";
let perfilVendOv = "";
let uAdmin = "";
let uVend = "";
let uVendOv = "";
let uSuper = "";
let uSemVinculo = "";
let uAdminCanonico = "";

beforeAll(async () => {
  const l = await prisma.loja.create({ data: { nome: `${MARK}loja` } });
  loja = l.id;
  const pf = await prisma.perfil.create({
    data: {
      nome: `${MARK}full`,
      acessosModulos: {
        leads: { ver: true, criar: true, editar: true },
        interesses: { ver: true, criar: true, editar: true },
        vestidos: { ver: true, criar: true, editar: true },
        config: { ver: true, criar: true, editar: true },
      },
    },
  });
  perfilFull = pf.id;
  const pv = await prisma.perfil.create({
    data: {
      nome: `${MARK}vend`,
      acessosModulos: {
        leads: { ver: true, criar: true, editar: true },
        interesses: { ver: true, criar: true, editar: true },
        vestidos: { ver: true, criar: false, editar: false },
        config: { ver: false, criar: false, editar: false },
      },
    },
  });
  perfilVend = pv.id;
  // Perfil dedicado ao cenário de override (template idêntico ao vendedora: NÃO cria vestido).
  const pvo = await prisma.perfil.create({
    data: {
      nome: `${MARK}vend-ov`,
      acessosModulos: {
        leads: { ver: true, criar: true, editar: true },
        interesses: { ver: true, criar: true, editar: true },
        vestidos: { ver: true, criar: false, editar: false },
        config: { ver: false, criar: false, editar: false },
      },
    },
  });
  perfilVendOv = pvo.id;
  const mk = (s: string, sa = false) =>
    prisma.usuario.create({ data: { nome: `${MARK}${s}`, email: `${MARK}${s}@x.local`, senhaHash: HASH, isSuperAdmin: sa } });
  uAdmin = (await mk("admin")).id;
  uVend = (await mk("vend")).id;
  uVendOv = (await mk("vendov")).id;
  uSuper = (await mk("super", true)).id;
  uSemVinculo = (await mk("sv")).id;
  await prisma.usuarioLoja.create({ data: { usuarioId: uAdmin, lojaId: loja, perfilId: perfilFull } });
  await prisma.usuarioLoja.create({ data: { usuarioId: uVend, lojaId: loja, perfilId: perfilVend } });
  await prisma.usuarioLoja.create({ data: { usuarioId: uVendOv, lojaId: loja, perfilId: perfilVendOv } });

  // Override: nesta loja, perfilVendOv ganha vestidos.criar (snapshot completo).
  // O template do perfil diz criar=false → prova "override > template".
  await prisma.perfilOverrideLoja.create({
    data: {
      lojaId: loja,
      perfilId: perfilVendOv,
      acessosModulos: {
        leads: { ver: true, criar: true, editar: true },
        interesses: { ver: true, criar: true, editar: true },
        vestidos: { ver: true, criar: true, editar: false },
        config: { ver: false, criar: false, editar: false },
      },
    } as never,
  });

  // Usuário com o perfil ADMIN canônico (id "perfil-admin"), vinculado à loja.
  // perfil-admin é compartilhado/seed — upsert sem update e NÃO apagar no afterAll.
  const padmin = await prisma.perfil.upsert({
    where: { id: "perfil-admin" },
    update: {},
    create: { id: "perfil-admin", nome: "Admin", acessosModulos: {} },
  });
  uAdminCanonico = (await mk("adminc")).id;
  await prisma.usuarioLoja.create({ data: { usuarioId: uAdminCanonico, lojaId: loja, perfilId: padmin.id } });
});

afterAll(async () => {
  await prisma.perfilOverrideLoja.deleteMany({ where: { lojaId: loja } });
  await prisma.usuario.deleteMany({ where: { id: { in: [uAdmin, uVend, uVendOv, uSuper, uSemVinculo, uAdminCanonico] } } }); // cascade UsuarioLoja
  await prisma.loja.delete({ where: { id: loja } });
  await prisma.perfil.deleteMany({ where: { id: { in: [perfilFull, perfilVend, perfilVendOv] } } }); // perfil-admin (seed) NÃO é apagado
  await prisma.$disconnect();
});

describe("podeNoModulo", () => {
  it("super-admin pode qualquer módulo/ação (P1)", async () => {
    expect(await podeNoModulo(uSuper, loja, "vestidos", "editar")).toBe(true);
    expect(await podeNoModulo(uSuper, loja, "config", "criar")).toBe(true);
  });
  it("perfil full: ver+criar+editar em vestidos (P2)", async () => {
    expect(await podeNoModulo(uAdmin, loja, "vestidos", "ver")).toBe(true);
    expect(await podeNoModulo(uAdmin, loja, "vestidos", "criar")).toBe(true);
    expect(await podeNoModulo(uAdmin, loja, "vestidos", "editar")).toBe(true);
  });
  it("vendedora: vê mas não cria/edita vestidos (P3)", async () => {
    expect(await podeNoModulo(uVend, loja, "vestidos", "ver")).toBe(true);
    expect(await podeNoModulo(uVend, loja, "vestidos", "criar")).toBe(false);
    expect(await podeNoModulo(uVend, loja, "vestidos", "editar")).toBe(false);
  });
  it("falha-fechada: sem vínculo / config negada → false (P4)", async () => {
    expect(await podeNoModulo(uSemVinculo, loja, "vestidos", "ver")).toBe(false);
    expect(await podeNoModulo(uVend, loja, "config", "ver")).toBe(false);
  });
  it("override > template: ganha vestidos.criar nesta loja; sem override segue o template (P5)", async () => {
    expect(await podeNoModulo(uVendOv, loja, "vestidos", "criar")).toBe(true); // override
    expect(await podeNoModulo(uVendOv, loja, "vestidos", "editar")).toBe(false);
    expect(await podeNoModulo(uVend, loja, "vestidos", "criar")).toBe(false); // sem override → template
  });
  it("perfil Admin canônico → acesso total, independe de flags (P6)", async () => {
    expect(await podeNoModulo(uAdminCanonico, loja, "vestidos", "editar")).toBe(true);
    expect(await podeNoModulo(uAdminCanonico, loja, "config", "criar")).toBe(true);
  });
});
