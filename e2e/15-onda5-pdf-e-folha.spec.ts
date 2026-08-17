import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, contasPagarTable, pagamentosTable, pagamentoItensTable, contratosTable, leadsTable, parcelasTable, envioContabilidadeDeRecebimentosTable } from "../lib/db/src/index";
import { lerEstado, API_URL, QUALIFICACAO_DA_NOIVA } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * Onda 5 — as duas capacidades net-new: o PDF de contrato (o main não gerava
 * PDF nenhum) e a folha de pagamento.
 */

function observarApi(page: Page): string[] {
  const falhas: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) {
      falhas.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    }
  });
  return falhas;
}

test.describe("Onda 5 — folha", () => {
  /**
   * S-O130 — o que este arquivo cria pela API sai no hook: a conta e o
   * pagamento da sonda "GET seguro", e as contas que `recorrencias/gerar`
   * abriu para 2025-01. Antes ficavam no banco de dev, e a
   * `varredura-fixture-do-e2e` os listava como rastro sem hook.
   */
  const criadas: { contaId?: string; pagamentoId?: string } = {};
  test.afterAll(async () => {
    if (criadas.pagamentoId) {
      await db.delete(pagamentoItensTable).where(eq(pagamentoItensTable.pagamentoId, criadas.pagamentoId));
      await db.delete(pagamentosTable).where(eq(pagamentosTable.id, criadas.pagamentoId));
    }
    if (criadas.contaId) await db.delete(contasPagarTable).where(eq(contasPagarTable.id, criadas.contaId));
    // As contas geradas para 2025-01 (todas com recorrencia_id): o run seguinte
    // as gera de novo — a idempotência é medida DENTRO do teste, não entre runs.
    await db.delete(contasPagarTable).where(and(
      eq(contasPagarTable.lojaId, estado.lojaId),
      eq(contasPagarTable.competencia, "2025-01"),
      isNotNull(contasPagarTable.recorrenciaId),
    ));
  });

  test("/financeiro/folha monta e carrega dados sem erro de API", async ({ page }) => {
    const falhas = observarApi(page);
    await page.goto("/financeiro/folha");
    await expect(page.getByRole("heading", { name: "Folha do mês", exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(falhas, `Chamadas de API falharam: ${falhas.join(", ")}`).toEqual([]);
  });

  // E103/F31: o H1 dizia "Recorrências do mês" e o link dizia "Folha do mês" —
  // quem procurava "folha" não achava, e quem achava lia outro nome. A loja
  // chama de folha, e a tela entrou na sidebar (era alcançável só por um botão
  // secundário dentro de contas a pagar).
  test("a folha é alcançável a partir de contas a pagar", async ({ page }) => {
    await page.goto("/financeiro/pagar");
    await page.getByRole("link", { name: /Folha/ }).first().click();
    await expect(page.getByRole("heading", { name: "Folha do mês", exact: true })).toBeVisible();
  });

  test("nenhum 'Invalid Date' ou 'NaN' nas recorrências", async ({ page }) => {
    await page.goto("/financeiro/folha");
    await page.waitForLoadState("networkidle");
    const corpo = (await page.locator("main, body").first().textContent()) ?? "";
    expect(corpo).not.toContain("Invalid Date");
    expect(corpo).not.toContain("NaN");
  });

  test("PROBE API: exportar a contabilidade devolve CSV e NÃO marca como enviado", async ({
    request,
  }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const res = await request.get(
      `${API_URL}/api/lojas/${estado.lojaId}/financeiro/folha/exportar?de=2025-01-01&ate=2025-12-31`,
    );
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    // BOM: sem ele o Excel lê UTF-8 como latin-1.
    expect(await res.text()).toMatch(/^﻿/);

    /**
     * O GET tem que ser seguro: baixar o arquivo não pode carimbar o período.
     * Marcar é um POST explícito — conferir antes de mandar precisa ser possível.
     *
     * **A asserção olha UM pagamento, criado aqui, e não todos os da loja.**
     * Ela varria a carteira inteira, e isso a tornava uma mina: qualquer carimbo
     * de qualquer origem — outro spec, a tela de fechar o mês do F34 — a
     * deixaria vermelha em TODA execução futura, num banco que persiste. E um
     * vermelho desses se lê como regressão de dinheiro. A intenção do teste é
     * sobre o VERBO (GET não escreve), não sobre o estado global da loja.
     */
    const conta = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/financeiro/contas-pagar`,
      {
        data: {
          tipo: "DESPESA",
          descricao: `Probe GET seguro ${Date.now()}`,
          valorPrevisto: 10,
          vencimento: new Date().toISOString(),
        },
      },
    );
    expect(conta.status(), await conta.text()).toBe(201);
    criadas.contaId = (await conta.json()).id as string;
    const pago = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/financeiro/pagamentos`,
      {
        data: {
          data: new Date().toISOString(),
          contaIds: [(await conta.json()).id],
          valorPago: 10,
        },
      },
    );
    expect(pago.status(), await pago.text()).toBe(201);
    const meuId = (await pago.json()).id as string;
    criadas.pagamentoId = meuId;

    // O export de novo, agora com o pagamento deste spec dentro da janela.
    await request.get(
      `${API_URL}/api/lojas/${estado.lojaId}/financeiro/folha/exportar?de=2020-01-01&ate=2099-12-31`,
    );

    const pagamentos = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/financeiro/pagamentos`);
    expect(pagamentos.status()).toBe(200);
    const meu = (await pagamentos.json()).find((x: { id: string }) => x.id === meuId);
    expect(meu, "o pagamento criado pelo spec sumiu da lista").toBeTruthy();
    expect(meu.enviadoContabilidadeEm ?? null).toBeNull();
  });

  test("PROBE API: gerar a competência é idempotente", async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const gerar = () =>
      request.post(`${API_URL}/api/lojas/${estado.lojaId}/financeiro/recorrencias/gerar`, {
        data: { competencia: "2025-01" },
      });

    // 200, não 201: a rota é idempotente e pode não criar nada — 201 seria
    // mentira na reexecução, que é justamente o caso que importa aqui.
    const primeira = await gerar();
    expect(primeira.status()).toBe(200);
    expect((await primeira.json()).geradas).toBeGreaterThanOrEqual(0);

    // Rodar de novo não pode pagar ninguém duas vezes.
    const segunda = await gerar();
    expect(segunda.status()).toBe(200);
    expect((await segunda.json()).geradas, "reexecutar a geração não pode gerar de novo").toBe(0);
  });
});

/**
 * **E260 / S-RM13 — a porta "Enviar à contabilidade" pela TELA.**
 *
 * O envio à contabilidade tinha duas sondas de API neste arquivo (o GET que
 * não carimba e a geração idempotente) e **nenhuma cena de tela**: ninguém
 * clicava "Declarar o mês". Isso importa porque o E252 e o E256 mexeram nos
 * DOIS lados da porta desde então — o envio passou a contar por ATO, e o campo
 * da resposta deixou de se chamar `parcelas` para se chamar `recebimentos`.
 *
 * **O modo de falha é o pior que existe: a tela não estoura, ela mente.** A
 * frase do recado é
 * `${res.pagamentos} saída(s) e ${res.recebimentos} recebimento(s) do período`
 * (`financeiro/folha.tsx:423`), e um campo que suma da resposta vira a palavra
 * `undefined` no meio de uma frase sobre dinheiro declarado — com o carimbo,
 * que é de mão única, já gravado no banco.
 *
 * A janela é UM DIA de 2024, e as duas pontas nascem aqui dentro: uma saída
 * paga e um recebimento. Por isso os números são exatos — `1 saída e 1
 * recebimento` —, e não "pelo menos um": afirmar o formato sem afirmar o
 * número deixaria passar justamente a troca de campo que a sobra descreve.
 */
test.describe("Onda 5 — a porta da contabilidade (E260)", () => {
  /** Meio-dia local de SP: o `dentroDaJanela` da rota corta por `diaLocal`. */
  const DIA = "2024-04-04";
  const INSTANTE = `${DIA}T15:00:00.000Z`;

  const criado: {
    contaId?: string;
    pagamentoId?: string;
    leadId?: string;
    contratoId?: string;
    parcelaId?: string;
  } = {};

  test.afterAll(async () => {
    // As linhas de `envio_contabilidade_de_recebimentos` saem por CASCADE com a
    // parcela (`parcela_id` … `onDelete: "cascade"`). A trilha de auditoria é
    // append-only e fica, como em todo spec deste repositório.
    if (criado.contratoId) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, criado.contratoId));
      await db.delete(contratosTable).where(eq(contratosTable.id, criado.contratoId));
    }
    if (criado.leadId) await db.delete(leadsTable).where(eq(leadsTable.id, criado.leadId));
    if (criado.pagamentoId) {
      await db.delete(pagamentoItensTable).where(eq(pagamentoItensTable.pagamentoId, criado.pagamentoId));
      await db.delete(pagamentosTable).where(eq(pagamentosTable.id, criado.pagamentoId));
    }
    if (criado.contaId) await db.delete(contasPagarTable).where(eq(contasPagarTable.id, criado.contaId));
  });

  test("'Declarar o mês' carimba os dois lados, e o recado traz os dois números", async ({
    page,
    request,
  }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    // — A saída: conta a pagar e o pagamento dela, no dia da janela. —
    const conta = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/financeiro/contas-pagar`, {
      data: {
        tipo: "DESPESA",
        descricao: `E2E contabilidade ${Date.now()}`,
        valorPrevisto: 250,
        vencimento: INSTANTE,
      },
    });
    expect(conta.status(), await conta.text()).toBe(201);
    criado.contaId = ((await conta.json()) as { id: string }).id;

    const pago = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/financeiro/pagamentos`, {
      data: { data: INSTANTE, contaIds: [criado.contaId], valorPago: 250 },
    });
    expect(pago.status(), await pago.text()).toBe(201);
    criado.pagamentoId = ((await pago.json()) as { id: string }).id;

    // — A entrada: contrato próprio com uma parcela, recebida no MESMO dia. —
    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Contabilidade ${Date.now()}`, origem: "LOJA", ...QUALIFICACAO_DA_NOIVA },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    criado.leadId = ((await lead.json()) as { id: string }).id;

    const me = await request.get(`${API_URL}/api/auth/me`);
    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: {
        leadId: criado.leadId,
        vendedoraId: (await me.json()).usuario.id,
        valorTotal: 400,
        parcelas: [{ numero: 0, valorPrevisto: 400, vencimento: INSTANTE }],
      },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    const corpoContrato = (await contrato.json()) as { id: string; parcelas?: { id: string }[] };
    criado.contratoId = corpoContrato.id;
    criado.parcelaId = corpoContrato.parcelas?.[0]?.id ?? "";
    expect(criado.parcelaId, "o contrato nasceu sem a parcela do plano").toBeTruthy();

    const recebida = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/parcelas/${criado.parcelaId}/receber`,
      { data: { valorRecebido: 400, recebidoEm: INSTANTE, formaRecebimento: "PIX" } },
    );
    expect(recebida.status(), await recebida.text()).toBe(200);

    /**
     * — A tela: a janela vira o dia da fixture, e o clique declara. —
     *
     * **A janela entra pela URL, e não por dois `fill()` seguidos, por causa
     * da S-RM17 que este épico achou** (`folha.tsx:316-323`): duas edições
     * dentro do mesmo frame perdem a primeira, e como `resolverIntervalo`
     * troca as pontas quando `ini > fim`, a janela ALARGA em silêncio. Medido
     * na primeira execução deste teste: a URL foi de `?ini=2024-04-04` para
     * `?fim=2024-04-04` — sem o `ini` —, o clique declarou
     * `2024-04-04..2026-08-01` e carimbou **302 recebimentos** de verdade.
     * Os dois campos são afirmados aqui embaixo, então a tela continua na
     * régua; o que sai é o gesto que dispara a corrida.
     */
    await page.goto(`/financeiro/folha?ini=${DIA}&fim=${DIA}`);
    await expect(page.getByRole("heading", { name: "Folha do mês", exact: true })).toBeVisible();
    /**
     * **A guarda antes do clique, e ela não é decoração.** "Declarar o mês" é
     * escrita de mão única — não há rota que limpe o carimbo. Afirmar a janela
     * só DEPOIS do clique transformaria uma janela errada em dano no banco, que
     * foi exatamente o que aconteceu aqui. `exact`: o `getByLabel` casa por
     * substring, e a mesma tela tem o campo "Descrição", que contém "De".
     */
    await expect(page.getByLabel("De", { exact: true })).toHaveValue(DIA);
    await expect(page.getByLabel("Até", { exact: true })).toHaveValue(DIA);
    await page.getByRole("button", { name: "Declarar o mês" }).click();

    // `.first()`: o Radix espelha o texto do toast numa região aria-live, e o
    // getByText cru resolve DOIS elementos (a mesma cerca do 34 e do 43).
    await expect(page.getByText("Mês declarado à contabilidade").first()).toBeVisible();
    /**
     * O número exato dos DOIS lados. O `undefined` que a sobra descreve entra
     * aqui, e entra em silêncio: a frase continua uma frase.
     *
     * A asserção é em duas etapas de propósito — acha a frase pelo FORMATO e
     * só então cobra o conteúdo. Cobrar o texto inteiro de uma vez faria o
     * vermelho dizer "element(s) not found", que não mostra o que a tela
     * escreveu; assim ele mostra: `Received: "1 saída e undefined recebimento
     * do período."`
     */
    const recado = page.getByText(/saídas? e .+ recebimentos? do período\./).first();
    await expect(recado).toBeVisible();
    expect(await recado.textContent()).toBe("1 saída e 1 recebimento do período.");

    // — E o BANCO, que é o que a contadora vai receber. —
    await expect
      .poll(async () =>
        (await db
          .select({ em: pagamentosTable.enviadoContabilidadeEm })
          .from(pagamentosTable)
          .where(eq(pagamentosTable.id, criado.pagamentoId!)))[0]?.em ?? null,
      )
      .not.toBeNull();
    await expect
      .poll(async () =>
        (await db
          .select({ atoId: envioContabilidadeDeRecebimentosTable.atoId })
          .from(envioContabilidadeDeRecebimentosTable)
          .where(eq(envioContabilidadeDeRecebimentosTable.parcelaId, criado.parcelaId!))).length,
      )
      .toBe(1);
  });
});

