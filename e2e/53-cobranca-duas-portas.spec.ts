import { test, expect } from "@playwright/test";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  parcelasTable,
  contratosTable,
  registrosCobrancaTable,
  auditLogTable,
} from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E123 (B2/B3): cobrar deixa rastro pelas DUAS portas, e a fila marca o que
 * já saiu.
 *
 * Antes, o mesmo ato — abrir o WhatsApp para cobrar — gravava um
 * `registro-cobranca` em /mensagens e NADA em /financeiro/cobranca; e a fila
 * de /mensagens ficava idêntica antes e depois do clique, enquanto a seção
 * irmã ("Procurar para confirmar") tirava a linha e oferecia desfazer.
 *
 * O spec cria a própria noiva em atraso (contrato + 1 parcela vencida há 120
 * dias, o molde do 16-cobranca-historico) e confere o rastro NO BANCO — o
 * mesmo veredito do 44-sino-e-mensagens para a seção irmã.
 */
test.describe("Cobrança — o rastro pelas duas portas (E123)", () => {
  const stamp = Date.now();
  const noivaNome = `E2E Cobranca ${stamp}`;
  let leadId: string;
  let contratoId: string;

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

    // O contrato da API expõe `usuarioId` (não `id`) — o seed do spec 16 usa
    // `id` num ramo que nunca roda com o banco de dev cheio (visto de passagem).
    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoras = (await equipe.json()) as { usuarioId: string }[];

    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: { leadId, vendedoraId: vendedoras[0]!.usuarioId, valorTotal: 2400 },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    contratoId = (await contrato.json()).id;

    // 120 dias atrás: cai na faixa "mais de 60" e não depende de quando roda.
    const vencido = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    const plano = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`,
      { data: { numParcelas: 1, primeiroVencimento: vencido } },
    );
    expect(plano.status(), await plano.text()).toBe(201);
  });

  test.afterAll(async () => {
    // O banco do E2E persiste entre execuções (família S18/S25): a noiva em
    // atraso deste spec não pode ficar acumulando na fila das próximas rodadas.
    if (leadId) {
      await db.delete(registrosCobrancaTable).where(eq(registrosCobrancaTable.leadId, leadId));
    }
    if (contratoId) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));
      await db.delete(contratosTable).where(eq(contratosTable.id, contratoId));
    }
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("porta 1 — o WhatsApp de /financeiro/cobranca carimba o registro sozinho", async ({
    page,
    context,
  }) => {
    await page.goto(`/loja/${estado.lojaId}/financeiro/cobranca`);
    await expect(page.getByRole("heading", { name: "Cobrança", exact: true })).toBeVisible();

    const linha = page.locator("li", { hasText: noivaNome });
    await expect(linha).toBeVisible();

    // O clique abre o wa.me numa aba nova E dispara o POST — fecha-se a aba e
    // espera-se a resposta do servidor, não um timeout.
    const respostaP = page.waitForResponse(
      (r) =>
        r.url().includes(`/leads/${leadId}/cobrancas`) &&
        r.request().method() === "POST" &&
        r.status() === 201,
    );
    const popupP = context.waitForEvent("page");
    await linha.getByRole("link", { name: "WhatsApp" }).click();
    const popup = await popupP;
    await popup.close();
    await respostaP;

    // O rastro é de verdade: canal, porta e autor (da sessão, nunca do corpo).
    const registros = await db
      .select()
      .from(registrosCobrancaTable)
      .where(eq(registrosCobrancaTable.leadId, leadId));
    expect(registros).toHaveLength(1);
    expect(registros[0]!.canal).toBe("WHATSAPP");
    expect(registros[0]!.observacao).toContain("fila de cobrança");
    expect(registros[0]!.vendedorId).not.toBeNull();
  });

  test("porta 2 — a fila de /mensagens marca o que saiu, e o desfazer devolve", async ({
    page,
    context,
  }) => {
    await page.goto(`/loja/${estado.lojaId}/mensagens`);

    // A noiva está na fila "Lembrar de um valor em aberto".
    const fila = page.locator("li", { hasText: noivaNome });
    await expect(fila).toBeVisible();

    const respostaP = page.waitForResponse(
      (r) =>
        r.url().includes(`/leads/${leadId}/cobrancas`) &&
        r.request().method() === "POST" &&
        r.status() === 201,
    );
    const popupP = context.waitForEvent("page");
    await fila.getByRole("link", { name: "WhatsApp" }).click();
    const popup = await popupP;
    await popup.close();
    await respostaP;

    // B3: a linha SAI da fila e aparece em "Já cobradas", com o desfazer — o
    // desenho da seção irmã ("Procurar para confirmar"), não um terceiro.
    await expect(fila).not.toBeVisible();
    const cobrada = page
      .locator("div", { hasText: noivaNome })
      .filter({ has: page.getByRole("button", { name: "Não cobrei" }) })
      .last();
    await expect(cobrada).toBeVisible();
    await expect(cobrada).toContainText("cobrada");

    // O registro desta porta existe no banco (o da porta 1 continua lá).
    const antes = await db
      .select()
      .from(registrosCobrancaTable)
      .where(eq(registrosCobrancaTable.leadId, leadId));
    expect(antes).toHaveLength(2);
    const daFila = antes.find((r) => r.observacao?.includes("fila do dia"));
    expect(daFila).toBeTruthy();

    // O desfazer: a linha volta para a fila e o registro errado some — com
    // rastro na trilha, porque depois do DELETE ele é o único que resta.
    await cobrada.getByRole("button", { name: "Não cobrei" }).click();
    await expect(fila).toBeVisible();

    await expect
      .poll(async () =>
        (
          await db
            .select()
            .from(registrosCobrancaTable)
            .where(eq(registrosCobrancaTable.leadId, leadId))
        ).length,
      )
      .toBe(1);

    const trilha = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.acao, "REGISTRO_COBRANCA_DESFEITO"),
          eq(auditLogTable.entidadeId, daFila!.id),
        ),
      );
    expect(trilha).toHaveLength(1);
  });
});
