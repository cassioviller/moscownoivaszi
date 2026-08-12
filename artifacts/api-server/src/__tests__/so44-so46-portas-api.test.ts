import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, leadsTable, lojasTable, perfisTable, usuariosLojasTable, usuariosTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  SENHA_TESTE,
  type Fixture,
} from "./helpers";
import { PERFIS_PADRAO } from "../lib/configuracao-inicial";
import { hashSenha } from "../lib/auth";

/**
 * B3 do plano do resto das sobras — as portas.
 *
 * Três achados que só se parecem por serem portas, e a diferença entre eles é
 * o ponto: **a mesma regra vale coisas diferentes conforme quem bate**.
 */
let f: Fixture;

beforeAll(async () => {
  f = await criarFixture();
});

afterAll(async () => {
  await limparFixture(f);
  await fecharPool();
});

/**
 * S-O44 — a S-O43 fechou o FORMULÁRIO da loja (máscara + `refine` no zod da
 * tela). A porta continuava aceitando qualquer coisa, e o sintoma é mudo:
 * `linkWhatsApp` devolve `null` e todos os botões de wa.me dela somem sem uma
 * palavra — a confirmação da prova, a fila "Falta procurar", a cobrança, o
 * rodapé do portal.
 */
describe("S-O44 — o WhatsApp que não vira link", () => {
  const TORTO = "1196222014"; // 10 dígitos com DDD 11 seria válido; este tem 10 sem DDD válido
  const CURTO = "96222";

  it("a porta da LOJA recusa o número curto, e a frase diz a consequência", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/leads`)
      .send({ noivaNome: "Noiva do Número Curto", whatsapp: CURTO });
    expect(r.status, "era 201 — entrava e apagava os botões dela em silêncio").toBe(422);
    expect(r.body.error).toBe("WHATSAPP_INVALIDO");
    expect(r.body.detalhe, "a frase diz o que se perde, não a regra dos dígitos").toMatch(
      /botões de WhatsApp dela não aparecem/i,
    );
  });

  it("o PATCH também recusa — corrigir o telefone é o que a Recepção ganhou", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ whatsapp: CURTO })
      .expect(422);
  });

  it("número bom passa, e vazio também — WhatsApp é opcional", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await agent
      .post(`/api/lojas/${f.lojaId}/leads`)
      .send({ noivaNome: "Noiva Certa", whatsapp: "(11) 96222-0147" })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/leads`)
      .send({ noivaNome: "Noiva Sem WhatsApp" })
      .expect(201);
  });

  /**
   * **A captação pública NÃO recusa, e é decisão.** Recusar ali custaria o
   * CONTATO INTEIRO em vez de um botão: a noiva preenche o formulário do site,
   * erra um dígito, e a loja perde a venda para não perder um link. Ela entra,
   * e a ficha se marca sozinha — o selo é derivado do número.
   */
  it("a CAPTAÇÃO aceita o número torto — perder o lead é pior que perder o botão", async () => {
    // O token de captação é gerido sob `admin` (`captacao.ts:91`).
    const admin = await loginComLoja(f.superAdminEmail, f.lojaId);
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const tk = await admin.post(`/api/lojas/${f.lojaId}/captacao/token`).send({}).expect(200);

    const r = await agent
      .post(`/api/captacao/leads?token=${tk.body.token}`)
      .send({ noivaNome: "Noiva do Site", whatsapp: CURTO, consentimento: true });
    expect(r.status, "recusar aqui perderia a noiva inteira").toBe(201);

    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, r.body.id));
    expect(lead?.whatsapp, "o número entra como ela digitou — a loja corrige depois").toBe(CURTO);
    void TORTO;
  });
});

/**
 * S-O46 — `DELETE /leads/:leadId` não declarava ação, então o guard de prefixo
 * derivava `editar` de `leads`. O E172 deu `leads: TUDO` à Recepção para ela
 * corrigir o telefone que digitou (S-O41), e com isso ela passou a poder apagar
 * a ficha — cascata em atendimento, orçamento, interesse e registro de
 * cobrança. Medido: **404**, ou seja, ela atravessava o gate.
 */
