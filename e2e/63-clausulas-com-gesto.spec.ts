import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  contratosTable,
  parcelasTable,
  bloqueioVestidosTable,
  vestidosTable,
  contasPagarTable,
} from "../lib/db/src/index";
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
      // S-O130 — achado da MEDIÇÃO: a rescisão pela LOJA (13ª, o clique
      // "cancelar-rescisao-loja") cria a conta a pagar da devolução com
      // origem_contrato_id, e este hook a deixava (a FK é SET NULL). A
      // varredura-fixture não vê o que nasce por CLIQUE; a contagem no banco
      // depois do run viu: +1 conta DEVOLUCAO por passada, criada 6 s antes
      // do fim do run — neste spec, não no 62.
      await db.delete(contasPagarTable).where(eq(contasPagarTable.origemContratoId, contratoId));
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

/**
 * E223/E219 — a 17ª ganha porta e guarda: trocar a peça do contrato.
 *
 * A cena DECIDE a asserção pelo dia da semana em SP, e isso não é flakiness —
 * é a cláusula: o §1º veda troca às sextas e aos sábados, então o MESMO clique
 * é especificado para dar 200 na quarta e 422 na sexta. O relógio do servidor
 * do E2E é o real (não há como fixá-lo daqui), e as duas pernas do branch são
 * determinísticas dado o dia; os sete dias da régua pura estão pregados em
 * `troca.test.ts`, e o caminho completo do sucesso em `e219-troca-com-prazo`,
 * que fixa o relógio por dentro do processo.
 */
test.describe.serial("E223/E219 — a troca de peça do contrato (17ª)", () => {
  const stamp = Date.now();
  let leadId: string;
  let contratoId: string;
  let vestidoAId: string;
  let vestidoBId: string;
  let bloqueioAId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Troca ${stamp}`, origem: "LOJA", ...QUALIFICACAO_DA_NOIVA },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = ((await lead.json()) as { id: string }).id;

    for (const [rotulo, setter] of [
      ["A", (id: string) => (vestidoAId = id)],
      ["B", (id: string) => (vestidoBId = id)],
    ] as const) {
      const v = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/vestidos`, {
        data: { codigo: `TROCA${rotulo}${stamp}`, nome: `Vestido Troca ${rotulo} ${stamp}`, precoBase: 4000 },
      });
      expect(v.status(), await v.text()).toBe(201);
      setter((await v.json()).id);
    }

    const casamento = new Date(Date.now() + 90 * 86_400_000).toISOString();
    const blq = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/bloqueios`, {
      data: { vestidoId: vestidoAId, leadId, tipo: "RESERVA_CASAMENTO", casamentoData: casamento },
    });
    expect(blq.status(), await blq.text()).toBe(201);
    bloqueioAId = (await blq.json()).id;

    const me = await request.get(`${API_URL}/api/auth/me`);
    const vendedoraId = (await me.json()).usuario.id;
    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: { leadId, vendedoraId, valorTotal: 4000, bloqueioVestidoIds: [bloqueioAId] },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    contratoId = ((await contrato.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    // O banco do e2e persiste; a ordem é a dos FKs. `contrato_bloqueios` e
    // `contrato_itens` caem em cascata com o contrato; os bloqueios (o antigo
    // e o que a troca criou) saem pelos vestidos DESTE run.
    if (contratoId) await db.delete(contratosTable).where(eq(contratosTable.id, contratoId));
    for (const vestidoId of [vestidoAId, vestidoBId]) {
      if (!vestidoId) continue;
      await db.delete(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.vestidoId, vestidoId));
      await db.delete(vestidosTable).where(eq(vestidosTable.id, vestidoId));
    }
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("a ficha da peça oferece a troca, e a 17ª §1º governa o dia", async ({ page }) => {
    await page.goto(`/reservas/${bloqueioAId}`);

    await expect(page.getByText("Peça do contrato")).toBeVisible();

    const diaSP = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    if (diaSP === "Fri" || diaSP === "Sat") {
      // O §1º fala ANTES do clique: a seção mostra a frase, não o botão — e o
      // servidor aplicaria o MESMO veto (é a mesma função, provado na API).
      await expect(page.getByTestId("troca-vedada")).toContainText("sextas-feiras e aos sábados");
      await expect(page.getByTestId("trocar-peca-do-contrato")).toHaveCount(0);
    } else {
      await page.getByTestId("trocar-peca-do-contrato").click();
      await page.getByTestId("peca-nova-da-troca").click();
      await page.getByRole("option", { name: `TROCAB${stamp}`, exact: false }).click();
      await page.getByTestId("confirmar-troca-de-peca").click();
      await expect(
        page.getByText("Peça trocada — a reserva nova responde pelo contrato").first(),
      ).toBeVisible();
      // A ficha navegou para a reserva NOVA, do vestido B.
      await expect(page).not.toHaveURL(new RegExp(bloqueioAId));
      await expect(page.getByText(`Vestido Troca B ${stamp}`).first()).toBeVisible();
    }
  });

  test("contrato fechado há 10 dias: a frase do PRAZO ocupa o lugar do botão, em qualquer dia", async ({ page }) => {
    await db
      .update(contratosTable)
      .set({ fechadoEm: new Date(Date.now() - 10 * 86_400_000) })
      .where(eq(contratosTable.id, contratoId));

    // A troca do primeiro teste pode ter acontecido (dia permitido) ou não
    // (sexta/sábado) — a ficha certa é a da reserva VIVA presa pelo contrato.
    const vivas = await db
      .select({ id: bloqueioVestidosTable.id, canceladoEm: bloqueioVestidosTable.canceladoEm })
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.leadId, leadId));
    const viva = vivas.find((b) => !b.canceladoEm);
    expect(viva, "a noiva tem de ter uma reserva viva").toBeTruthy();

    await page.goto(`/reservas/${viva!.id}`);
    await expect(page.getByTestId("troca-vedada")).toContainText("conta do fecho do contrato");
    await expect(page.getByTestId("trocar-peca-do-contrato")).toHaveCount(0);
  });
});
