import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  contratosTable,
  parcelasTable,
  vestidosTable,
  reservasTable,
} from "../lib/db/src/index";
import { lerEstado, API_URL, sessaoViaAPI, fecharTourDoAcesso } from "./helpers";

const estado = lerEstado();

/**
 * E167 — a avaria fecha, da ficha até o carnê.
 *
 * O spec 48 já provava o caminho feliz: bloqueio COM noiva, contrato ATIVO,
 * botão, parcela. Ele era verde sobre os três casos que a loja tem de verdade
 * e que nenhum teste cruzava:
 *
 * - **V14** — o bloqueio pendurado numa reserva-mãe, sem `lead_id` próprio. Em
 *   2026-07, `61 das 63 avarias do banco` viviam assim, e a ficha não desenhava
 *   o botão em nenhuma delas: `useListContratos` rodava com
 *   `enabled: !!reserva.leadId`. **S-C10 (13/08/2026): remedido — ZERO avarias
 *   nos dois bancos e ZERO véus em `moscow_base`.** Este spec é o único lugar
 *   onde a montagem existe hoje, e é por isso que ele fica.
 * - **V2** — o contrato cancelado. A parcela do reparo vira CANCELADA junto, o
 *   servidor volta a aceitar cobrar e remover, e a tela dizia "Cobrado — ver
 *   parcela" para sempre, com os dois botões escondidos: os R$ 800,00 do
 *   reparo não entravam no contrato novo que a noiva assina depois.
 * - **V15** — quem tem `vestidos.editar` sem `vestidos.criar` (perfil que o
 *   `permissoes.ts` chama de "válido e comum") clicava em "Registrar avaria"
 *   no diálogo da devolução e a página não se movia um pixel.
 */

const stamp = Date.now();
const descricao = `Renda solta na cauda E167 ${stamp}`;
const descricaoV2 = `Cauda manchada E167 ${stamp}`;

