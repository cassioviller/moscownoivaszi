import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, ajustesTable, atendimentosTable, leadsTable, vestidosTable } from "../lib/db/src/index";
import { lerEstado, API_URL, criarAtendimentoLivre, apagarCabineCriada } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E156 — a confecção vira peça do acervo (P4).
 *
 * O E155 pôs a peça sob medida na fila; este é o caminho que ela faz DEPOIS do
 * casamento. O que o teste prega é que a transição é um **gesto** — sai da fila
 * porque alguém decidiu, com o preço do ALUGUEL digitado (não o custo da
 * costureira) — e que, feita uma vez, a fila passa a mostrar a peça no lugar do
 * gesto: a mesma confecção não vira duas peças com dois códigos.
 */
test.describe("A confecção vira peça do acervo (E156)", () => {
  let leadId: string | null = null;
  let atendimentoId: string | null = null;
  let ajusteId: string | null = null;
  let vestidoId: string | null = null;
  let cabineId: string | null = null;

  const codigo = `E2E-CONF-${Date.now().toString(36)}`;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
  });

  test.afterAll(async () => {
    // A peça primeiro: ela é quem aponta o trabalho, e a limpeza segue a mesma
    // direção do vínculo.
    if (vestidoId) await db.delete(vestidosTable).where(eq(vestidosTable.id, vestidoId));
    if (ajusteId) await db.delete(ajustesTable).where(eq(ajustesTable.id, ajusteId));
    if (atendimentoId) await db.delete(atendimentosTable).where(eq(atendimentosTable.id, atendimentoId));
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
    // S-D25: a cabine por execução também sai — eram 24 `e59-` acumuladas.
    await apagarCabineCriada(cabineId);
  });

  test("a confecção feita entra no acervo, e a fila passa a mostrar a peça", async ({
    page,
    request,
  }) => {
    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Noiva Acervo ${Date.now()}` },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = ((await lead.json()) as { id: string }).id;

    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoras = (await equipe.json()) as { usuarioId: string }[];
    const cabine = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/cabines`, {
      data: { nome: `e59-${Date.now()}` },
    });
    expect(cabine.status(), await cabine.text()).toBe(201);
    cabineId = ((await cabine.json()) as { id: string }).id;

    const atendimento = await criarAtendimentoLivre(request, estado.lojaId, {
      leadId,
      cabineId,
      vendedoraId: vendedoras[0]!.usuarioId,
      ymd: new Date().toISOString().slice(0, 10),
    });
    atendimentoId = atendimento.id;

    const confeccao = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/ajustes`, {
      data: {
        atendimentoId,
        descricao: "E2E Manga que vira acervo",
        tipo: "CONFECCAO",
        // O custo da costureira: 450. O aluguel digitado abaixo é 1.800 — são
        // números diferentes, e é o ponto da tela.
        custo: 450,
      },
    });
    expect(confeccao.status(), await confeccao.text()).toBe(201);
    ajusteId = ((await confeccao.json()) as { id: string }).id;

    // Só a confecção CONCLUÍDA vira peça: a manga não existe até a costureira
    // terminar.
    const feita = await request.patch(
      `${API_URL}/api/lojas/${estado.lojaId}/ajustes/${ajusteId}`,
      { data: { status: "FEITO" } },
    );
    expect(feita.status(), await feita.text()).toBe(200);

    await page.goto("/ajustes?recorte=feitos");
    await expect(page.getByText("E2E Manga que vira acervo")).toBeVisible();

    await page.getByRole("link", { name: "Virou peça do acervo" }).click();

    // O cadastro abre com a ficha da confecção — e diz que o preço é o do
    // aluguel, não o que a costureira cobrou.
    await expect(page.getByRole("heading", { name: "Confecção vira peça do acervo" })).toBeVisible();
    await expect(page.getByLabel("Nome")).toHaveValue("E2E Manga que vira acervo");

    await page.getByLabel("Código").fill(codigo);
    await page.getByLabel("Preço (R$)", { exact: true }).fill("1800,00");
    await page.getByRole("button", { name: "Cadastrar no acervo" }).click();

    // Caiu na ficha da peça, que declara de onde ela veio.
    await expect(page.getByText("Peça confeccionada no ateliê", { exact: false })).toBeVisible();
    await expect(page.getByText(codigo).first()).toBeVisible();

    const url = new URL(page.url());
    vestidoId = url.pathname.split("/").pop()!;

    // E a fila troca o gesto pela peça: a mesma confecção não vira duas.
    await page.goto("/ajustes?recorte=feitos");
    await expect(page.getByText(`no acervo · ${codigo}`)).toBeVisible();
    await expect(page.getByRole("link", { name: "Virou peça do acervo" })).toHaveCount(0);
  });
});
