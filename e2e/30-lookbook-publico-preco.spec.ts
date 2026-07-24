import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E44: o lookbook público mostra preço e características — antes o payload os
 * escondia, apesar de estarem no banco. Monta um lookbook com um vestido que tem
 * atributo e preço conhecido e confere a página pública (sem login).
 */
test.describe("Lookbook público — preço e características (E44)", () => {
  let token: string;
  const stamp = Date.now();
  const nomeVestido = `Vestido Look ${stamp}`;
  const rotuloAtributo = `Decote ${stamp}`;
  const valorOpcao = `Tomara ${stamp}`;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const attr = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/atributos`, {
      data: { nome: rotuloAtributo, tipo: "OPCAO_UNICA" },
    });
    const atributoId = (await attr.json()).id;
    const op = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/atributos/${atributoId}/opcoes`, {
      data: { valor: valorOpcao },
    });
    const opcaoId = (await op.json()).id;

    const ves = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/vestidos`, {
      data: { codigo: `LOOK${stamp}`, nome: nomeVestido, precoBase: 4200, atributos: [{ atributoId, opcaoId }] },
    });
    expect(ves.status(), await ves.text()).toBe(201);
    const vestidoId = (await ves.json()).id;

    const look = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/lookbooks`, {
      data: { leadId: estado.leadId, vestidoIds: [vestidoId] },
    });
    expect(look.status(), await look.text()).toBe(201);
    token = (await look.json()).token;
  });

  test("a página pública mostra preço e características", async ({ page }) => {
    await page.goto(`/lookbook/${token}`);

    await expect(page.getByText(nomeVestido)).toBeVisible();
    await expect(page.getByText("R$ 4.200,00")).toBeVisible();
    await expect(page.getByText(`${rotuloAtributo}: ${valorOpcao}`)).toBeVisible();
  });
});
