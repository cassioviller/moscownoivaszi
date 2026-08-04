import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, ajustesTable, atendimentosTable, leadsTable } from "../lib/db/src/index";
import { lerEstado, API_URL, criarAtendimentoLivre } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E155 — a peça sob medida na fila da costureira.
 *
 * O que este teste prega, e por quê: a confecção não é ajuste de peça
 * existente — é peça NOVA, feita para aquela noiva (`Siam + Manga será
 * confeccionada`, caderno de 10–16/08). Ela divide a fila com o ajuste porque
 * prazo, status e checklist são os mesmos; o que precisa aparecer na tela é a
 * DISTINÇÃO, senão a costureira pega a peça sem saber se corta ou conserta.
 */
test.describe("Confecção na fila da costureira (E155)", () => {
  let leadId: string | null = null;
  let atendimentoId: string | null = null;
  let ajusteId: string | null = null;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
  });

  test.afterAll(async () => {
    if (ajusteId) await db.delete(ajustesTable).where(eq(ajustesTable.id, ajusteId));
    if (atendimentoId) await db.delete(atendimentosTable).where(eq(atendimentosTable.id, atendimentoId));
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("a confecção aparece na fila com selo e custo, ao lado dos ajustes", async ({
    page,
    request,
  }) => {
    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Noiva Confecção ${Date.now()}` },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = ((await lead.json()) as { id: string }).id;

    // A confecção nasce de uma conversa marcada — exatamente os dois
    // compromissos de 10:30 que a agenda do ateliê registra. Cabine própria
    // por execução: o banco do E2E persiste e horário fixo colide (S7/E115).
    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoras = (await equipe.json()) as { usuarioId: string }[];
    const cabine = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/cabines`, {
      data: { nome: `e57-${Date.now()}` },
    });
    expect(cabine.status(), await cabine.text()).toBe(201);

    const atendimento = await criarAtendimentoLivre(request, estado.lojaId, {
      leadId,
      cabineId: ((await cabine.json()) as { id: string }).id,
      vendedoraId: vendedoras[0]!.usuarioId,
      ymd: new Date().toISOString().slice(0, 10),
    });
    atendimentoId = atendimento.id;

    const confeccao = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/ajustes`, {
      data: {
        atendimentoId,
        descricao: "E2E Manga renda c/ saia lisa",
        tipo: "CONFECCAO",
        custo: 450,
      },
    });
    expect(confeccao.status(), await confeccao.text()).toBe(201);
    ajusteId = ((await confeccao.json()) as { id: string }).id;

    // `?recorte=todos` porque a noiva do teste não tem prova nem casamento
    // marcado: sem prazo, ela não é "desta semana" — e é assim que deve ser.
    await page.goto("/ajustes?recorte=todos");
    const linha = page.getByText("E2E Manga renda c/ saia lisa");
    await expect(linha).toBeVisible();

    // O selo é o ponto: as duas naturezas dividem a fila, e a costureira
    // precisa saber qual é qual antes de pegar a peça.
    await expect(page.getByText("Confecção").first()).toBeVisible();
    await expect(page.getByText(/custo\s+R\$\s*450,00/)).toBeVisible();
  });
});
