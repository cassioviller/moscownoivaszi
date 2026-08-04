import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, ausenciasTable } from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E151 — a ausência da vendedora existe, e a agenda a respeita.
 *
 * O que este teste prega, e por quê: a doutrina do E27 diz que a tela recusa
 * ANTES do gesto. Uma vendedora de férias com o dia inteiro oferecido é a
 * versão exata do defeito que essa doutrina existe para evitar — a pessoa
 * clica, escolhe a noiva, preenche tudo, e leva 422 no fim.
 *
 * No papel a ausência é a PRIMEIRA coisa que a página do caderno declara: 7 das
 * 14 páginas anunciam quem está fora.
 */
test.describe("Ausência da equipe na agenda (E151)", () => {
  let ausenciaId: string | null = null;
  let vendedoraId: string | null = null;
  let vendedoraNome: string | null = null;
  let dia: string | null = null;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const membros = (await equipe.json()) as { usuarioId: string; nome: string }[];
    vendedoraId = membros[0]!.usuarioId;
    vendedoraNome = membros[0]!.nome;

    // Um dia bem à frente: o banco do E2E persiste, e uma ausência sobre a
    // agenda de hoje atrapalharia os outros specs.
    dia = new Date(Date.now() + 250 * 86_400_000).toISOString().slice(0, 10);
    const criada = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/ausencias`, {
      data: { usuarioId: vendedoraId, inicio: dia, fim: dia, motivo: "E2E Férias" },
    });
    expect(criada.status(), await criada.text()).toBe(201);
    ausenciaId = ((await criada.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    if (ausenciaId) await db.delete(ausenciasTable).where(eq(ausenciasTable.id, ausenciaId));
  });

  test("no dia da ausência a tela não oferece horário, e diz quem está fora", async ({ page }) => {
    await page.goto("/atendimentos/novo");

    // A noiva do seed, a cabine do seed, a vendedora ausente e o dia dela.
    await page.getByLabel("Cabine", { exact: true }).click();
    await page.getByRole("option").first().click();
    await page.getByLabel("Vendedora", { exact: true }).click();
    await page.getByRole("option", { name: vendedoraNome! }).click();
    await page.getByLabel("Data", { exact: true }).fill(dia!);

    // O aviso substitui a grade de botões apagados: a frase diz o nome e o
    // período, que é o que a vendedora precisa para decidir o que fazer.
    const aviso = page.getByTestId("aviso-vendedora-ausente");
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText(vendedoraNome!);
    await expect(page.getByTestId("grade-slots")).toHaveCount(0);
  });

  test("a ausência aparece em Cabines & horário, com quem e quando", async ({ page }) => {
    await page.goto("/atendimentos/config");
    const lista = page.getByTestId("lista-ausencias");
    await expect(lista).toBeVisible();
    await expect(lista.getByText("E2E Férias")).toBeVisible();
  });
});
