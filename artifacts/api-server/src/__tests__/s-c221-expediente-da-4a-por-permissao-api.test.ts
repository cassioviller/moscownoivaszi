import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, perfisTable, usuariosTable, usuariosLojasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashSenha } from "../lib/auth";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  SENHA_TESTE,
  type Fixture,
} from "./helpers";

/**
 * S-C221 — o expediente da cláusula 4ª muda o que o CONTRATO promete, e quem
 * decide sobre contrato é `contratos.editar`.
 *
 * Medido antes do conserto: o `PUT /disponibilidade/regras` inteiro vivia sob
 * o `requireModulo("agenda")` do prefixo (`agenda.ts:258`), e PUT deriva
 * `editar` — então a Costureira do seed (`agenda: TUDO, contratos: NADA`,
 * `configuracao-inicial.ts:159`) e a Recepção (`:153`, mesmo par) editavam o
 * expediente de retirada/devolução que o `POST /contratos` usa para RECUSAR
 * datas (E222). Quem não pode fechar nem editar contrato mudava a régua que
 * o contrato aplica.
 *
 * O fecho é PELA PERMISSÃO, não por perfil: o corpo que traz qualquer campo
 * da 4ª (`retiradaAberturaMinutos`, `retiradaFechamentoMinutos`,
 * `retiradaFechamentoSabadoMinutos`, `retiradaDias`) exige TAMBÉM
 * `contratos.editar` — a mesma pergunta do middleware, feita com as mesmas
 * funções. O expediente de ATENDIMENTO continua sendo da agenda: a Recepção
 * segue configurando as provas, que é o trabalho dela.
 *
 * VERMELHO ANTES: `expected 403 "Forbidden", got 200 "OK"` — a costureira
 * gravava `retiradaFechamentoMinutos: 600` e o expediente do contrato
 * encolhia para as 10h da manhã.
 */
describe("S-C221 — quem muda o expediente da 4ª precisa poder editar contrato", () => {
  let f: Fixture;
  let costureira: Awaited<ReturnType<typeof loginComLoja>>;
  let vendedora: Awaited<ReturnType<typeof loginComLoja>>;
  const perfilCostureiraId = randomUUID();
  const costureiraId = randomUUID();
  const costureiraEmail = `costureira-${randomUUID().slice(0, 8)}@teste.local`;

  beforeAll(async () => {
    f = await criarFixture();
    // O perfil Costureira do seed, na letra (`configuracao-inicial.ts:159`):
    // agenda inteira, vestidos só-ver, contratos NADA.
    const TUDO = { ver: true, criar: true, editar: true };
    const SO_VER = { ver: true, criar: false, editar: false };
    await db.insert(perfisTable).values({
      id: perfilCostureiraId,
      nome: `Perfil Costureira Teste ${costureiraEmail.slice(0, 8)}`,
      acessosModulos: { agenda: TUDO, vestidos: SO_VER },
    });
    await db.insert(usuariosTable).values({
      id: costureiraId,
      nome: "Costureira Teste",
      email: costureiraEmail,
      senhaHash: await hashSenha(SENHA_TESTE),
    });
    await db.insert(usuariosLojasTable).values({
      usuarioId: costureiraId,
      lojaId: f.lojaId,
      perfilId: perfilCostureiraId,
    });
    costureira = await loginComLoja(costureiraEmail, f.lojaId);
    vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await db.delete(perfisTable).where(eq(perfisTable.id, perfilCostureiraId));
    await fecharPool();
  });

  const put = (agente: typeof costureira, corpo: Record<string, unknown>) =>
    agente.put(`/api/lojas/${f.lojaId}/disponibilidade/regras`).send(corpo);

  it("a costureira segue dona do expediente de ATENDIMENTO — agenda é dela", async () => {
    await put(costureira, { atendimentoAberturaHora: 10, atendimentoFechamentoHora: 20 }).expect(200);
  });

  it("qualquer campo da 4ª sem contratos.editar é 403 — cada um dos quatro", async () => {
    const corpos: Record<string, unknown>[] = [
      { retiradaAberturaMinutos: 600 },
      { retiradaFechamentoMinutos: 1080 },
      { retiradaFechamentoSabadoMinutos: 900 },
      { retiradaDias: [2, 3, 4] },
    ];
    for (const corpo of corpos) {
      const r = await put(costureira, corpo).expect(403);
      expect(r.body.error).toBe("ACESSO_NEGADO_MODULO");
      expect(r.body.modulo).toBe("contratos");
      expect(r.body.acao).toBe("editar");
    }
  });

  it("um corpo misto também recusa inteiro — não grava a metade da agenda e cala a outra", async () => {
    const antes = await costureira.get(`/api/lojas/${f.lojaId}/disponibilidade/regras`).expect(200);
    await put(costureira, {
      atendimentoAberturaHora: 8,
      retiradaFechamentoMinutos: 600,
    }).expect(403);
    const depois = await costureira.get(`/api/lojas/${f.lojaId}/disponibilidade/regras`).expect(200);
    expect(depois.body.atendimentoAberturaHora).toBe(antes.body.atendimentoAberturaHora);
  });

  it("quem tem contratos.editar muda a 4ª — e o valor gravado é o mandado", async () => {
    await put(vendedora, {
      retiradaAberturaMinutos: 600,
      retiradaFechamentoMinutos: 1140,
      retiradaFechamentoSabadoMinutos: 1080,
      retiradaDias: [2, 3, 4, 5, 6],
    }).expect(200);
    const r = await vendedora.get(`/api/lojas/${f.lojaId}/disponibilidade/regras`).expect(200);
    expect(r.body.retiradaAberturaMinutos).toBe(600);
  });
});
