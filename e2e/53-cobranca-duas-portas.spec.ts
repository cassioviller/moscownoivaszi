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
 * O spec cria DUAS noivas em atraso (contrato + 1 parcela vencida há 120
 * dias, o molde do 16-cobranca-historico) e confere o rastro NO BANCO — o
 * mesmo veredito do 44-sino-e-mensagens para a seção irmã. Duas porque a
 * S-D13 mudou a semântica de propósito: quem a porta 1 cobrou hoje chega em
 * /mensagens JÁ MARCADA (a marca persiste via `ultimoContatoEm` da parcela),
 * então o fluxo de marcar-e-desfazer da porta 2 precisa de uma noiva que
 * ninguém cobrou ainda.
 */
test.describe("Cobrança — o rastro pelas duas portas (E123)", () => {
  const stamp = Date.now();
  const noivaNome = `E2E Cobranca ${stamp}`;
  const noiva2Nome = `E2E Cobranca Fila ${stamp}`;
  let leadId: string;
  let lead2Id: string;
  let contratoId: string;
  let contrato2Id: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    // O contrato da API expõe `usuarioId` (não `id`) — o seed do spec 16 usa
    // `id` num ramo que nunca roda com o banco de dev cheio (visto de passagem).
    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoras = (await equipe.json()) as { usuarioId: string }[];

    const criarNoivaEmAtraso = async (nome: string, whatsapp: string) => {
      const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
        data: { noivaNome: nome, whatsapp },
      });
      expect(lead.status(), await lead.text()).toBe(201);
      const id = (await lead.json()).id as string;

      const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
        data: { leadId: id, vendedoraId: vendedoras[0]!.usuarioId, valorTotal: 2400 },
      });
      expect(contrato.status(), await contrato.text()).toBe(201);
      const cId = (await contrato.json()).id as string;

      // 120 dias atrás: cai na faixa "mais de 60" e não depende de quando roda.
      const vencido = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
      const plano = await request.post(
        `${API_URL}/api/lojas/${estado.lojaId}/contratos/${cId}/parcelas/gerar-plano`,
        { data: { numParcelas: 1, primeiroVencimento: vencido } },
      );
      expect(plano.status(), await plano.text()).toBe(201);
      return { leadId: id, contratoId: cId };
    };

    ({ leadId, contratoId } = await criarNoivaEmAtraso(noivaNome, "11977776666"));
    ({ leadId: lead2Id, contratoId: contrato2Id } = await criarNoivaEmAtraso(
      noiva2Nome,
      "11977775555",
    ));
  });

  test.afterAll(async () => {
    // O banco do E2E persiste entre execuções (família S18/S25): as noivas em
    // atraso deste spec não podem ficar acumulando na fila das próximas rodadas.
    for (const [lid, cid] of [
      [leadId, contratoId],
      [lead2Id, contrato2Id],
    ] as const) {
      if (lid) await db.delete(registrosCobrancaTable).where(eq(registrosCobrancaTable.leadId, lid));
      if (cid) {
        await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, cid));
        await db.delete(contratosTable).where(eq(contratosTable.id, cid));
      }
      if (lid) await db.delete(leadsTable).where(eq(leadsTable.id, lid));
    }
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

  test("porta 2 — quem a porta 1 cobrou chega marcada; a fila marca o que sai, e o desfazer devolve", async ({
    page,
    context,
  }) => {
    await page.goto(`/loja/${estado.lojaId}/mensagens`);

    // S-D13: a cobrança da porta 1 SOBREVIVEU ao carregamento — antes a marca
    // era só da sessão de tela, morria no F5, e a fila pedia de novo a
    // cobrança que acabou de acontecer (com o segundo clique gravando o
    // segundo registro do dia). O "Não cobrei" fica sem alvo de propósito: o
    // registro não é desta sessão; desfaz-se pelo histórico da noiva.
    const filaDaCobrada = page.locator("li", { hasText: noivaNome });
    await expect(filaDaCobrada).not.toBeVisible();
    const jaCobrada = page
      .locator("div", { hasText: noivaNome })
      .filter({ has: page.getByRole("button", { name: "Não cobrei" }) })
      .last();
    await expect(jaCobrada).toBeVisible();
    await expect(jaCobrada).toContainText("cobrada");
    await expect(jaCobrada.getByRole("button", { name: "Não cobrei" })).toBeDisabled();

    // A segunda noiva ninguém cobrou: está na fila "Lembrar de um valor em
    // aberto".
    const fila = page.locator("li", { hasText: noiva2Nome });
    await expect(fila).toBeVisible();

    const respostaP = page.waitForResponse(
      (r) =>
        r.url().includes(`/leads/${lead2Id}/cobrancas`) &&
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
      .locator("div", { hasText: noiva2Nome })
      .filter({ has: page.getByRole("button", { name: "Não cobrei" }) })
      .last();
    await expect(cobrada).toBeVisible();
    await expect(cobrada).toContainText("cobrada");

    // O registro desta porta existe no banco.
    const antes = await db
      .select()
      .from(registrosCobrancaTable)
      .where(eq(registrosCobrancaTable.leadId, lead2Id));
    expect(antes).toHaveLength(1);
    const daFila = antes.find((r) => r.observacao?.includes("fila do dia"));
    expect(daFila).toBeTruthy();

    // O desfazer: a linha volta para a fila e o registro errado some — com
    // rastro na trilha. A volta prova que a marca persistente também se
    // corrige: sem registro no banco, o `ultimoContatoEm` recarregado é nulo.
    await cobrada.getByRole("button", { name: "Não cobrei" }).click();
    await expect(fila).toBeVisible();

    await expect
      .poll(async () =>
        (
          await db
            .select()
            .from(registrosCobrancaTable)
            .where(eq(registrosCobrancaTable.leadId, lead2Id))
        ).length,
      )
      .toBe(0);

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
