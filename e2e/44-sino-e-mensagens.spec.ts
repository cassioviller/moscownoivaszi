import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, atendimentosTable, leadsTable } from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E81 (fiscal do E68+E69): o sino mostra e dispensa o aviso; a fila de
 * mensagens carimba a confirmação ao abrir o WhatsApp. Os dois fluxos dividem
 * o MESMO seed — um atendimento nas próximas 24h sem confirmação — porque na
 * vida real são o mesmo fato visto de dois lugares.
 */
test.describe("Sino e mensagens de hoje (E68+E69)", () => {
  const stamp = Date.now();
  const noivaNome = `E2E Sino ${stamp}`;
  let leadId: string;
  let atendimentoId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome, whatsapp: "11988887777" },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = (await lead.json()).id;

    // Direto no banco, como as fixtures de API: a rota de criação valida
    // funcionamento/slots, e o fato aqui é "existe presença por confirmar",
    // não "deu para agendar".
    atendimentoId = randomUUID();
    await db.insert(atendimentosTable).values({
      id: atendimentoId,
      lojaId: estado.lojaId,
      leadId,
      cabineId: estado.cabineId,
      vendedoraId: (await db.query.usuariosTable.findFirst({
        where: (u, { eq: eq_ }) => eq_(u.email, estado.adminEmail),
      }))!.id,
      tipo: "ATENDIMENTO",
      inicio: new Date(Date.now() + 20 * 3_600_000), // dentro das 24h do sino
      situacao: "AGENDADO",
    });
  });

  test.afterAll(async () => {
    if (atendimentoId)
      await db.delete(atendimentosTable).where(eq(atendimentosTable.id, atendimentoId));
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("o sino mostra o aviso e o dispensar o cala — até o fato mudar", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/dashboard`);

    // O sino renderiza duas vezes (desktop e mobile) — o teste usa o visível.
    const sino = page.locator('[data-testid="sino-notificacoes"]:visible');
    await expect(sino).toBeVisible();
    await sino.click();

    // O aviso de presença por confirmar está na lista (a fixture global pode
    // ter outros avisos — o teste mira ESTE).
    const aviso = page.getByText(/presença.*por confirmar nas próximas 24h/);
    await expect(aviso).toBeVisible();

    // Dispensar: o aviso some e não volta ao reabrir (localStorage por
    // pessoa×loja) — some ESTE aviso, não o sino.
    await page
      .getByRole("button", { name: /^Dispensar: .*presença.*por confirmar/ })
      .click();
    await expect(aviso).not.toBeVisible();
    await page.keyboard.press("Escape");
    await sino.click();
    await expect(page.getByText(/presença.*por confirmar nas próximas 24h/)).not.toBeVisible();
  });

  /**
   * E97/F6 mudou o que este teste afirma, e a mudança é a decisão do épico.
   *
   * ANTES: abrir o WhatsApp carimbava `confirmadoEm` — o MESMO campo que o
   * portal usa quando a noiva clica em "confirmo". O teste dizia
   * `expect(atendimento.confirmadoEm).not.toBeNull()` e passava, mas o que
   * tinha acontecido era só a recepção ABRIR um link: nada garantia que a
   * mensagem saiu, muito menos que a noiva leu. A loja separava peça e cabine
   * com base nesse número.
   *
   * AGORA: o clique carimba `contatadoEm` (ato da loja) e deixa `confirmadoEm`
   * intacto. A linha sai da fila do mesmo jeito — a recepção não precisa
   * repetir —, e a confirmação continua sendo só dela.
   */
  test("a fila de mensagens carimba o CONTATO da loja, não a confirmação da noiva", async ({
    page,
    context,
  }) => {
    await page.goto(`/loja/${estado.lojaId}/mensagens`);

    // A linha da noiva está na fila de quem falta procurar, com o botão pronto.
    const linha = page.locator("li", { hasText: noivaNome });
    await expect(linha).toBeVisible();
    const chamar = linha.getByRole("link", { name: /Chamar no WhatsApp/ });

    // O clique abre o wa.me numa aba nova E dispara a mutação — fecha-se a
    // aba e espera-se a linha sair da fila (o carimbo invalida a query).
    const popupP = context.waitForEvent("page");
    await chamar.click();
    const popup = await popupP;
    await popup.close();

    await expect(linha).not.toBeVisible();

    // O carimbo é de verdade, e é o carimbo CERTO.
    const [atendimento] = await db
      .select()
      .from(atendimentosTable)
      .where(eq(atendimentosTable.id, atendimentoId));
    expect(atendimento.contatadoEm).not.toBeNull();
    expect(atendimento.confirmadoEm).toBeNull();
  });
});
