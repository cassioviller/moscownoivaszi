import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, leadsTable, contratosTable, parcelasTable } from "../lib/db/src/index";
import { lerEstado, API_URL, QUALIFICACAO_DA_NOIVA } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E227 — as duas cláusulas que existiam na API e nenhuma tela alcançava.
 *
 * - **S-C211 · 18ª** — `prazo_devolucao_reserva_dias` estava em **0 de 79
 *   arquivos de `pages/`**: sem prazo preenchido a cláusula não dispara, e
 *   medido no `heliumdb` eram **0 de 743 contratos** com o campo. Uma cláusula
 *   que o ateliê assinou estava morta no sistema por falta de um campo. A porta
 *   já gravava (`PATCH /contratos/:id` aceita o campo desde o E217); o que
 *   faltava era o campo no diálogo que o E224 criou.
 * - **S-C151 · 13ª** — `iniciativa: LOCATARIA | LOJA` existia desde o E217 com
 *   **0 usos em `pages/` e 0 em `e2e/`**: quando a LOJA cancela, ela devolve
 *   tudo — e a vendedora não tinha como DIZER isso ao sistema, então todo
 *   cancelamento saía como rescisão da noiva, retendo o que a 13ª manda
 *   devolver.
 */
test.describe.serial("E227 — a 18ª e a 13ª ganham gesto", () => {
  const stamp = Date.now();
  let leadId: string;
  let contratoId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Clausulas ${stamp}`, origem: "LOJA", ...QUALIFICACAO_DA_NOIVA },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = ((await lead.json()) as { id: string }).id;

    const me = await request.get(`${API_URL}/api/auth/me`);
    const vendedoraId = (await me.json()).usuario.id;

    // Entrada JÁ RECEBIDA: a 13ª só tem o que devolver quando algo entrou. O
    // plano soma o valor total — a régua do carnê recusa plano divergente.
    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: {
        leadId,
        vendedoraId,
        valorTotal: 2000,
        parcelas: [
          {
            numero: 0,
            valorPrevisto: 800,
            vencimento: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          },
          {
            numero: 1,
            valorPrevisto: 1200,
            vencimento: new Date(Date.now() + 60 * 86_400_000).toISOString(),
          },
        ],
      },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    const corpo = await contrato.json();
    contratoId = corpo.id;
    const parcelaId = (corpo.parcelas as { id: string; numero: number }[]).find(
      (p) => p.numero === 0,
    )!.id;

    const recebe = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/parcelas/${parcelaId}/receber`, {
      data: { valorRecebido: 800, recebidoEm: new Date().toISOString(), formaRecebimento: "PIX" },
    });
    expect(recebe.status(), await recebe.text()).toBe(200);
  });

  test.afterAll(async () => {
    if (contratoId) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));
      await db.delete(contratosTable).where(eq(contratosTable.id, contratoId));
    }
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("S-C211 — o prazo da 18ª se preenche no diálogo das datas, e fica", async ({ page, request }) => {
    await page.goto(`/contratos/${contratoId}`);

    // O diálogo do E224 — o mesmo lugar onde as datas da locação se corrigem.
    await page.getByTestId("button-editar-locacao").click();
    const prazo = page.getByTestId("input-prazo-devolucao-reserva");
    await expect(prazo).toBeVisible();
    await prazo.fill("10");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Datas da locação salvas", { exact: true })).toBeVisible();
    // O diálogo fecha com animação — reabrir antes de ele sumir engole o clique.
    await expect(prazo).toBeHidden();

    // A porta gravou — o mesmo GET que a rescisão do E217 lê.
    const res = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/contratos/${contratoId}`);
    expect(((await res.json()) as { prazoDevolucaoReservaDias: number }).prazoDevolucaoReservaDias).toBe(10);

    // E reabrir mostra o valor — não é campo de escrever no escuro.
    await page.getByTestId("button-editar-locacao").click();
    await expect(page.getByTestId("input-prazo-devolucao-reserva")).toHaveValue("10");
  });

  test("S-C151 — o cancelamento sabe dizer que quem rescinde é a LOJA", async ({ page }) => {
    await page.goto(`/contratos/${contratoId}`);
    // "Cancelar contrato" mora no menu de ações do cabeçalho (a destrutiva
    // pede dois gestos — nota do próprio `cabecalho-detalhe`).
    await page.getByRole("button", { name: "Mais ações" }).click();
    await page.getByRole("menuitem", { name: "Cancelar contrato" }).click();

    // O padrão continua sendo a noiva — o painel responde "se a noiva rescindir".
    await expect(page.getByTestId("cancelar-rescisao")).toBeVisible();

    // A vendedora diz que foi a loja: o painel vira a 13ª — devolve tudo.
    await page.getByTestId("iniciativa-loja").click();
    await expect(page.getByTestId("cancelar-rescisao-loja")).toBeVisible();
    await expect(page.getByTestId("cancelar-rescisao-loja")).toContainText("13ª");
    await expect(page.getByTestId("cancelar-rescisao")).toBeHidden();

    // Devolver o que entrou é o que a cláusula MANDA — o aviso de "estorno
    // contra a cláusula" não pode acusar quem está obedecendo a 13ª.
    await page.getByLabel(/Devolvi o valor/).click();
    await expect(page.getByTestId("cancelar-estorno-contra-clausula")).toBeHidden();

    await page.getByRole("textbox", { name: /Motivo do cancelamento/ }).fill("O vestido rasgou no ateliê");
    await page.getByRole("button", { name: "Confirmar cancelamento" }).click();
    await expect(page.getByText(/Contrato cancelado/i).first()).toBeVisible();
  });

  test("a trilha gravou a iniciativa da LOJA, não a da noiva", async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const trilha = await request.get(
      `${API_URL}/api/lojas/${estado.lojaId}/financeiro/auditoria?acao=CONTRATO_CANCELADO`,
    );
    const linha = (await trilha.json()).find(
      (l: { entidadeId: string }) => l.entidadeId === contratoId,
    );
    // 13ª: iniciativa LOJA devolve tudo — retenção zero, devolução integral.
    expect(linha.detalhe).toMatchObject({
      iniciativa: "LOJA",
      rescisaoRetencaoTotal: 0,
      rescisaoDevolucaoTotal: 800,
    });
  });
});
