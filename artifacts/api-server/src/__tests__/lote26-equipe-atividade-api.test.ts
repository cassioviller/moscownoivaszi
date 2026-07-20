import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, auditLogTable } from "@workspace/db";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Log de atividade da equipe (E18): último acesso por membro (carimbo de
 * login — sessão não serve de fonte) + contagem de ações sensíveis em 30 dias
 * + feed do audit_log. Gate admin, o mesmo da gestão de equipe.
 */

describe("Equipe — atividade (E18)", () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    admin = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const buscar = () => admin.get(`/api/lojas/${f.lojaId}/equipe/atividade`);

  it("gate: perfil sem admin leva 403", async () => {
    const vend = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await vend.get(`/api/lojas/${f.lojaId}/equipe/atividade`).expect(403);
  });

  it("o login carimba o último acesso do membro", async () => {
    // A vendedora acabou de logar no teste do gate — o carimbo tem que existir.
    const res = await buscar().expect(200);
    const vendedora = res.body.membros.find(
      (m: { usuarioId: string }) => m.usuarioId === f.vendedoraId,
    );
    expect(vendedora).toBeDefined();
    expect(vendedora.ultimoAcesso).not.toBeNull();
    expect(Date.now() - new Date(vendedora.ultimoAcesso).getTime()).toBeLessThan(60_000);
    expect(vendedora.perfilNome).toContain("Perfil Teste");
  });

  it("acoes30d conta só a janela; o feed traz as linhas recentes", async () => {
    const recente = {
      id: randomUUID(),
      lojaId: f.lojaId,
      usuarioId: f.vendedoraId,
      usuarioNome: "Vendedora Teste",
      acao: "PARCELA_RECEBIDA",
      entidade: "parcela",
      entidadeId: randomUUID(),
      detalhe: { valorRecebido: 500 },
    };
    await db.insert(auditLogTable).values([
      recente,
      {
        // Fora da janela de 30 dias: aparece no feed (últimos 50), não na conta.
        ...recente,
        id: randomUUID(),
        acao: "CONTA_PAGA",
        entidade: "conta_pagar",
        criadoEm: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      },
    ]);

    const res = await buscar().expect(200);
    const vendedora = res.body.membros.find(
      (m: { usuarioId: string }) => m.usuarioId === f.vendedoraId,
    );
    expect(vendedora.acoes30d).toBe(1);

    const acoes = res.body.eventos.map((e: { acao: string }) => e.acao);
    expect(acoes).toContain("PARCELA_RECEBIDA");
    expect(acoes).toContain("CONTA_PAGA");
  });
});