test.describe("Onda 5 — PDF de contrato", () => {
  let contratoDoPdf: { contratoId: string; leadId: string } | null = null;
  test.afterAll(async () => {
    if (!contratoDoPdf) return;
    await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, contratoDoPdf.contratoId));
    await db.delete(contratosTable).where(eq(contratosTable.id, contratoDoPdf.contratoId));
    await db.delete(leadsTable).where(eq(leadsTable.id, contratoDoPdf.leadId));
  });

  test("PROBE API: o contrato baixa como PDF de verdade", async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    // E246 (D3): o contrato é PRÓPRIO. Era `lista[0]` de `GET /contratos` — um
    // contrato ARBITRÁRIO (hoje um ATIVO, amanhã um CANCELADO) — e o
    // `test.skip` sobre lista vazia era um dos "4 skipped" da S-O93: um teste
    // ausente num banco novo (regra 19).
    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E PDF ${Date.now()}`, origem: "LOJA", ...QUALIFICACAO_DA_NOIVA },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    const leadId = ((await lead.json()) as { id: string }).id;
    const me = await request.get(`${API_URL}/api/auth/me`);
    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: { leadId, vendedoraId: (await me.json()).usuario.id, valorTotal: 1800 },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    const contratoId = ((await contrato.json()) as { id: string }).id;
    contratoDoPdf = { contratoId, leadId };

    const res = await request.get(
      `${API_URL}/api/lojas/${estado.lojaId}/contratos/${contratoId}/pdf`,
    );
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    // O byte, não a promessa: um PDF válido começa com %PDF- e fecha com %%EOF.
    const corpo = await res.body();
    expect(corpo.subarray(0, 5).toString()).toBe("%PDF-");
    expect(corpo.subarray(-6).toString()).toContain("%%EOF");
  });
});
