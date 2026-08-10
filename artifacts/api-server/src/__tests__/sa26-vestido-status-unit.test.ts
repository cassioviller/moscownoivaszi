import { describe, expect, it } from "vitest";
import { SetDisponibilidadeBody, UpdateVestidoBody, VestidoStatus } from "@workspace/api-zod";

/**
 * S-A26 — a régua de estado da peça agora está ESCRITA no contrato.
 *
 * Antes, `VestidoUpdate.status` era `{ type: string }` e `vestidos.ts` decidia
 * INATIVO por `status !== "ativo"`: um PATCH com `"Ativo"` (ou qualquer grafia)
 * tirava a peça do acervo em silêncio — ela respondia `disponivel: false` com
 * motivo "Vestido inativo" e sumia da grade, sem que nada tivesse sido
 * recusado. Medido antes do enum: só dois valores existem no sistema inteiro
 * ("ativo" no default do banco, "ativo"/"inativo" nas telas e nos testes).
 *
 * Estes testes são a borda pura (zod gerado do openapi.yaml, sem banco). O
 * caminho vivo — PATCH numa rota com banco devolvendo 400 — é dos testes de
 * API/E2E, que rodam com a régua do orquestrador (regra 25).
 */
describe("S-A26 — VestidoUpdate.status é enum fechado, não string livre", () => {
  it("recusa a grafia que antes inativava em silêncio", () => {
    for (const grafia of ["Ativo", "ATIVO", "Inativo", " ativo", "ativa"]) {
      const parsed = UpdateVestidoBody.safeParse({ status: grafia });
      expect(parsed.success, `"${grafia}" tem de ser 400 na borda, não INATIVO em silêncio`).toBe(false);
    }
  });

  it("aceita exatamente os dois valores que o sistema usa", () => {
    expect(UpdateVestidoBody.safeParse({ status: "ativo" }).success).toBe(true);
    expect(UpdateVestidoBody.safeParse({ status: "inativo" }).success).toBe(true);
    // E o enum gerado é a MESMA grafia que o banco defaulta — é ele que
    // `vestidos.ts` passa a usar para decidir INATIVO.
    expect(VestidoStatus.ativo).toBe("ativo");
    expect(VestidoStatus.inativo).toBe("inativo");
  });
});

/**
 * S-A7 — o zod agora guarda o piso da duração de prova.
 *
 * `provaDuracao` está em SLOTS de 30 min (2 = 60 min) e o contrato aceitava
 * `0`: só os `Math.max(1, …)` de leitura impediam a janela de conflito de
 * colapsar. O `minimum: 1` no openapi.yaml vira `.min(1)` no gerado, e o zero
 * morre na borda em vez de depender de cada leitor se lembrar do clamp.
 */
describe("S-A7 — provaDuracao tem mínimo 1 slot na borda", () => {
  it("recusa 0 e negativo", () => {
    expect(SetDisponibilidadeBody.safeParse({ provaDuracao: 0 }).success).toBe(false);
    expect(SetDisponibilidadeBody.safeParse({ provaDuracao: -1 }).success).toBe(false);
  });

  it("aceita 1 slot (30 min) e o default de fábrica, 2 (60 min)", () => {
    expect(SetDisponibilidadeBody.safeParse({ provaDuracao: 1 }).success).toBe(true);
    expect(SetDisponibilidadeBody.safeParse({ provaDuracao: 2 }).success).toBe(true);
  });
});
