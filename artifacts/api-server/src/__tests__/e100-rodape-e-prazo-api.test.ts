import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { db, lojasTable, portalTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

const MS_POR_DIA = 86_400_000;

/**
 * Dias a partir de AGORA — e não o `dataFutura` das outras fixtures, que conta
 * a partir de uma data-base de casamento em 2027. O assunto aqui é o prazo
 * relativo ao relógio: com `dataFutura(-1)` o "portal vencido" deste arquivo
 * seria 2027-09-14, ou seja, vivíssimo, e dois testes passariam sem tocar no
 * que dizem cobrir.
 */
const emDias = (n: number) => new Date(Date.now() + n * MS_POR_DIA);

/**
 * E100 parte 3 — o caminho de volta (F35) e o prazo que não morre nas costas
 * de ninguém (F38).
 *
 * O portal mandava "falar com a sua vendedora" em três lugares e não trazia um
 * telefone; e o link durava 30 dias contados da GERAÇÃO, num noivado que dura
 * um ano — quando ele vencia, a mensagem de cobrança do E84 passava a sair sem
 * o link, calada.
 */
describe("E100 — o rodapé da loja e a renovação do prazo", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  const publico = () => request(app);

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Uma noiva com portal vivo. Devolve o token e o id da linha. */
  async function noivaComPortal() {
    const lead = await criarLead(f);
    const r = await agent.post(`/api/lojas/${f.lojaId}/leads/${lead.id}/portal`).expect(201);
    return { lead, token: r.body.token as string };
  }

  async function linhaDoPortal(token: string) {
    const [linha] = await db
      .select()
      .from(portalTokensTable)
      .where(eq(portalTokensTable.token, token));
    return linha;
  }

  // ── F35: o caminho de volta ──

  it("o endereço e o telefone da LOJA chegam à noiva", async () => {
    await db
      .update(lojasTable)
      .set({ endereco: "Rua das Noivas, 100 — Moema", telefone: "11987654321" })
      .where(eq(lojasTable.id, f.lojaId));
    const { token } = await noivaComPortal();

    const r = await publico().get(`/api/portal?token=${token}`).expect(200);

    expect(r.body.lojaEndereco).toBe("Rua das Noivas, 100 — Moema");
    expect(r.body.lojaTelefone).toBe("11987654321");
  });

  it("loja sem cadastro devolve os dois nulos — o rodapé decide, o payload não mente", async () => {
    await db
      .update(lojasTable)
      .set({ endereco: null, telefone: null })
      .where(eq(lojasTable.id, f.lojaId));
    const { token } = await noivaComPortal();

    const r = await publico().get(`/api/portal?token=${token}`).expect(200);

    expect(r.body.lojaEndereco).toBeNull();
    expect(r.body.lojaTelefone).toBeNull();
  });

  /**
   * Cuidado (a) do épico: **cada campo novo no payload é superfície nova**, e
   * este é um link público com dado financeiro dentro. O teste fixa a lista
   * INTEIRA de chaves de primeiro nível para que acrescentar uma seja uma
   * decisão, não um efeito colateral de um `select` que cresceu.
   *
   * Ele cobre a raiz, e só ela — o que está dentro de `orcamento` e de
   * `lookbook` é contrato do E13/E21 e tem os testes de lá. (Lição do D15,
   * fechado três vezes: o nome do teste não promete mais do que ele olha.)
   *
   * **Ele já cobrou uma vez, e funcionou.** A parte 4 acrescentou `contrato`
   * (F21) e `vestido` (F39), e este teste ficou vermelho antes de qualquer
   * outro — que é exatamente o pedido para pensar duas vezes. As duas entraram
   * por decisão, e as guardas do que sai dentro delas estão em
   * `e100-contrato-e-vestido-api.test.ts`.
   */
  it("a RAIZ do payload público tem exatamente as chaves declaradas — nada de pessoa da loja", async () => {
    const { token } = await noivaComPortal();

    const r = await publico().get(`/api/portal?token=${token}`).expect(200);

    expect(Object.keys(r.body).sort()).toEqual(
      [
        "contrato",
        "vestido",
        "lojaEndereco",
        "lojaNome",
        "lojaTelefone",
        "lookbook",
        "noivaNome",
        "orcamento",
        "parcelas",
        "provas",
        "resumoPagamento",
      ].sort(),
    );
  });

  // ── F38: o prazo renova no uso, e só no uso ──

  it("abrir o portal empurra o vencimento para 30 dias — o link de quem usa não morre", async () => {
    const { token } = await noivaComPortal();
    // A véspera do fim: gerado há 29 dias, um dia de vida pela regra antiga.
    await db
      .update(portalTokensTable)
      .set({ expiraEm: emDias(1) })
      .where(eq(portalTokensTable.token, token));

    await publico().get(`/api/portal?token=${token}`).expect(200);

    const depois = await linhaDoPortal(token);
    const diasQueFaltam = (depois.expiraEm.getTime() - Date.now()) / MS_POR_DIA;
    // ANTES desta parte: 1 dia — a abertura só mexia em `ultimoAcessoEm`. A
    // faixa fechada é o que separa "renovou" de "estava longe o bastante".
    expect(diasQueFaltam).toBeGreaterThan(29);
    expect(diasQueFaltam).toBeLessThan(31);
    expect(depois.ultimoAcessoEm).not.toBeNull();
  });

  it("renovar NÃO ressuscita: o portal vencido responde 410 e o prazo não anda", async () => {
    const { token } = await noivaComPortal();
    const morreuEm = emDias(-1);
    await db
      .update(portalTokensTable)
      .set({ expiraEm: morreuEm })
      .where(eq(portalTokensTable.token, token));

    await publico().get(`/api/portal?token=${token}`).expect(410);

    const depois = await linhaDoPortal(token);
    expect(depois.expiraEm.getTime()).toBe(morreuEm.getTime());
  });

  it("revogado continua 404 e o prazo não anda — matar o link é decisão da loja", async () => {
    const { lead, token } = await noivaComPortal();
    const antes = await linhaDoPortal(token);
    await agent.delete(`/api/lojas/${f.lojaId}/leads/${lead.id}/portal`).expect(204);

    await publico().get(`/api/portal?token=${token}`).expect(404);

    const depois = await linhaDoPortal(token);
    expect(depois.expiraEm.getTime()).toBe(antes.expiraEm.getTime());
  });

  /**
   * A janela passa a ser de INATIVIDADE, e é isso que mantém de pé a decisão de
   * segurança do `replit.md`: o link de quem parou de usar continua morrendo
   * sozinho, no mesmo prazo de sempre.
   */
  it("quem nunca abre morre no prazo de sempre — a janela é de inatividade, não vitalícia", async () => {
    const { token } = await noivaComPortal();
    await db
      .update(portalTokensTable)
      .set({ expiraEm: emDias(-1), ultimoAcessoEm: null })
      .where(eq(portalTokensTable.token, token));

    await publico().get(`/api/portal?token=${token}`).expect(410);
  });
});
