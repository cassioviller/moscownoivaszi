import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  contratosTable,
  contratoItensTable,
  contratoBloqueiosTable,
  parcelasTable,
  vestidosTable,
  reservasTable,
  bloqueioVestidosTable,
} from "../lib/db/src/index";
import { lerEstado, API_URL, QUALIFICACAO_DA_NOIVA, diaLocalSP } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * **S-CF2 — a 16ª PELA TELA.** A cobrança do atraso na devolução (E212) tinha
 * porta, prévia, fila e cenas de API (e212, E245 com as corridas) — e nenhum
 * teste de tela clicava "Cobrar o atraso". O campo de prazo do E244 (C5)
 * nasceu igualmente sem cena. Esta é a cena: uma peça retirada, casamento há
 * 10 dias, janela de uso fechada há 8, a peça ainda fora — a ficha da reserva
 * mostra a conta da 16ª, a vendedora escolhe o prazo e cobra, e a parcela
 * nasce no carnê vencendo no prazo escolhido.
 *
 * A montagem é DIRETA no banco (casamento no passado não passa pela porta de
 * reservar), com a âncora da casa (meio-dia SP) — a régua de data de negócio
 * do E247 alcança este arquivo.
 */
test.describe("Cobrar o atraso pela tela (16ª) — S-CF2", () => {
  const stamp = Date.now();
  let leadId: string;
  let vestidoId: string;
  let reservaId: string;
  let bloqueioId: string;
  let contratoId: string;

  const anc = (diasAtras: number) => new Date(`${diaLocalSP(-diasAtras)}T12:00:00-03:00`);

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Atraso pela tela ${stamp}`, origem: "LOJA", ...QUALIFICACAO_DA_NOIVA },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = (await lead.json()).id;

    const vestido = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/vestidos`, {
      data: { nome: `Vestido Atraso ${stamp}`, codigo: `ATR-${stamp}`, precoBase: 3000 },
    });
    expect(vestido.status(), await vestido.text()).toBe(201);
    vestidoId = (await vestido.json()).id;

    const me = await request.get(`${API_URL}/api/auth/me`);
    const vendedoraId = (await me.json()).usuario.id;

    // Casamento há 10 dias, retirada há 13, devolução ainda não: a janela de
    // uso (3 antes + 2 depois no AJUSTE_E2E) fechou há 8 dias — 8 dias de atraso.
    reservaId = randomUUID();
    await db.insert(reservasTable).values({
      id: reservaId,
      lojaId: estado.lojaId,
      leadId,
      casamentoData: anc(10),
      status: "CONFIRMADA",
    });
    bloqueioId = randomUUID();
    await db.insert(bloqueioVestidosTable).values({
      id: bloqueioId,
      lojaId: estado.lojaId,
      vestidoId,
      leadId,
      reservaId,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: anc(10),
      retiradaDataReal: anc(13),
      ocupacaoInicio: diaLocalSP(-13),
      ocupacaoFim: diaLocalSP(-8),
    });
    contratoId = randomUUID();
    await db.insert(contratosTable).values({
      id: contratoId,
      lojaId: estado.lojaId,
      leadId,
      vendedoraId,
      status: "ATIVO",
      valorTotal: 3000,
      fechadoEm: anc(20),
    });
    await db.insert(contratoBloqueiosTable).values({ contratoId, bloqueioId });
    await db.insert(contratoItensTable).values({
      id: randomUUID(),
      lojaId: estado.lojaId,
      contratoId,
      tipo: "VESTIDO",
      vestidoId,
      descricao: `Vestido Atraso ${stamp}`,
      valorUnitario: 3000,
      quantidade: 1,
    });
  });

  test.afterAll(async () => {
    if (contratoId) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));
      await db.delete(contratoItensTable).where(eq(contratoItensTable.contratoId, contratoId));
      await db.delete(contratoBloqueiosTable).where(eq(contratoBloqueiosTable.contratoId, contratoId));
      await db.delete(contratosTable).where(eq(contratosTable.id, contratoId));
    }
    if (bloqueioId) await db.delete(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.id, bloqueioId));
    if (reservaId) await db.delete(reservasTable).where(eq(reservasTable.id, reservaId));
    if (vestidoId) await db.delete(vestidosTable).where(eq(vestidosTable.id, vestidoId));
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("a ficha da reserva mostra a conta da 16ª, o prazo se escolhe, e a parcela nasce no carnê", async ({ page, request }) => {
    await page.goto(`/reservas/${bloqueioId}`);

    // A conta, antes do clique: 8 dias × R$ 500,00 (R$ 3.000 ÷ 6) + R$ 250,00 = R$ 4.250,00.
    await expect(page.getByTestId("atraso-valor")).toContainText("4.250,00");
    await expect(page.getByTestId("atraso-explicacao")).toContainText("16ª");

    // O prazo (E244/C5): a vendedora escolhe 10 dias.
    const prazo = page.getByTestId("input-prazo-cobranca-atraso");
    await expect(prazo).toBeVisible();
    await prazo.fill("");
    // C10: vazio não cobra.
    await expect(page.getByTestId("cobrar-atraso")).toBeDisabled();
    await prazo.fill("10");
    await page.getByTestId("cobrar-atraso").click();
    await expect(page.getByTestId("atraso-ja-cobrado")).toBeVisible();

    // A parcela existe, com o valor da conta e vencendo no prazo escolhido.
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
    const contrato = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/contratos/${contratoId}`);
    expect(contrato.status()).toBe(200);
    const atraso = ((await contrato.json()).parcelas as { origem: string; valorPrevisto: number; vencimento: string }[])
      .find((p) => p.origem === "ATRASO_DEVOLUCAO");
    expect(atraso, "a parcela do atraso no carnê").toBeTruthy();
    expect(atraso!.valorPrevisto).toBe(4250);
    expect(atraso!.vencimento.slice(0, 10)).toBe(diaLocalSP(10));

    // Segundo clique não existe mais: a ficha diz "já cobrado".
    await page.reload();
    await expect(page.getByTestId("atraso-ja-cobrado")).toBeVisible();
    await expect(page.getByTestId("cobrar-atraso")).toHaveCount(0);
  });
});
