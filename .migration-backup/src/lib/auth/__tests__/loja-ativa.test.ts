import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  listarLojasDoUsuario,
  selecionarLojaPorPadrao,
  definirLojaAtiva,
  lerSessaoComLojaId,
  gateSessaoLojaAtivaPorId,
  lerSessao,
} from "@/lib/auth/sessao";

// Fixtures dedicadas (prefixo `t-la-`) pra não colidir com seed nem com sessões reais.
const ADMIN_EMAIL = "admin@moscownoivas.local";
const USER_0 = "t-la-user-0lojas";
const USER_2 = "t-la-user-2lojas";
const USER_SA = "t-la-user-superadmin"; // isSuperAdmin=true, SEM UsuarioLoja
const USER_VEND = "t-la-user-vendedora"; // isSuperAdmin=false, vinculada só à LOJA_B
const LOJA_A = "t-la-loja-a"; // nome "AAA" — vem antes na ordenação
const LOJA_B = "t-la-loja-b"; // nome "BBB"
const DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$dummy$dummy";

async function adminId(): Promise<string> {
  const u = await prisma.usuario.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!u) throw new Error("Seed do admin não rodou — `npm run db:seed` antes dos testes.");
  return u.id;
}

async function perfilId(): Promise<string> {
  const p = await prisma.perfil.findFirst();
  if (!p) throw new Error("Nenhum Perfil no banco — rode o seed.");
  return p.id;
}

const USERS_FIXTURE = [USER_0, USER_2, USER_SA, USER_VEND];

async function limparFixtures(): Promise<void> {
  const adm = await adminId();
  await prisma.sessao.deleteMany({
    where: { usuarioId: { in: [...USERS_FIXTURE, adm] } },
  });
  await prisma.usuarioLoja.deleteMany({
    where: { usuarioId: { in: USERS_FIXTURE } },
  });
  await prisma.usuarioLoja.deleteMany({ where: { lojaId: { in: [LOJA_A, LOJA_B] } } });
  await prisma.usuario.deleteMany({ where: { id: { in: USERS_FIXTURE } } });
  await prisma.loja.deleteMany({ where: { id: { in: [LOJA_A, LOJA_B] } } });
}

/**
 * Roda `fn` com EXATAMENTE `ids` ativas no sistema (desativa as demais e restaura no
 * finally). Seguro porque o vitest roda com `fileParallelism: false` + sequencial
 * dentro do arquivo — nenhum outro teste observa o estado intermediário.
 */
async function comApenasEstasLojasAtivas<T>(
  ids: string[],
  fn: () => Promise<T>,
): Promise<T> {
  const ativasAntes = await prisma.loja.findMany({
    where: { ativo: true },
    select: { id: true },
  });
  const desativar = ativasAntes.map((l) => l.id).filter((id) => !ids.includes(id));
  await prisma.loja.updateMany({ where: { id: { in: desativar } }, data: { ativo: false } });
  await prisma.loja.updateMany({ where: { id: { in: ids } }, data: { ativo: true } });
  try {
    return await fn();
  } finally {
    await prisma.loja.updateMany({ where: { id: { in: desativar } }, data: { ativo: true } });
  }
}

beforeAll(async () => {
  await limparFixtures();
  const pid = await perfilId();

  // user sem nenhuma loja
  await prisma.usuario.create({
    data: { id: USER_0, nome: "Sem Lojas", email: "t-la-0@test.local", senhaHash: DUMMY_HASH },
  });

  // 2 lojas + user vinculado às duas
  await prisma.loja.create({ data: { id: LOJA_A, nome: "AAA Loja" } });
  await prisma.loja.create({ data: { id: LOJA_B, nome: "BBB Loja" } });
  await prisma.usuario.create({
    data: { id: USER_2, nome: "Duas Lojas", email: "t-la-2@test.local", senhaHash: DUMMY_HASH },
  });
  await prisma.usuarioLoja.createMany({
    data: [
      { usuarioId: USER_2, lojaId: LOJA_A, perfilId: pid },
      { usuarioId: USER_2, lojaId: LOJA_B, perfilId: pid },
    ],
  });

  // super-admin: SEM nenhum UsuarioLoja (prova que enxerga lojas sem vínculo)
  await prisma.usuario.create({
    data: {
      id: USER_SA,
      nome: "Super Admin",
      email: "t-la-sa@test.local",
      senhaHash: DUMMY_HASH,
      isSuperAdmin: true,
    },
  });

  // vendedora (não super-admin): vinculada SÓ à LOJA_B — não tem acesso à LOJA_A
  await prisma.usuario.create({
    data: {
      id: USER_VEND,
      nome: "Vendedora",
      email: "t-la-vend@test.local",
      senhaHash: DUMMY_HASH,
      isSuperAdmin: false,
    },
  });
  await prisma.usuarioLoja.create({
    data: { usuarioId: USER_VEND, lojaId: LOJA_B, perfilId: pid },
  });
});

