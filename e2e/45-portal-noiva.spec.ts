import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  orcamentosTable,
  orcamentoItensTable,
  portalTokensTable,
  atendimentosTable,
  cabinesTable,
} from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E81 (fiscal do E78+E74): a vendedora gera o portal na ficha; a noiva abre
 * SEM login, vê a proposta e aceita — e a gestão reflete o aprovado. Revogar
 * mata o link na hora.
 */
test.describe("Portal da noiva (E78)", () => {
  const stamp = Date.now();
  const noivaNome = `E2E Portal ${stamp}`;
  let leadId: string;
  let orcamentoId: string;
  let provaId: string;
  const cabineId = `e2e-cabine-portal-${stamp}`;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome, whatsapp: "11977776666" },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = (await lead.json()).id;

    // A proposta ENVIADA — direto no banco, como as fixtures de API.
    orcamentoId = randomUUID();
    const admin = await db.query.usuariosTable.findFirst({
      where: (u, { eq: eq_ }) => eq_(u.email, estado.adminEmail),
    });
    await db.insert(orcamentosTable).values({
      id: orcamentoId,
      lojaId: estado.lojaId,
      leadId,
      vendedoraId: admin!.id,
      status: "ENVIADO",
    });
    await db.insert(orcamentoItensTable).values({
      id: randomUUID(),
      lojaId: estado.lojaId,
      orcamentoId,
      tipo: "VESTIDO",
      descricao: `Vestido E2E ${stamp}`,
      valorUnitario: 7500,
      quantidade: 1,
    });

    // Uma prova futura em cabine própria — o E85 confirma por ela.
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: estado.lojaId, nome: cabineId });
    provaId = randomUUID();
    await db.insert(atendimentosTable).values({
      id: provaId,
      lojaId: estado.lojaId,
      leadId,
      cabineId,
      vendedoraId: admin!.id,
      tipo: "PROVA",
      inicio: new Date(Date.now() + 5 * 86_400_000),
    });
  });

  test.afterAll(async () => {
    // O cascade do lead leva orçamento, itens, portal_token e atendimentos.
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
    await db.delete(cabinesTable).where(eq(cabinesTable.id, cabineId));
  });

  test("a vendedora gera o link na ficha; a noiva abre sem login e aceita; a gestão reflete", async ({
    page,
    browser,
  }) => {
    // — A ficha: o card do portal gera (e copia) o link. —
    await page.goto(`/loja/${estado.lojaId}/noivas/${leadId}`);
    const gerar = page.getByTestId("gerar-portal");
    await expect(gerar).toBeVisible();
    await gerar.click();
    await expect(page.getByText(/Link copiado|Não deu para copiar/).first()).toBeVisible();

    const [portal] = await db
      .select()
      .from(portalTokensTable)
      .where(eq(portalTokensTable.leadId, leadId));
    expect(portal).toBeTruthy();

    // O card agora sabe que existe — e que ela ainda não abriu.
    await expect(page.getByText("Ela ainda não abriu.")).toBeVisible();

    // — A noiva, SEM sessão: contexto limpo. —
    const semLogin = await browser.newContext();
    const noiva = await semLogin.newPage();
    await noiva.goto(`/noiva/${portal.token}`);

    await expect(noiva.getByText(`O lugar de ${noivaNome}`)).toBeVisible();
    await expect(noiva.getByText(`Vestido E2E ${stamp}`)).toBeVisible();
    await expect(noiva.getByText("R$ 7.500,00").first()).toBeVisible();

    // O aceite (E74) — a página vira comprovante.
    await noiva.getByTestId("aceitar-portal").click();
    await expect(noiva.getByText(/Você aceitou esta proposta em/)).toBeVisible();

    // E85: a prova está lá, e confirmar é um clique — o badge assume o lugar.
    await noiva.getByTestId(`confirmar-prova-${provaId}`).click();
    await expect(noiva.getByText("Confirmada")).toBeVisible();
    const [prova] = await db
      .select()
      .from(atendimentosTable)
      .where(eq(atendimentosTable.id, provaId));
    expect(prova.confirmadoEm).not.toBeNull();
    await semLogin.close();

    // — A gestão reflete: o orçamento aprovou com rastro. —
    const [orcamento] = await db
      .select()
      .from(orcamentosTable)
      .where(eq(orcamentosTable.id, orcamentoId));
    expect(orcamento.status).toBe("APROVADO");
    expect(orcamento.aceitoEm).not.toBeNull();

    // E o card da vendedora sabe que ela abriu.
    await page.reload();
    await expect(page.getByText(/Ela abriu (agora há pouco|há \d)/)).toBeVisible();
  });

  test("revogar mata o link na hora", async ({ page, browser }) => {
    await page.goto(`/loja/${estado.lojaId}/noivas/${leadId}`);
    const [antes] = await db
      .select()
      .from(portalTokensTable)
      .where(eq(portalTokensTable.leadId, leadId));

    await page.getByRole("button", { name: "Revogar" }).click();
    await expect(page.getByText("Portal revogado").first()).toBeVisible();

    const semLogin = await browser.newContext();
    const noiva = await semLogin.newPage();
    await noiva.goto(`/noiva/${antes.token}`);
    await expect(noiva.getByText(/Link inválido/)).toBeVisible();
    await semLogin.close();
  });
});