test.describe.serial("E167 — a avaria fecha na ficha sem noiva própria", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

  let leadId: string;
  let vestidoId: string;
  let reservaId: string;
  let bloqueioId: string;
  let contratoVelhoId: string;
  let contratoNovoId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Avaria sem noiva ${stamp}` },
    });
    leadId = (await lead.json()).id;

    const vestido = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/vestidos`, {
      data: { nome: `Vestido E167 ${stamp}`, codigo: `E167-${stamp}`, precoBase: 5000 },
    });
    expect(vestido.status(), await vestido.text()).toBe(201);
    vestidoId = (await vestido.json()).id;

    // A reserva-mãe TEM noiva (`reservas.lead_id` é NOT NULL); o bloqueio,
    // não. Era a montagem de 61 das 63 avarias do banco em 2026-07 — hoje é a
    // montagem de nenhuma (S-C10), e o spec passa a ser quem a mantém viva.
    const reserva = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/reservas`, {
      data: { leadId, casamentoData: "2027-11-20T12:00:00-03:00" },
    });
    expect(reserva.status(), await reserva.text()).toBe(201);
    reservaId = (await reserva.json()).id;

    const bloqueio = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/bloqueios`, {
      data: {
        vestidoId,
        reservaId,
        tipo: "RESERVA_CASAMENTO",
        casamentoData: "2027-11-20T12:00:00-03:00",
      },
    });
    expect(bloqueio.status(), await bloqueio.text()).toBe(201);
    bloqueioId = (await bloqueio.json()).id;
    // A montagem é a do defeito: o bloqueio não tem noiva, a reserva tem.
    const lido = await (
      await request.get(`${API_URL}/api/lojas/${estado.lojaId}/bloqueios/${bloqueioId}`)
    ).json();
    expect(lido.leadId ?? null).toBeNull();

    const admin = await db.query.usuariosTable.findFirst({
      where: (u, { eq: eq_ }) => eq_(u.email, estado.adminEmail),
    });
    contratoVelhoId = randomUUID();
    await db.insert(contratosTable).values({
      id: contratoVelhoId,
      lojaId: estado.lojaId,
      leadId,
      vendedoraId: admin!.id,
      status: "ATIVO",
      valorTotal: 5000,
      fechadoEm: new Date(),
    });
  });

  test.afterAll(async () => {
    for (const id of [contratoVelhoId, contratoNovoId].filter(Boolean)) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, id));
      await db.delete(contratosTable).where(eq(contratosTable.id, id));
    }
    // Vestido antes do lead: o CASCADE leva bloqueio e avaria juntos (S25).
    if (vestidoId) await db.delete(vestidosTable).where(eq(vestidosTable.id, vestidoId));
    if (reservaId) await db.delete(reservasTable).where(eq(reservasTable.id, reservaId));
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("V14 — sem noiva no bloqueio, o botão cobra pela noiva da reserva-mãe", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/reservas/${bloqueioId}`);

    await page.getByLabel("Descrição da avaria").fill(descricao);
    await page.getByLabel("Custo do reparo").fill("800");
    await page.getByTestId("registrar-avaria").click();
    await expect(page.getByText(descricao)).toBeVisible();

    // Era aqui que a ficha parava: sem `leadId` no bloqueio a consulta do
    // contrato nem saía, e o botão não existia em 97% das avarias do banco.
    await page.getByRole("button", { name: "Cobrar reparo", exact: true }).click();
    // E232/S-C98: o diálogo do prazo entrou no caminho.
    await page.getByTestId("confirmar-cobranca-reparo").click();
    await expect(
      page.getByText("Cobrança criada — entrou como parcela do contrato").first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Cobrado — ver parcela" })).toBeVisible();

    const parcelas = await db
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.contratoId, contratoVelhoId));
    expect(parcelas).toHaveLength(1);
    expect(parcelas[0].valorPrevisto).toBe(800);
    expect(parcelas[0].status).toBe("PREVISTA");
  });

  /**
   * A montagem inteira pela API — a avaria, a cobrança, o cancelamento e o
   * contrato novo. É de propósito: assim o V2 mede o estado sem depender de o
   * V14 ter passado, e os dois vermelhos podem ser medidos separadamente.
   */
  test("V2 — cancelado o contrato, os R$ 800,00 do reparo entram no contrato novo", async ({
    page,
    request,
  }) => {
    const avaria = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/bloqueios/${bloqueioId}/avarias`,
      { data: { descricao: descricaoV2, custoReparo: 800 } },
    );
    expect(avaria.status(), await avaria.text()).toBe(201);
    const cobrar = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/avarias/${(await avaria.json()).id}/cobrar`,
      { data: { contratoId: contratoVelhoId } },
    );
    expect(cobrar.status(), await cobrar.text()).toBe(201);

    const cancelar = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/contratos/${contratoVelhoId}/cancelar`,
      { data: { motivo: "Noiva remarcou o casamento" } },
    );
    expect(cancelar.status(), await cancelar.text()).toBe(200);

    // A noiva volta meses depois e assina outro contrato. O reparo continua
    // devido — e é ele que o servidor aceita recobrar.
    const admin = await db.query.usuariosTable.findFirst({
      where: (u, { eq: eq_ }) => eq_(u.email, estado.adminEmail),
    });
    contratoNovoId = randomUUID();
    await db.insert(contratosTable).values({
      id: contratoNovoId,
      lojaId: estado.lojaId,
      leadId,
      vendedoraId: admin!.id,
      status: "ATIVO",
      valorTotal: 6000,
      fechadoEm: new Date(),
    });

    await page.goto(`/loja/${estado.lojaId}/reservas/${bloqueioId}`);
    await expect(page.getByText(descricaoV2)).toBeVisible();
    // A tela lia só `parcelaId` e mostrava "Cobrado — ver parcela" para
    // sempre: o botão de recobrar e o de remover ficavam escondidos.
    await expect(page.getByRole("link", { name: "Cobrado — ver parcela" })).toHaveCount(0);

    // O "Remover" volta ao diálogo — a parcela CANCELADA não sustenta prova
    // nenhuma, e o servidor já aceitava o DELETE.
    await page.getByRole("button", { name: "Remover avaria" }).first().click();
    await expect(page.getByRole("button", { name: "Remover", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();

    await page.getByRole("button", { name: "Recobrar reparo" }).first().click();
    await page.getByTestId("confirmar-cobranca-reparo").click();
    await expect(
      page.getByText("Cobrança criada — entrou como parcela do contrato").first(),
    ).toBeVisible();

    const noNovo = await db
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.contratoId, contratoNovoId));
    expect(noNovo).toHaveLength(1);
    expect(noNovo[0].valorPrevisto).toBe(800);
    expect(noNovo[0].status).toBe("PREVISTA");
  });
});