afterAll(async () => {
  await limparFixtures();
  await prisma.$disconnect();
});

describe("A — listarLojasDoUsuario", () => {
  it("A1: vendedora de 1 loja retorna [essa loja]", async () => {
    // (o admin agora é super-admin e veria TODAS as lojas — cobertura disso em F/G)
    const lojas = await listarLojasDoUsuario(USER_VEND);
    expect(lojas).toHaveLength(1);
    expect(lojas[0].id).toBe(LOJA_B);
  });

  it("A2: usuário sem lojas retorna []", async () => {
    expect(await listarLojasDoUsuario(USER_0)).toEqual([]);
  });

  it("A3: usuário com 2 lojas retorna as 2 ordenadas por nome", async () => {
    const lojas = await listarLojasDoUsuario(USER_2);
    expect(lojas.map((l) => l.id)).toEqual([LOJA_A, LOJA_B]); // AAA antes de BBB
  });
});

describe("B — selecionarLojaPorPadrao", () => {
  it("B1: user (não super-admin) de 1 loja retorna a loja", async () => {
    const loja = await selecionarLojaPorPadrao(USER_VEND);
    expect(loja?.id).toBe(LOJA_B);
  });

  it("B2: user de 2 lojas retorna null", async () => {
    expect(await selecionarLojaPorPadrao(USER_2)).toBeNull();
  });

  it("B3: user de 0 lojas retorna null", async () => {
    expect(await selecionarLojaPorPadrao(USER_0)).toBeNull();
  });
});

describe("C — definirLojaAtiva", () => {
  it("C1: grava lojaAtivaId; lerSessao reflete", async () => {
    const uid = await adminId();
    const sessao = await prisma.sessao.create({
      data: { id: "t-la-sess-c1", usuarioId: uid, expiraEm: new Date(Date.now() + 60_000) },
    });
    await definirLojaAtiva(sessao.id, "loja-moscow", uid);
    const lida = await lerSessao(sessao.id);
    expect(lida?.sessao.lojaAtivaId).toBe("loja-moscow");
  });

  it("C2: loja fora do acesso do user lança e NÃO grava", async () => {
    // USER_0 não tem vínculo com LOJA_A
    const sessao = await prisma.sessao.create({
      data: { id: "t-la-sess-c2", usuarioId: USER_0, expiraEm: new Date(Date.now() + 60_000) },
    });
    await expect(definirLojaAtiva(sessao.id, LOJA_A, USER_0)).rejects.toThrow(
      /acesso negado/,
    );
    const inalterada = await prisma.sessao.findUnique({ where: { id: sessao.id } });
    expect(inalterada?.lojaAtivaId).toBeNull();
  });
});

describe("D — lerSessaoComLojaId (variante por-id, sem mockar cookies)", () => {
  it("D1: sessão válida + lojaAtivaId setado retorna { sessao, usuario, loja }", async () => {
    const uid = await adminId();
    await prisma.sessao.create({
      data: {
        id: "t-la-sess-d1",
        usuarioId: uid,
        lojaAtivaId: "loja-moscow",
        expiraEm: new Date(Date.now() + 60_000),
      },
    });
    const r = await lerSessaoComLojaId("t-la-sess-d1");
    expect(r).not.toBeNull();
    expect(r!.loja.id).toBe("loja-moscow");
    expect(r!.usuario.email).toBe(ADMIN_EMAIL);
  });

  it("D2: sessão válida mas lojaAtivaId null retorna null", async () => {
    const uid = await adminId();
    await prisma.sessao.create({
      data: { id: "t-la-sess-d2", usuarioId: uid, expiraEm: new Date(Date.now() + 60_000) },
    });
    expect(await lerSessaoComLojaId("t-la-sess-d2")).toBeNull();
  });

  it("D3: lojaAtivaId aponta pra loja desativada retorna null", async () => {
    await prisma.sessao.create({
      data: {
        id: "t-la-sess-d3",
        usuarioId: USER_2,
        lojaAtivaId: LOJA_A,
        expiraEm: new Date(Date.now() + 60_000),
      },
    });
    await prisma.loja.update({ where: { id: LOJA_A }, data: { ativo: false } });
    try {
      expect(await lerSessaoComLojaId("t-la-sess-d3")).toBeNull();
    } finally {
      await prisma.loja.update({ where: { id: LOJA_A }, data: { ativo: true } });
    }
  });
});

