import { test, expect, type APIRequestContext } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E46: o veredito da projeção aparece onde a dona da loja olha — dashboard e
 * hub de fluxo — sem que ela precise abrir a projeção. E some quando não há o
 * que avisar: o teste derruba o furo e cobra o silêncio, porque um alerta que
 * fica aceso depois do problema resolvido é pior do que não existir.
 *
 * O saldo é conferido pelo mesmo upsert da tela (um por dia): rodar de novo
 * corrige o número em vez de empilhar, então a suíte é idempotente.
 */

const MS_POR_DIA = 86_400_000;
/** Meio-dia SP de hoje+n — a mesma âncora de data de negócio do app. */
const negocio = (n: number) => new Date(Date.now() + n * MS_POR_DIA).toISOString();

async function autenticar(request: APIRequestContext): Promise<void> {
  await request.post(`${API_URL}/api/auth/login`, {
    data: { email: estado.adminEmail, senha: estado.senha },
  });
  await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
}

test.describe("Alerta de caixa (E46)", () => {
  let contaId: string;

  test.beforeAll(async ({ request }) => {
    await autenticar(request);

    // Âncora baixa + uma despesa que a supera dentro do horizonte = furo certo,
    // independentemente do que as outras suítes tenham deixado no caixa.
    const saldo = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/financeiro/saldos-referencia`, {
      data: { dataReferencia: negocio(0), valor: 1_000 },
    });
    expect(saldo.status(), await saldo.text()).toBe(200);

    const conta = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/financeiro/contas-pagar`, {
      data: {
        tipo: "DESPESA",
        descricao: "E2E despesa que fura o caixa",
        valorPrevisto: 500_000,
        vencimento: negocio(7),
      },
    });
    expect(conta.status(), await conta.text()).toBe(201);
    contaId = (await conta.json()).id;
  });

  test.afterAll(async ({ request }) => {
    await autenticar(request);
    if (contaId) {
      await request.delete(`${API_URL}/api/lojas/${estado.lojaId}/contas-pagar/${contaId}`);
    }
  });

  test("o dashboard avisa, e o aviso leva à projeção", async ({ page }) => {
    await page.goto("/dashboard");

    const alerta = page.getByTestId("alerta-caixa");
    await expect(alerta).toBeVisible();
    await expect(alerta).toContainText("Caixa fica negativo em");

    await alerta.getByRole("link", { name: /Ver a projeção/ }).click();
    await expect(page.getByRole("heading", { name: "Projeção de caixa" })).toBeVisible();
    // A mesma conclusão nas duas telas — é a MESMA conta, feita uma vez só.
    await expect(page.getByText(/negativo em/).first()).toBeVisible();
  });

  test("o hub de fluxo mostra o mesmo aviso", async ({ page }) => {
    await page.goto("/financeiro");
    await expect(page.getByRole("heading", { name: "Financeiro" })).toBeVisible();
    await expect(page.getByTestId("alerta-caixa")).toContainText("Caixa fica negativo em");
  });

  test("resolvida a despesa, o aviso se cala", async ({ page, request }) => {
    await autenticar(request);
    const del = await request.delete(`${API_URL}/api/lojas/${estado.lojaId}/contas-pagar/${contaId}`);
    expect(del.status(), await del.text()).toBe(204);
    contaId = "";

    // Cobrar a AUSÊNCIA exige esperar a resposta que decidiria mostrar: sem
    // isso o teste passaria só por chegar antes do alerta ter o que dizer.
    const resposta = page.waitForResponse((r) => r.url().includes("/financeiro/alerta-caixa"));
    await page.goto("/dashboard");
    expect((await resposta).status()).toBe(200);

    await expect(page.getByRole("heading", { name: /Seu dia/ })).toBeVisible();
    await expect(page.getByTestId("alerta-caixa")).toHaveCount(0);
  });
});
