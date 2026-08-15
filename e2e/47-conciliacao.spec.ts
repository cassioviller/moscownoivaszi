import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, leadsTable, contratosTable, parcelasTable } from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E81 (fiscal do E70): a dona sobe o extrato CSV e a tela responde as três
 * perguntas — o que bateu, o que só está no banco, o que só está no sistema.
 * O arquivo não sai do navegador; o teste sobe uma fixture com um par exato
 * (o recebimento semeado) e uma tarifa que o sistema não conhece.
 */
test.describe("Conciliação por extrato (E70)", () => {
  const stamp = Date.now();
  // Dia fixo e futuro (como a grade E28): o seed global não polui a janela.
  const DIA_BR = "15/05/2027";
  /**
   * VALOR único por execução, e não a constante 1234,56 que estava aqui.
   *
   * O casamento do E70 é por VALOR + data (`extrato.ts:181`), então duas
   * execuções deixavam duas parcelas indistinguíveis — e o matcher casava a
   * primeira que achasse, que podia ser de um run antigo. Enquanto a
   * conciliação era uma fotografia isso não aparecia: qualquer par servia.
   * **Com a memória do F32 a identidade passa a importar**, e o defeito latente
   * virou vermelho — o botão "marcar" some porque a parcela casada já estava
   * marcada de outro run.
   *
   * Mesma lição da S7 e do que o F13 fez no spec 22: recurso próprio por
   * execução. Os centavos vêm do stamp, então o valor nunca se repete.
   */
  const VALOR = Number((1000 + (stamp % 100000) / 100).toFixed(2));
  let leadId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Concilia ${stamp}` },
    });
    leadId = (await lead.json()).id;

    const admin = await db.query.usuariosTable.findFirst({
      where: (u, { eq: eq_ }) => eq_(u.email, estado.adminEmail),
    });
    const contratoId = randomUUID();
    await db.insert(contratosTable).values({
      id: contratoId,
      lojaId: estado.lojaId,
      leadId,
      vendedoraId: admin!.id,
      status: "ATIVO",
      valorTotal: VALOR,
      fechadoEm: new Date(),
    });
    // Recebida NO dia do extrato — o par exato do CSV.
    await db.insert(parcelasTable).values({
      id: randomUUID(),
      lojaId: estado.lojaId,
      contratoId,
      numero: 1,
      valorPrevisto: VALOR,
      vencimento: new Date("2027-05-15T12:00:00-03:00"),
      status: "PAGA",
      valorRecebido: VALOR,
      recebidoEm: new Date("2027-05-15T12:00:00-03:00"),
      formaRecebimento: "PIX",
    });
  });

  test.afterAll(async () => {
    // `contratos.lead_id` NÃO cascateia: parcelas → contratos → lead, na ordem.
    if (!leadId) return;
    const contratos = await db
      .select({ id: contratosTable.id })
      .from(contratosTable)
      .where(eq(contratosTable.leadId, leadId));
    for (const c of contratos) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, c.id));
      await db.delete(contratosTable).where(eq(contratosTable.id, c.id));
    }
    await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("o extrato casa o recebimento e denuncia a tarifa sem par", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/financeiro/conciliacao`);

    const csv = [
      `Data,Descrição,Valor`,
      `${DIA_BR},PIX recebido noiva,${VALOR}`,
      `${DIA_BR},Tarifa bancária E2E,-25.00`,
    ].join("\n");
    await page.getByTestId("input-extrato").setInputFiles({
      name: "extrato-e2e.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });

    /**
     * Os TRÊS placares aparecem — e agora são mesmo os placares.
     *
     * Este bloco dizia "os três placares" e afirmava dois TÍTULOS DE LISTA, que
     * só existem quando há linha para mostrar. O de "No sistema, mas não no
     * banco" passava porque o banco de dev tinha quatro parcelas vazadas de runs
     * antigos com o mesmo valor: **o assert dependia de lixo**, e ficou vermelho
     * no instante em que o lixo foi limpo. Os placares existem sempre; as listas
     * dependem do que o spec semeia, e ele semeia UMA divergência — a tarifa.
     */
    await expect(page.getByText("Bateu", { exact: true })).toBeVisible();
    await expect(page.getByText("Só no banco", { exact: true })).toBeVisible();
    await expect(page.getByText("Só no sistema", { exact: true })).toBeVisible();
    await expect(page.getByText("No banco, mas não no sistema")).toBeVisible();

    // A tarifa é pendência do lado do banco; o PIX casado não aparece nela.
    const soBanco = page.locator("div.space-y-6 > *", {
      has: page.getByText("No banco, mas não no sistema"),
    });
    await expect(soBanco.getByText("Tarifa bancária E2E")).toBeVisible();
    await expect(soBanco.getByText("PIX recebido noiva")).not.toBeVisible();
  });

  /**
   * F32/E103 — a conciliação passa a ter MEMÓRIA, e é isso que o teste prova:
   * não que o botão existe, mas que o carimbo **sobrevive ao recarregar**.
   *
   * Antes, o resultado morria com a aba: todo mês se refazia o mesmo trabalho, e
   * as divergências já olhadas e perdoadas voltavam indistinguíveis das novas.
   * O spec sobe o MESMO extrato duas vezes — que é o gesto real de quem concilia
   * o mês seguinte — e afirma que na segunda o sistema já sabe.
   */
  test("marcar como conferido sobrevive ao recarregar a página", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/financeiro/conciliacao`);

    const csv = [
      `Data,Descrição,Valor`,
      `${DIA_BR},PIX recebido noiva,${VALOR}`,
    ].join("\n");
    const subir = async () => {
      await page.getByTestId("input-extrato").setInputFiles({
        name: "extrato-e2e.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv, "utf-8"),
      });
    };

    await subir();
    const marcar = page.getByTestId("marcar-conciliadas");
    await expect(marcar).toBeVisible();
    await marcar.click();
    await expect(page.getByText(/movimento\(s\) conferido\(s\)/).first()).toBeVisible();

    // O gesto real: recarregar e subir o MESMO extrato de novo.
    await page.reload();
    await subir();

    // O par continua batendo — e o botão sumiu, porque não há nada NOVO a
    // marcar. É a diferença entre "casou" e "casou e já foi conferido".
    await expect(page.getByText("Bateu", { exact: true })).toBeVisible();
    await expect(page.getByText("Todas já conferidas em conciliações anteriores.")).toBeVisible();
    await expect(page.getByTestId("marcar-conciliadas")).toHaveCount(0);
  });

  test("arquivo ilegível explica o erro em vez de tela vazia", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/financeiro/conciliacao`);
    await page.getByTestId("input-extrato").setInputFiles({
      name: "nada.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("isto não é um extrato", "utf-8"),
    });
    await expect(page.getByText(/Nenhuma transação reconhecida/).first()).toBeVisible();
  });
});