/**
 * V15 — o botão que não fazia nada.
 *
 * O perfil `{ver, editar}` sem `criar` em vestidos é o que o `permissoes.ts`
 * documenta como "válido e comum": a gerente que revisa o que a vendedora
 * cadastrou. Ela registra a devolução (é `editar`), o diálogo do F25 abre, ela
 * clica em "Registrar avaria" — e o `getElementById(...)?.scrollIntoView`
 * engole a chamada no `?.`, porque o formulário só existe sob `criar`.
 */
test.describe.serial("E167 — quem não pode registrar avaria lê o motivo", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let leadId: string;
  let vestidoId: string;
  let bloqueioId: string;
  let perfilVendedoraId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Avaria gate ${stamp}` },
    });
    leadId = (await lead.json()).id;
    const vestido = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/vestidos`, {
      data: { nome: `Vestido gate ${stamp}`, codigo: `E167G-${stamp}`, precoBase: 4000 },
    });
    vestidoId = (await vestido.json()).id;
    const bloqueio = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/bloqueios`, {
      data: {
        vestidoId,
        leadId,
        tipo: "RESERVA_CASAMENTO",
        casamentoData: "2027-10-02T12:00:00-03:00",
      },
    });
    bloqueioId = (await bloqueio.json()).id;
    // A peça já saiu: é a retirada que faz a tela oferecer "Registrar devolução".
    const retirada = await request.patch(
      `${API_URL}/api/lojas/${estado.lojaId}/bloqueios/${bloqueioId}`,
      { data: { retiradaDataReal: "2027-09-28T12:00:00-03:00" } },
    );
    expect(retirada.status(), await retirada.text()).toBe(200);

    // O perfil `{ver, editar}` sem `criar` em vestidos, pela porta de override
    // da loja — o mesmo gesto do spec 46, e desfeito no afterAll.
    const perfis = await (await request.get(`${API_URL}/api/admin/perfis`)).json();
    const vendedora = perfis.find((p: { nome: string }) => p.nome === "Vendedora");
    expect(vendedora, "o perfil Vendedora do seed").toBeTruthy();
    perfilVendedoraId = vendedora.id;
    const override = await request.put(
      `${API_URL}/api/admin/lojas/${estado.lojaId}/overrides`,
      {
        data: {
          perfilId: perfilVendedoraId,
          acessosModulos: {
            ...vendedora.acessosModulos,
            vestidos: { ver: true, criar: false, editar: true },
          },
        },
      },
    );
    expect(override.status(), await override.text()).toBe(200);
  });

  test.afterAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
    if (perfilVendedoraId) {
      await request.delete(
        `${API_URL}/api/admin/lojas/${estado.lojaId}/overrides/${perfilVendedoraId}`,
      );
    }
    if (vestidoId) await db.delete(vestidosTable).where(eq(vestidosTable.id, vestidoId));
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("V15 — sem `criar`, o diálogo da devolução diz o motivo em vez de oferecer um botão morto", async ({
    page,
  }) => {
    await sessaoViaAPI(page, estado.mariaEmail, estado.senha, estado.lojaId);
    await page.goto(`/loja/${estado.lojaId}/reservas/${bloqueioId}`);
    // O tour do acesso (E24) abre na primeira entrada do perfil e o overlay do
    // Radix intercepta todo clique atrás dele. Ele também é a prova do estado:
    // o card de Vestidos lista "ver" e "editar", e nenhum "criar".
    await fecharTourDoAcesso(page);

    // Ela PODE registrar a devolução: `editar` é dela.
    await page.getByLabel("Data da devolução").fill("2027-10-05");
    await page.getByRole("button", { name: "Registrar devolução" }).click();

    // O diálogo do F25 abre — e é aqui que ele mentia.
    await expect(page.getByText("O vestido voltou como saiu?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar avaria" })).toHaveCount(0);
    await expect(page.getByText(/permissão de .*criar.* em Vestidos/)).toBeVisible();
  });
});