describe("E — gateSessaoLojaAtivaPorId (variante por-id)", () => {
  it("E1: sem cookie (id null) → { tipo: 'sem-sessao' }", async () => {
    expect(await gateSessaoLojaAtivaPorId(null)).toEqual({ tipo: "sem-sessao" });
  });

  it("E2: sessão sem lojaAtivaId → { tipo: 'sem-loja-ativa', sessao }", async () => {
    const uid = await adminId();
    await prisma.sessao.create({
      data: { id: "t-la-sess-e2", usuarioId: uid, expiraEm: new Date(Date.now() + 60_000) },
    });
    const estado = await gateSessaoLojaAtivaPorId("t-la-sess-e2");
    expect(estado.tipo).toBe("sem-loja-ativa");
    if (estado.tipo === "sem-loja-ativa") {
      expect(estado.sessao.id).toBe("t-la-sess-e2");
    }
  });

  it("E3: sessão + lojaAtivaId válido → { tipo: 'ok', sessao, usuario, loja }", async () => {
    const uid = await adminId();
    await prisma.sessao.create({
      data: {
        id: "t-la-sess-e3",
        usuarioId: uid,
        lojaAtivaId: "loja-moscow",
        expiraEm: new Date(Date.now() + 60_000),
      },
    });
    const estado = await gateSessaoLojaAtivaPorId("t-la-sess-e3");
    expect(estado.tipo).toBe("ok");
    if (estado.tipo === "ok") {
      expect(estado.loja.id).toBe("loja-moscow");
      expect(estado.usuario.email).toBe(ADMIN_EMAIL);
    }
  });
});

describe("Super-admin global vê todas as lojas (B.2-T1b)", () => {
  it("F: super-admin com 1 loja no sistema → auto-select", async () => {
    await comApenasEstasLojasAtivas([LOJA_A], async () => {
      const loja = await selecionarLojaPorPadrao(USER_SA);
      expect(loja?.id).toBe(LOJA_A);
    });
  });

  it("G: super-admin com 2 lojas no sistema → lista as 2 (sem UsuarioLoja) → seletor", async () => {
    await comApenasEstasLojasAtivas([LOJA_A, LOJA_B], async () => {
      const lojas = await listarLojasDoUsuario(USER_SA);
      expect(lojas.map((l) => l.id)).toEqual([LOJA_A, LOJA_B]); // ordenado por nome

      // prova central: enxerga as 2 SEM nenhum vínculo UsuarioLoja
      const vinculos = await prisma.usuarioLoja.count({ where: { usuarioId: USER_SA } });
      expect(vinculos).toBe(0);

      // >1 loja → seletor (não auto-select)
      expect(await selecionarLojaPorPadrao(USER_SA)).toBeNull();
    });
  });

  it("H (segurança): vendedora SEM vínculo na loja NÃO consegue selecioná-la, mesmo existindo+ativa", async () => {
    // USER_VEND está vinculada só à LOJA_B; LOJA_A existe e está ativa.
    await prisma.loja.update({ where: { id: LOJA_A }, data: { ativo: true } });
    const sessao = await prisma.sessao.create({
      data: { id: "t-la-sess-h", usuarioId: USER_VEND, expiraEm: new Date(Date.now() + 60_000) },
    });
    await expect(definirLojaAtiva(sessao.id, LOJA_A, USER_VEND)).rejects.toThrow(
      /acesso negado/,
    );
    const inalterada = await prisma.sessao.findUnique({ where: { id: sessao.id } });
    expect(inalterada?.lojaAtivaId).toBeNull(); // isolamento preservado
  });
});