/**
 * E235 (S-C51, respondida em 15/08/2026: por PAGAMENTO) — a parcela paga em
 * DOIS PIX casa as duas linhas do banco, na tela. Antes deste épico a tela
 * montava um movimento por parcela, datado pelo último pedaço, e o mesmo
 * extrato dava "Bateu 0 · Só no banco 2 · Só no sistema 1" — três divergências
 * falsas de um pagamento certo. Os dois recebimentos entram pela PORTA (é ela
 * que escreve a linha da trilha, E221); o extrato traz as duas linhas.
 */
test.describe("Conciliação por pagamento (E235)", () => {
  const stamp = Date.now();
  // Valores únicos por execução (a lição do VALOR acima), em dias fixos e futuros.
  const P1 = Number((300 + (stamp % 10000) / 100).toFixed(2));
  const P2 = Number((700 + (stamp % 7000) / 100).toFixed(2));
  let leadId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, { data: { email: estado.adminEmail, senha: estado.senha } });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, { data: { noivaNome: `E2E Dois PIX ${stamp}` } });
    leadId = (await lead.json()).id;
    const admin = await db.query.usuariosTable.findFirst({ where: (u, { eq: eq_ }) => eq_(u.email, estado.adminEmail) });
    const contratoId = randomUUID();
    await db.insert(contratosTable).values({ id: contratoId, lojaId: estado.lojaId, leadId, vendedoraId: admin!.id, status: "ATIVO", valorTotal: P1 + P2, fechadoEm: new Date() });
    const parcelaId = randomUUID();
    await db.insert(parcelasTable).values({ id: parcelaId, lojaId: estado.lojaId, contratoId, numero: 1, valorPrevisto: P1 + P2, vencimento: new Date("2027-06-20T12:00:00-03:00") });
    for (const [valor, dia] of [[P1, "2027-06-01"], [P2, "2027-06-15"]] as const) {
      const r = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/parcelas/${parcelaId}/receber`, {
        data: { valorRecebido: valor, recebidoEm: `${dia}T12:00:00-03:00`, formaRecebimento: "PIX" },
      });
      expect(r.ok()).toBe(true);
    }
  });

  test.afterAll(async () => {
    if (!leadId) return;
    const contratos = await db.select({ id: contratosTable.id }).from(contratosTable).where(eq(contratosTable.leadId, leadId));
    for (const c of contratos) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, c.id));
      await db.delete(contratosTable).where(eq(contratosTable.id, c.id));
    }
    await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("os dois PIX de uma parcela casam as duas linhas do banco — zero divergência", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/financeiro/conciliacao`);
    const csv = [`Data,Descrição,Valor`, `01/06/2027,PIX noiva primeiro,${P1}`, `15/06/2027,PIX noiva segundo,${P2}`].join("\n");
    await page.getByTestId("input-extrato").setInputFiles({ name: "extrato-dois-pix.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });
    await expect(page.getByText("Bateu", { exact: true })).toBeVisible();
    // Nenhuma das duas linhas do banco sobra como pendência.
    await expect(page.getByText("No banco, mas não no sistema")).not.toBeVisible();
    await expect(page.getByText("PIX noiva primeiro")).not.toBeVisible();
    await expect(page.getByText("PIX noiva segundo")).not.toBeVisible();
  });
});
