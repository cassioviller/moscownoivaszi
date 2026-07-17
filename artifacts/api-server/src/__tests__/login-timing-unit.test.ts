import { describe, expect, it } from "vitest";
import { compararSenhaConstante, hashSenha } from "../lib/auth";

/**
 * Login em tempo constante quanto à existência do usuário (I4).
 *
 * Sem isto, o 401 imediato para e-mail inexistente denunciava quais e-mails têm
 * conta. A defesa: rodar bcrypt.compare SEMPRE, contra um dummy quando não há
 * usuário. Estes testes provam que a função não curto-circuita no hash nulo.
 */
describe("compararSenhaConstante", () => {
  it("hash nulo (sem usuário) devolve false, mas roda bcrypt de verdade", async () => {
    const t0 = performance.now();
    const ok = await compararSenhaConstante("qualquer-senha", null);
    const dt = performance.now() - t0;

    expect(ok).toBe(false);
    // bcrypt custo 12 leva dezenas/centenas de ms. Um curto-circuito seria <1ms.
    // Piso conservador de 20ms: prova que o compare rodou, sem ser flaky.
    expect(dt).toBeGreaterThan(20);
  });

  it("senha certa contra hash real é true; errada é false", async () => {
    const hash = await hashSenha("segredo-correto");
    expect(await compararSenhaConstante("segredo-correto", hash)).toBe(true);
    expect(await compararSenhaConstante("errada", hash)).toBe(false);
  });

  it("usuário inexistente e senha errada gastam tempo comparável (sem denúncia por timing)", async () => {
    const hash = await hashSenha("a-senha");
    const medir = async (fn: () => Promise<unknown>) => {
      const t = performance.now();
      await fn();
      return performance.now() - t;
    };
    const semUsuario = await medir(() => compararSenhaConstante("tentativa", null));
    const senhaErrada = await medir(() => compararSenhaConstante("tentativa", hash));
    // Ambos rodam um bcrypt.compare de custo 12: a razão fica perto de 1. Margem
    // larga (0,25–4) para não flakar sob carga de CI, mas ainda pega um
    // curto-circuito (que daria razão perto de 0 ou infinito).
    const razao = semUsuario / senhaErrada;
    expect(razao).toBeGreaterThan(0.25);
    expect(razao).toBeLessThan(4);
  });
});
