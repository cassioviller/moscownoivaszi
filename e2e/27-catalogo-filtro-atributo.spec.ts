import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db, vestidosTable, atributosTable, atributoOpcoesTable } from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E41: o catálogo filtra por atributo. Cria um atributo com uma opção e dois
 * vestidos — um com o atributo, outro sem —; ao escolher a opção no filtro,
 * só o que tem o atributo permanece na lista.
 */
test.describe("Catálogo — filtro por atributo (E41)", () => {
  let atributoId: string;
  let opcaoId: string;
  let vestidoComId: string;
  let vestidoSemId: string;
  const stamp = Date.now();
  const comAtributo = `Vestido Com ${stamp}`;
  const semAtributo = `Vestido Sem ${stamp}`;
  const valorOpcao = `Tomara ${stamp}`;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const attr = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/atributos`, {
      data: { nome: `Decote ${stamp}`, tipo: "OPCAO_UNICA" },
    });
    expect(attr.status(), await attr.text()).toBe(201);
    atributoId = (await attr.json()).id;

    const op = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/atributos/${atributoId}/opcoes`, {
      data: { valor: valorOpcao },
    });
    expect(op.status(), await op.text()).toBe(201);
    opcaoId = (await op.json()).id;

    const v1 = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/vestidos`, {
      data: { codigo: `C${stamp}A`, nome: comAtributo, precoBase: 3000, atributos: [{ atributoId, opcaoId }] },
    });
    expect(v1.status(), await v1.text()).toBe(201);
    vestidoComId = (await v1.json()).id;
    const v2 = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/vestidos`, {
      data: { codigo: `C${stamp}B`, nome: semAtributo, precoBase: 3000 },
    });
    expect(v2.status(), await v2.text()).toBe(201);
    vestidoSemId = (await v2.json()).id;
  });

  test.afterAll(async () => {
    // O banco do e2e persiste: sem limpar, cada run soma um atributo ao filtro
    // e dois vestidos ao catálogo. Os vestidos saem primeiro — o vínculo em
    // A ORDEM continua correta e continua explícita; o motivo mudou. Até a S31
    // o vínculo referenciava atributo e opção SEM cascade, e a ordem era
    // obrigatória. Hoje o banco cascateia — a ordem fica por clareza, e só depois
    // a opção e o atributo.
    const vestidos = [vestidoComId, vestidoSemId].filter(Boolean);
    if (vestidos.length > 0) await db.delete(vestidosTable).where(inArray(vestidosTable.id, vestidos));
    if (opcaoId) await db.delete(atributoOpcoesTable).where(eq(atributoOpcoesTable.id, opcaoId));
    if (atributoId) await db.delete(atributosTable).where(eq(atributosTable.id, atributoId));
  });

  test("escolher a opção no filtro deixa só o vestido que tem o atributo", async ({ page }) => {
    await page.goto("/vestidos");

    // Sem filtro, os dois aparecem (busca reduz o ruído da lista acumulada).
    await page.getByPlaceholder("Buscar nome ou código…").fill(String(stamp));
    await expect(page.getByText(comAtributo)).toBeVisible();
    await expect(page.getByText(semAtributo)).toBeVisible();

    // Filtra pela opção do atributo — desde o E135 a parede de atributos tem
    // teto e mora atrás de "Mais filtros"; o caminho da vendedora abre antes.
    await page.getByTestId("botao-mais-filtros").click();
    await page.getByTestId(`filtro-atributo-${atributoId}`).click();
    await page.getByRole("option", { name: valorOpcao }).click();

    await expect(page.getByText(comAtributo)).toBeVisible();
    await expect(page.getByText(semAtributo)).toHaveCount(0);
  });
});