describe("S-O46 — apagar a noiva é ato de administração", () => {
  let recepcaoEmail: string;
  let perfilId: string;

  beforeAll(async () => {
    const padrao = PERFIS_PADRAO.find((p) => p.nome === "Recepção")!;
    perfilId = randomUUID();
    const usuarioId = randomUUID();
    recepcaoEmail = `recepcao-so46-${randomUUID().slice(0, 8)}@teste.local`;
    await db
      .insert(perfisTable)
      .values({ id: perfilId, nome: `Recepção S-O46 ${perfilId.slice(0, 6)}`, acessosModulos: padrao.acessos });
    await db.insert(usuariosTable).values({
      id: usuarioId,
      nome: "Recepção S-O46",
      email: recepcaoEmail,
      senhaHash: await hashSenha(SENHA_TESTE),
    });
    await db.insert(usuariosLojasTable).values({ usuarioId, lojaId: f.lojaId, perfilId });
  });

  afterAll(async () => {
    // O vínculo segura o perfil (`usuarios_lojas_perfil_id_perfis_id_fk`) —
    // some antes dele, senão a faxina estoura com 23503.
    await db.delete(usuariosLojasTable).where(eq(usuariosLojasTable.perfilId, perfilId));
    await db.delete(perfisTable).where(inArray(perfisTable.id, [perfilId]));
  });

  it("a Recepção é barrada — era 404, ou seja, ela passava", async () => {
    const agent = await loginComLoja(recepcaoEmail, f.lojaId);
    const lead = await criarLead(f);
    const r = await agent.delete(`/api/lojas/${f.lojaId}/leads/${lead.id}`);
    expect(r.status).toBe(403);
    expect(r.body.modulo).toBe("admin");

    const [ainda] = await db.select().from(leadsTable).where(eq(leadsTable.id, lead.id));
    expect(ainda, "a recusa não pode ter apagado nada").toBeDefined();
  });

  it("quem administra continua apagando", async () => {
    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    const lead = await criarLead(f);
    await agent.delete(`/api/lojas/${f.lojaId}/leads/${lead.id}`).expect(204);
    const [sumiu] = await db.select().from(leadsTable).where(eq(leadsTable.id, lead.id));
    expect(sumiu).toBeUndefined();
  });
});

/**
 * S-O39 (decisão da dona, 2026-08-12) — o link durava **sete dias**, o prazo do
 * CONVITE DE EQUIPE, enquanto a proposta vale trinta. A noiva que abria o
 * WhatsApp no décimo dia lia "link expirado" numa proposta de pé.
 */
describe("S-O39 — o link dura o que a proposta durar", () => {
  it("o link expira junto com a validade, não em 7 dias", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const orc = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos`)
      .send({ leadId: lead.id })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/itens`)
      .send({ tipo: "SERVICO", descricao: "Vestido", valorUnitario: 5000, quantidade: 1 })
      .expect(201);

    const link = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/link`)
      .send({})
      .expect(200);

    const detalhe = await agent.get(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}`).expect(200);
    const validade = new Date(detalhe.body.validade);
    const expira = new Date(link.body.expiraEm);

    expect(
      expira.getTime(),
      "o link morria em 7 dias sobre uma proposta de 30 — o prazo vinha do convite de equipe",
    ).toBe(validade.getTime());

    const dias = Math.round((expira.getTime() - Date.now()) / (24 * 3600 * 1000));
    expect(dias, "trinta dias, a régua da casa — não sete").toBeGreaterThan(20);
  });

  it("proposta que vence hoje ainda dá um dia de link — o piso", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const orc = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos`)
      .send({ leadId: lead.id, validade: new Date(Date.now() + 60_000).toISOString() })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/itens`)
      .send({ tipo: "SERVICO", descricao: "Vestido", valorUnitario: 5000, quantidade: 1 })
      .expect(201);

    const link = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/link`)
      .send({})
      .expect(200);
    const expira = new Date(link.body.expiraEm).getTime();
    expect(
      expira - Date.now(),
      "o link tem de durar o dia em que a proposta ainda vale, não morrer no instante em que nasceu",
    ).toBeGreaterThan(23 * 3600 * 1000);
  });
});
