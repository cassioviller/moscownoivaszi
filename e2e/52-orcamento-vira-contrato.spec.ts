import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  usuariosTable,
  leadsTable,
  orcamentosTable,
  orcamentoItensTable,
  contratosTable,
} from "../lib/db/src/index";
import { lerEstado } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E120 — a jornada orçamento → contrato, com a venda no bolso certo.
 *
 * A Maria monta o orçamento; a ADMIN (a sessão logada) fecha o contrato de
 * manhã. Antes do E120, o contrato nascia da admin — `vendedoraId: user!.id`,
 * fixo — e R$ 210,00 de comissão (R$ 4.200,00 a 5%) trocavam de bolso em
 * silêncio. Agora o diálogo nasce da vendedora do orçamento, trocar é gesto
 * explícito com aviso, e a primária do rascunho é chegar à noiva — não o
 * "Aprovar" que queima a prova digital (B5).
 */
test.describe("Orçamento vira contrato (E120)", () => {
  const stamp = Date.now();
  const noivaNome = `E2E Venda da Maria ${stamp}`;
  const CASAMENTO = "2027-05-15";
  let leadId: string;
  let orcamentoId: string;
  let mariaId: string;
  let mariaNome: string;

  test.beforeAll(async () => {
    const [maria] = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome })
      .from(usuariosTable)
      .where(eq(usuariosTable.email, estado.mariaEmail));
    mariaId = maria.id;
    mariaNome = maria.nome;

    leadId = randomUUID();
    await db.insert(leadsTable).values({
      id: leadId,
      lojaId: estado.lojaId,
      noivaNome,
      // Meio-dia UTC: o `slice(0, 10)` da tela lê o dia sem risco de véspera.
      casamentoData: new Date(`${CASAMENTO}T12:00:00Z`),
    });

    orcamentoId = randomUUID();
    await db.insert(orcamentosTable).values({
      id: orcamentoId,
      lojaId: estado.lojaId,
      leadId,
      vendedoraId: mariaId,
      status: "RASCUNHO",
    });
    await db.insert(orcamentoItensTable).values({
      id: randomUUID(),
      lojaId: estado.lojaId,
      orcamentoId,
      tipo: "VESTIDO",
      descricao: `Vestido E2E ${stamp}`,
      valorUnitario: 4200,
      quantidade: 1,
    });
  });

  test.afterAll(async () => {
    // contratos.leadId é RESTRICT — o contrato sai antes do cascade do lead.
    if (leadId) {
      await db.delete(contratosTable).where(eq(contratosTable.leadId, leadId));
      await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
    }
  });

  test("rascunho sem aceite: a primária é o link; Aprovar mora no menu (B5)", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/orcamentos/${orcamentoId}`);
    await expect(page.getByText(noivaNome).first()).toBeVisible();

    // O botão colorido é chegar à noiva — não o passo que queima o aceite.
    await expect(page.getByRole("button", { name: /Link para a noiva|Copiar link da noiva/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Aprovar", exact: true })).toHaveCount(0);

    // "Aprovar" continua a um clique — dentro do "Mais ações".
    await page.getByRole("button", { name: "Mais ações" }).click();
    await expect(page.getByRole("menuitem", { name: "Aprovar" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("a admin fecha a venda e o contrato nasce da Maria (B1 + B6)", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/orcamentos/${orcamentoId}`);

    // Aprova pelo menu (o caso da manhã seguinte — sem aceite, com aviso).
    await page.getByRole("button", { name: "Mais ações" }).click();
    await page.getByRole("menuitem", { name: "Aprovar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Aprovar" }).click();

    // Aprovado, a primária vira Gerar contrato.
    const gerar = page.getByRole("button", { name: "Gerar contrato" });
    await expect(gerar).toBeVisible();
    await gerar.click();

    const dialogo = page.getByRole("dialog");
    // B1: o diálogo nasce da vendedora do ORÇAMENTO — não da admin logada.
    await expect(dialogo.getByTestId("select-vendedora-venda")).toContainText(mariaNome);
    // B6: a data do casamento vem da ficha, sem redigitar.
    await expect(dialogo.getByLabel("Data do casamento")).toHaveValue(CASAMENTO);

    // Trocar a dona é explícito e AVISA — e desfazer a troca cala o aviso.
    await dialogo.getByTestId("select-vendedora-venda").click();
    await page.getByRole("option").filter({ hasNotText: mariaNome }).first().click();
    await expect(dialogo.getByTestId("aviso-vendedora-divergente")).toBeVisible();
    await dialogo.getByTestId("select-vendedora-venda").click();
    await page.getByRole("option", { name: mariaNome }).click();
    await expect(dialogo.getByTestId("aviso-vendedora-divergente")).toHaveCount(0);

    await dialogo.getByLabel(/1ª parcela vence em/).fill("2026-09-10");
    await dialogo.getByRole("button", { name: "Gerar contrato" }).click();

    await expect(page).toHaveURL(/\/contratos\/[0-9a-f-]+$/);

    // A prova do dinheiro: a venda é da Maria, não de quem clicou.
    const [contrato] = await db
      .select({ vendedoraId: contratosTable.vendedoraId })
      .from(contratosTable)
      .where(eq(contratosTable.leadId, leadId));
    expect(contrato.vendedoraId).toBe(mariaId);
  });
});
