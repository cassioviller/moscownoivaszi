import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, lojasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * S17 — a dona passa a editar os dados da PRÓPRIA loja.
 *
 * `endereco` e `telefone` de `lojas` só tinham formulário no console de
 * SUPERADMIN (`pages/admin/index.tsx`), que é rota top-level fora de
 * `/loja/:lojaId` e com gate próprio. Trocar o telefone da loja virava chamado
 * para quem tem o console.
 *
 * E não são dados decorativos. Três lugares dependem deles, e o terceiro é o que
 * ninguém tinha visto:
 *
 * 1. o rodapé do portal da noiva (F35);
 * 2. a linha "Endereço:" da mensagem de confirmação do atendimento;
 * 3. `linkWhatsApp` devolve **null** para telefone fora de 10–13 dígitos, e o
 *    botão do portal simplesmente não é renderizado — **telefone ERRADO degrada
 *    tão calado quanto telefone vazio.**
 *
 * A rota é escopada por loja e gateada por `admin.editar`, que é o módulo de
 * quem administra a loja: a Proprietária tem, a Vendedora não. E `ativo` fica
 * de FORA de propósito — desativar a própria loja é ato de superadmin, e é a
 * única coisa deste formulário que não teria caminho de volta pela tela.
 */
describe("S17 — os dados da loja são da dona, não do console", () => {
  let f: Fixture;
  let dona: Awaited<ReturnType<typeof loginComLoja>>;
  let vendedora: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    dona = await loginComLoja(f.superAdminEmail, f.lojaId);
    vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const lojaNoBanco = async () =>
    (await db.select().from(lojasTable).where(eq(lojasTable.id, f.lojaId)))[0]!;

  it("a dona edita endereço e telefone sem passar pelo console de superadmin", async () => {
    const r = await dona
      .patch(`/api/lojas/${f.lojaId}/dados`)
      .send({ endereco: "Rua das Noivas, 123 — São Paulo", telefone: "(11) 98888-7777" })
      .expect(200);

    expect(r.body.endereco).toBe("Rua das Noivas, 123 — São Paulo");
    expect(r.body.telefone).toBe("(11) 98888-7777");
    const loja = await lojaNoBanco();
    expect(loja.endereco).toBe("Rua das Noivas, 123 — São Paulo");
  });

  it("o campo ausente não é apagado — editar o telefone não some com o endereço", async () => {
    await dona
      .patch(`/api/lojas/${f.lojaId}/dados`)
      .send({ endereco: "Alameda Santos, 45", telefone: "(11) 3333-4444" })
      .expect(200);

    const r = await dona.patch(`/api/lojas/${f.lojaId}/dados`).send({ telefone: "(11) 5555-6666" }).expect(200);
    expect(r.body.telefone).toBe("(11) 5555-6666");
    expect(r.body.endereco).toBe("Alameda Santos, 45");
  });

  it("telefone que não vira link de WhatsApp é RECUSADO, em vez de sumir com o botão", async () => {
    // 8 dígitos: `linkWhatsApp` devolveria null e o botão do portal não seria
    // renderizado — sem erro, sem aviso, sem ninguém saber. É o silêncio que
    // esta guarda troca por uma frase.
    const r = await dona.patch(`/api/lojas/${f.lojaId}/dados`).send({ telefone: "3333-4444" }).expect(422);
    expect(r.body.error).toBe("TELEFONE_SEM_WHATSAPP");
    expect(r.body.detalhe).toMatch(/DDD/);

    // E o que estava lá não foi tocado.
    expect((await lojaNoBanco()).telefone).toBe("(11) 5555-6666");
  });

  it("telefone VAZIO continua permitido — a loja pode não ter WhatsApp", async () => {
    const r = await dona.patch(`/api/lojas/${f.lojaId}/dados`).send({ telefone: "" }).expect(200);
    expect(r.body.telefone).toBeNull();
  });

  it("a vendedora não administra a loja — 403, e nada muda", async () => {
    await vendedora
      .patch(`/api/lojas/${f.lojaId}/dados`)
      .send({ endereco: "Rua da Vendedora, 1" })
      .expect(403);
    expect((await lojaNoBanco()).endereco).toBe("Alameda Santos, 45");
  });

  it("nem a dona edita a loja de OUTRA pessoa — o escopo é o da sessão", async () => {
    const outra = await criarFixture();
    await dona
      .patch(`/api/lojas/${outra.lojaId}/dados`)
      .send({ endereco: "Rua Alheia, 9" })
      .expect(403);
    await limparFixture(outra);
  });

  /**
   * O zod gerado ESTRIPA o campo desconhecido em vez de recusar — medido: sem
   * a guarda explícita, `{ ativo: false }` respondia 200 e não desativava nada.
   * Quem chamou acharia que desativou a loja.
   */
  it("`ativo` não entra por aqui — desativar a própria loja é ato de superadmin", async () => {
    const r = await dona.patch(`/api/lojas/${f.lojaId}/dados`).send({ ativo: false }).expect(400);
    expect(r.body.error).toBe("CAMPO_NAO_EDITAVEL");
    expect((await lojaNoBanco()).ativo).toBe(true);
  });

  it("salvar sem mexer em nada diz isso, em vez de estourar no driver", async () => {
    const r = await dona.patch(`/api/lojas/${f.lojaId}/dados`).send({}).expect(400);
    expect(r.body.error).toBe("NADA_PARA_ALTERAR");
  });
});
