import { afterAll, describe, expect, it } from "vitest";
import { db, perfisTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { criarFixture, fecharPool, limparFixture } from "./helpers";

/**
 * S-D26 — os perfis moram em módulo × ação, no banco E na fonte.
 *
 * O formato plano ({ leads: true }) morreu no E147, mas `normalizarAcessos` o
 * traduz para sempre em leitura — e uma linha não migrada nunca aparece num
 * teste de comportamento. O que esta sonda guarda é o DADO: a conferência de
 * 2026-08-05 mediu 37 de 40 perfis planos, a remedição de 2026-08-07 mediu
 * **45 de 48**, e a diferença era a própria doença — a fixture desta suíte
 * escrevia o formato plano a cada execução, então qualquer UPDATE no banco
 * seria desfeito pela passada seguinte. A migração
 * `2026-08-07-sd26-perfis-para-modulo-x-acao.sql` converteu as 48; a fixture
 * passou a escrever módulo × ação; esta sonda reprova quem regredir qualquer
 * uma das duas metades.
 */
describe("S-D26 — perfis em módulo × ação", () => {
  afterAll(async () => {
    await fecharPool();
  });

  it("a fixture escreve módulo × ação — era ela que recriava o formato plano a cada suíte", async () => {
    const f = await criarFixture();
    try {
      const linhas = await db
        .select({ nome: perfisTable.nome, acessos: perfisTable.acessosModulos })
        .from(perfisTable)
        .where(inArray(perfisTable.id, [f.perfilId, f.perfilAdminId]));
      expect(linhas).toHaveLength(2);
      for (const p of linhas) {
        for (const [modulo, valor] of Object.entries(p.acessos as Record<string, unknown>)) {
          expect(typeof valor, `${p.nome} guarda ${modulo} plano`).toBe("object");
        }
      }
    } finally {
      await limparFixture(f);
    }
  });

  it("nenhum perfil do banco guarda o formato plano — a migração de 2026-08-07 converteu os 48", async () => {
    const linhas = await db
      .select({ nome: perfisTable.nome, acessos: perfisTable.acessosModulos })
      .from(perfisTable);
    // Conjunto vazio aprovaria tudo em silêncio: os 4 perfis do seed existem
    // em qualquer banco que já subiu uma vez.
    expect(linhas.length).toBeGreaterThanOrEqual(4);
    const planos = linhas.filter((p) =>
      Object.values(p.acessos as Record<string, unknown>).some((v) => typeof v === "boolean"),
    );
    expect(planos.map((p) => p.nome)).toEqual([]);
  });
});
