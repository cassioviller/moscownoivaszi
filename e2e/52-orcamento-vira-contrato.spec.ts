import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  usuariosTable,
  leadsTable,
  orcamentosTable,
  orcamentoItensTable,
  contratosTable,
  vestidosTable,
  bloqueioVestidosTable,
} from "../lib/db/src/index";
import { lerEstado, API_URL, QUALIFICACAO_DA_NOIVA, diaLocalSP } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E120 → E162 — a jornada orçamento → contrato, POR DENTRO do gate.
 *
 * O A02.6/A01.6 mediu: este spec era o único E2E de orçamento→contrato e
 * passava POR FORA do E150 — o item não tinha `vestidoId`, então a guarda
 * "peça vendida exige reserva" nunca rodava, e a jornada verde autorizava o
 * beco que a vendedora real encontrava. Agora o item aponta uma peça REAL do
 * acervo, a noiva aceita pelo link público, o aceite aparece na fila de
 * /mensagens, e a reserva nasce DENTRO do diálogo de contrato (E162) — o
 * caminho novo inteiro, de ponta a ponta, pela interface.
 *
 * O B1/B6 do E120 continua provado no mesmo fluxo: a venda nasce da Maria e a
 * data do casamento vem da ficha.
 */
test.describe("Orçamento vira contrato (E120 + E162)", () => {
  const stamp = Date.now();
  const noivaNome = `E2E Venda da Maria ${stamp}`;
  const CASAMENTO = "2027-05-15";
  let leadId: string;
  let orcamentoId: string;
  let vestidoId: string;
  let mariaId: string;
  let mariaNome: string;

  test.beforeAll(async () => {
    const [maria] = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome })
      .from(usuariosTable)
      .where(eq(usuariosTable.email, estado.mariaEmail));
    mariaId = maria.id;
    mariaNome = maria.nome;

    leadId = randomUUID();
    await db.insert(leadsTable).values({
      id: leadId,
      lojaId: estado.lojaId,
      noivaNome,
      // Meio-dia UTC: o `slice(0, 10)` da tela lê o dia sem risco de véspera.
      // E247 (G5): a âncora da CASA (meio-dia em SP) — a régua de data de negócio
      // passou a alcançar este insert direto, e "T12:00:00Z" (09:00 SP) era a
      // mesma intenção noutra gramática.
      casamentoData: new Date(`${CASAMENTO}T12:00:00-03:00`),
      /**
       * E215 — este spec insere o lead DIRETO no banco (não pela porta), então
       * a qualificação entra como coluna e não como payload. Sem ela o caminho
       * inteiro que o spec encena — aceite → fila → reserva inline → contrato —
       * morre no último passo com `422 QUALIFICACAO_INCOMPLETA`, que é o
       * comportamento certo da porta sobre uma noiva que não pode assinar.
       *
       * `nascimento` é `Date` aqui e string ISO na `QUALIFICACAO_DA_NOIVA` dos
       * outros dez: lá o valor atravessa o zod da porta, aqui vai para a coluna.
       */
      ...QUALIFICACAO_DA_NOIVA,
      nascimento: new Date("1996-03-12T12:00:00Z"),
    });

    // E162: a peça REAL do acervo — é ela que faz o gate do E150 rodar.
    vestidoId = randomUUID();
    await db.insert(vestidosTable).values({
      id: vestidoId,
      lojaId: estado.lojaId,
      codigo: `e2e-52-${stamp}`,
      nome: `Vestido do gate ${stamp}`,
      precoBase: 4200,
    });

    orcamentoId = randomUUID();
    await db.insert(orcamentosTable).values({
      id: orcamentoId,
      lojaId: estado.lojaId,
      leadId,
      vendedoraId: mariaId,
      status: "RASCUNHO",
    });
    await db.insert(orcamentoItensTable).values({
      id: randomUUID(),
      lojaId: estado.lojaId,
      orcamentoId,
      tipo: "VESTIDO",
      vestidoId,
      descricao: `Vestido E2E ${stamp}`,
      valorUnitario: 4200,
      quantidade: 1,
    });
  });

  test.afterAll(async () => {
    // contratos.leadId é RESTRICT — o contrato sai antes do cascade do lead; e
    // a reserva criada pelo diálogo sai antes do vestido e do lead dela.
    if (leadId) {
      await db.delete(contratosTable).where(eq(contratosTable.leadId, leadId));
    }
    if (vestidoId) {
      await db.delete(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.vestidoId, vestidoId));
    }
    if (leadId) {
      await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
    }
    if (vestidoId) {
      await db.delete(vestidosTable).where(eq(vestidosTable.id, vestidoId));
    }
  });

  test("rascunho sem aceite: a primária é o link; Aprovar mora no menu (B5)", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/orcamentos/${orcamentoId}`);
    await expect(page.getByText(noivaNome).first()).toBeVisible();

    // O botão colorido é chegar à noiva — não o passo que queima o aceite.
    await expect(page.getByRole("button", { name: /Link para a noiva|Copiar link da noiva/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Aprovar", exact: true })).toHaveCount(0);

    // "Aprovar" continua a um clique — dentro do "Mais ações".
    await page.getByRole("button", { name: "Mais ações" }).click();
    await expect(page.getByRole("menuitem", { name: "Aprovar" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("aceite → fila → reserva inline → contrato: o caminho novo, por dentro do gate", async ({ page }) => {
    /**
     * 1. O link nasce (congela a versão) e a NOIVA aceita pelo endpoint
     * público — sem sessão, como no sábado às 23h. A UI dela é coberta pelo
     * spec 22 do link público; aqui o aceite entra por API para o spec provar
     * o lado da LOJA, que é o que o E162 mudou.
     */
    const link = await page.request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/orcamentos/${orcamentoId}/link`,
    );
    expect(link.ok()).toBeTruthy();
    const { token } = (await link.json()) as { token: string };
    const aceite = await page.request.post(`${API_URL}/api/orcamentos/publico/aceite?token=${token}`);
    expect(aceite.ok()).toBeTruthy();

    // 2. A FILA sabe: o aceite parado aparece em /mensagens com o gesto.
    await page.goto(`/loja/${estado.lojaId}/mensagens`);
    const fila = page.getByTestId("card-fila-aceitos");
    await expect(fila.getByText(noivaNome)).toBeVisible();
    await expect(fila.getByText(/peça(s)? sem reserva/)).toBeVisible();

    // 3. O diálogo de contrato avisa ANTES do clique — e a reserva nasce ALI.
    await page.goto(`/loja/${estado.lojaId}/orcamentos/${orcamentoId}`);
    const gerar = page.getByRole("button", { name: "Gerar contrato" });
    await expect(gerar).toBeVisible();
    await gerar.click();

    const dialogo = page.getByRole("dialog");
    // B1: o diálogo nasce da vendedora do ORÇAMENTO — não da admin logada.
    await expect(dialogo.getByTestId("select-vendedora-venda")).toContainText(mariaNome);
    // B6: a data do casamento vem da ficha, sem redigitar.
    await expect(dialogo.getByLabel("Data do casamento")).toHaveValue(CASAMENTO);

    // A02.2: o aviso vermelho existe ANTES de digitar o carnê.
    await expect(dialogo.getByTestId(`peca-sem-reserva-${vestidoId}`)).toBeVisible();

    // E162: "Reservar agora" — a reserva nasce sem sair do diálogo (E65).
    await dialogo.getByTestId(`button-reservar-${vestidoId}`).click();
    await expect(dialogo.getByTestId(`peca-sem-reserva-${vestidoId}`)).toHaveCount(0);
    await expect(dialogo.getByText(/Vestido do gate/)).toBeVisible();

    /**
     * S-C35/E224 — a retirada e a devolução, sugeridas pela reserva.
     *
     * O casamento é **sábado 15/05/2027**, e é o caso que a régua existe para
     * pegar: a janela de uso vai de quarta 12 a **segunda 17**, e a loja não
     * retira nem devolve na segunda (cláusula 4ª). A devolução anda para a
     * **terça 18**, e o diálogo diz que andou. A hora é a da 5ª: 10:30 e 18:00.
     */
    await expect(dialogo.getByTestId("input-data-retirada")).toHaveValue("2027-05-12T10:30");
    await expect(dialogo.getByTestId("input-data-devolucao")).toHaveValue("2027-05-18T18:00");
    await expect(dialogo.getByTestId("aviso-janela-da-reserva")).toContainText("18/05/2027");

    // 4. O contrato fecha POR DENTRO do gate — a reserva recém-criada vai junto.
    // E246 (D9): era "2026-09-10" cravado — a partir de 11/09/2026 a cena
    // passaria a encenar uma parcela VENCIDA com mora, sem uma linha mudar.
    // O vencimento é derivado de hoje: sempre 30 dias à frente.
    await dialogo.getByLabel(/1ª parcela vence em/).fill(diaLocalSP(30));
    await dialogo.getByRole("button", { name: "Gerar contrato" }).click();

    await expect(page).toHaveURL(/\/contratos\/[0-9a-f-]+$/);

    // E a ficha do contrato lê as duas de volta, COM a hora — não só o dia.
    // (`instanteCurto` é o pt-BR com vírgula: "12/05/2027, 10:30".)
    const datasNaFicha = page.getByTestId("datas-da-locacao");
    await expect(datasNaFicha).toContainText("12/05/2027, 10:30");
    await expect(datasNaFicha).toContainText("18/05/2027, 18:00");

    // A prova do dinheiro (B1): a venda é da Maria, não de quem clicou. E a
    // prova do gate: o contrato prende a reserva que o diálogo criou.
    const [contrato] = await db
      .select({
        id: contratosTable.id,
        vendedoraId: contratosTable.vendedoraId,
        dataRetirada: contratosTable.dataRetirada,
        dataDevolucao: contratosTable.dataDevolucao,
      })
      .from(contratosTable)
      .where(eq(contratosTable.leadId, leadId));
    expect(contrato.vendedoraId).toBe(mariaId);
    // E224: os INSTANTES no banco, no relógio da loja — 10:30 SP = 13:30 UTC.
    expect(contrato.dataRetirada?.toISOString()).toBe("2027-05-12T13:30:00.000Z");
    expect(contrato.dataDevolucao?.toISOString()).toBe("2027-05-18T21:00:00.000Z");
    const [reserva] = await db
      .select({ leadId: bloqueioVestidosTable.leadId })
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.vestidoId, vestidoId));
    expect(reserva.leadId).toBe(leadId);
  });
});
