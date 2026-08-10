import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq, and, like } from "drizzle-orm";
import { db, leadsTable, contratosTable, parcelasTable, vestidosTable } from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E81 (fiscal do E71): a avaria registrada na devolução, quando tem custo e a
 * noiva tem contrato ATIVO, vira parcela cobrável pela régua de sempre — sem
 * planilha paralela de "me devem".
 */
test.describe("Avaria vira parcela (E71)", () => {
  const stamp = Date.now();
  const descricaoAvaria = `Barrado rasgado E2E ${stamp}`;
  let leadId: string;
  let vestidoId: string;
  let bloqueioId: string;
  let contratoId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Avaria ${stamp}` },
    });
    leadId = (await lead.json()).id;

    // Vestido e bloqueio pela API — o envelope de ocupação nasce calculado.
    const vestido = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/vestidos`, {
      data: { nome: `Vestido Avaria ${stamp}`, codigo: `AVA-${stamp}`, precoBase: 5000 },
    });
    expect(vestido.status(), await vestido.text()).toBe(201);
    vestidoId = (await vestido.json()).id;
    const bloqueio = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/bloqueios`, {
      data: {
        vestidoId,
        leadId,
        tipo: "RESERVA_CASAMENTO",
        casamentoData: "2027-11-20T12:00:00-03:00",
      },
    });
    expect(bloqueio.status(), await bloqueio.text()).toBe(201);
    bloqueioId = (await bloqueio.json()).id;

    const admin = await db.query.usuariosTable.findFirst({
      where: (u, { eq: eq_ }) => eq_(u.email, estado.adminEmail),
    });
    contratoId = randomUUID();
    await db.insert(contratosTable).values({
      id: contratoId,
      lojaId: estado.lojaId,
      leadId,
      vendedoraId: admin!.id,
      status: "ATIVO",
      valorTotal: 5000,
      fechadoEm: new Date(),
    });

    // E110: o contrato passa a ter CARNÊ — entrada (numero 0) + 4 parcelas.
    //
    // Sem isto o spec media o ramo errado: contrato sem plano deixa o slot 0
    // livre, e a cobrança do reparo gravava `numero: 0` sem colidir com nada.
    // Era verde sobre o defeito. Com entrada, a rota antiga devolvia
    // `409 REGISTRO_DUPLICADO` — e é este o caso que a loja tem de verdade.
    const plano = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`,
      { data: { entrada: 1000, numParcelas: 4, primeiroVencimento: "2027-01-10" } },
    );
    expect(plano.status(), await plano.text()).toBe(201);
  });

  test.afterAll(async () => {
    // `contratos.lead_id` NÃO cascateia: parcelas → contrato → lead, na ordem.
    if (contratoId) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));
      await db.delete(contratosTable).where(eq(contratosTable.id, contratoId));
    }
    // S25/S-D22: o vestido sai ANTES do lead, e é o que estanca o vazamento.
    // O CASCADE de `bloqueio_vestidos.vestido_id` leva o bloqueio, e o de
    // `avarias.bloqueio_id` leva a avaria — os três numa linha só. Apagar o
    // lead primeiro é o que produzia a reserva ÓRFÃ da S27: o FK do lead é
    // `set null`, e a reserva ficava sem dona em vez de sair.
    //
    // `DELETE /vestidos/:id` NÃO serve aqui, e de propósito: a S-A25 deu guarda
    // à rota (`2912526`) e ela responde 409 VESTIDO_COM_HISTORIA — com razão,
    // porque esta peça TEM história. A fixture apaga pelo banco o que ela mesma
    // criou; a rota protege o acervo de quem vende.
    if (vestidoId) await db.delete(vestidosTable).where(eq(vestidosTable.id, vestidoId));
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("registrar a avaria com custo e cobrar o reparo cria a parcela do contrato", async ({
    page,
  }) => {
    await page.goto(`/loja/${estado.lojaId}/reservas/${bloqueioId}`);

    // Registra a avaria com custo.
    await page.getByLabel("Descrição da avaria").fill(descricaoAvaria);
    await page.getByLabel("Custo do reparo").fill("350");
    await page.getByTestId("registrar-avaria").click();
    await expect(page.getByText(descricaoAvaria)).toBeVisible();

    // Cobrar reparo — o custo entra como parcela do contrato ativo.
    await page.getByTestId(/^cobrar-reparo-/).click();
    await expect(
      page.getByText("Cobrança criada — entrou como parcela do contrato").first(),
    ).toBeVisible();

    const parcelas = await db
      .select()
      .from(parcelasTable)
      .where(
        and(
          eq(parcelasTable.contratoId, contratoId),
          like(parcelasTable.descricao, `%${descricaoAvaria}%`),
        ),
      );
    expect(parcelas).toHaveLength(1);
    expect(parcelas[0].valorPrevisto).toBe(350);
    expect(parcelas[0].status).toBe("PREVISTA");
    // E110: entra DEPOIS do carnê (entrada 0 + parcelas 1..4), nunca por cima
    // da entrada. É a asserção que distingue o conserto do defeito.
    expect(parcelas[0].numero).toBe(5);
  });
});
