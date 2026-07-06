import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  SESSAO_TTL_MS,
  criarSessao,
  lerSessao,
  destruirSessao,
} from "@/lib/auth/sessao";

const ADMIN_EMAIL = "admin@moscownoivas.local";

async function adminId(): Promise<string> {
  const u = await prisma.usuario.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!u) throw new Error("Seed do admin não rodou — `npm run db:seed` antes dos testes.");
  return u.id;
}

describe("sessao — CRUD + TTL + cleanup", () => {
  beforeEach(async () => {
    const id = await adminId();
    await prisma.sessao.deleteMany({ where: { usuarioId: id } });
  });

  afterAll(async () => {
    const id = await adminId();
    await prisma.sessao.deleteMany({ where: { usuarioId: id } });
    await prisma.$disconnect();
  });

  it("SESSAO_TTL_MS é 8 horas em ms", () => {
    expect(SESSAO_TTL_MS).toBe(8 * 60 * 60 * 1000);
  });

  it("criarSessao insere uma sessão com id de 32 bytes (base64url ~43 chars) e expiraEm = agora + 8h", async () => {
    const id = await adminId();
    const antes = Date.now();
    const sessao = await criarSessao(id);
    const depois = Date.now();

    expect(sessao.id).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes em base64url, sem padding
    expect(sessao.usuarioId).toBe(id);

    const delta = sessao.expiraEm.getTime() - antes;
    expect(delta).toBeGreaterThanOrEqual(SESSAO_TTL_MS - 1000);
    expect(delta).toBeLessThanOrEqual(SESSAO_TTL_MS + (depois - antes) + 1000);
  });

  it("lerSessao retorna sessão+usuário para uma sessão válida", async () => {
    const id = await adminId();
    const criada = await criarSessao(id);
    const lida = await lerSessao(criada.id);
    expect(lida).not.toBeNull();
    expect(lida!.sessao.id).toBe(criada.id);
    expect(lida!.usuario.email).toBe(ADMIN_EMAIL);
  });

  it("lerSessao retorna null para id inexistente", async () => {
    expect(await lerSessao("naoexiste")).toBeNull();
  });

  it("lerSessao retorna null para sessão expirada (não a apaga)", async () => {
    const id = await adminId();
    const expirada = await prisma.sessao.create({
      data: { id: "sess-expirada", usuarioId: id, expiraEm: new Date(Date.now() - 1000) },
    });
    expect(await lerSessao(expirada.id)).toBeNull();
    // continua no banco — quem limpa é o cleanup lazy no próximo login
    const ainda = await prisma.sessao.findUnique({ where: { id: expirada.id } });
    expect(ainda).not.toBeNull();
  });

  it("lerSessao retorna null se o usuário foi desativado", async () => {
    const id = await adminId();
    const criada = await criarSessao(id);
    await prisma.usuario.update({ where: { id }, data: { ativo: false } });
    try {
      expect(await lerSessao(criada.id)).toBeNull();
    } finally {
      await prisma.usuario.update({ where: { id }, data: { ativo: true } });
    }
  });

  it("destruirSessao remove a linha", async () => {
    const id = await adminId();
    const criada = await criarSessao(id);
    await destruirSessao(criada.id);
    expect(await prisma.sessao.findUnique({ where: { id: criada.id } })).toBeNull();
  });

  it("destruirSessao é idempotente (não lança quando id não existe)", async () => {
    await expect(destruirSessao("naoexiste")).resolves.toBeUndefined();
  });

  it("criarSessao limpa sessões expiradas do mesmo usuário (cleanup lazy)", async () => {
    const id = await adminId();
    await prisma.sessao.create({
      data: { id: "sess-velha-1", usuarioId: id, expiraEm: new Date(Date.now() - 1000) },
    });
    await prisma.sessao.create({
      data: { id: "sess-velha-2", usuarioId: id, expiraEm: new Date(Date.now() - 10_000) },
    });
    const viva = await prisma.sessao.create({
      data: { id: "sess-viva", usuarioId: id, expiraEm: new Date(Date.now() + 60_000) },
    });

    await criarSessao(id);

    expect(await prisma.sessao.findUnique({ where: { id: "sess-velha-1" } })).toBeNull();
    expect(await prisma.sessao.findUnique({ where: { id: "sess-velha-2" } })).toBeNull();
    // a sessão viva NÃO é removida (apenas as expiradas)
    expect(await prisma.sessao.findUnique({ where: { id: viva.id } })).not.toBeNull();
  });
});
