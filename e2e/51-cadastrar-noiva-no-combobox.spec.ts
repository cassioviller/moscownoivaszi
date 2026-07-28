import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E98 — F4 (cadastrar do combobox) e F2 (a origem deixa de ser um chute).
 *
 * A noiva liga querendo marcar. A vendedora abre "Agendar", digita o nome, e ele
 * não está lá: até aqui o caminho era abandonar o agendamento, ir a /noivas,
 * cadastrar, voltar e recomeçar — com a noiva na linha. O picker passa a
 * cadastrar no lugar, e a origem é escolhida no MESMO clique, para o cadastro
 * rápido não virar a nova fonte de "veio da loja" para todo mundo.
 */
test.describe("Cadastrar noiva sem sair do agendamento", () => {
  test("o combobox cadastra a noiva digitada, com a origem escolhida", async ({ page, request }) => {
    // Nome próprio da execução: o spec roda num banco que persiste, e um nome
    // fixo encontraria a noiva da corrida anterior — aí o combobox acharia
    // resultado e a oferta de cadastro (que só aparece no vazio) sumiria.
    const nome = `Noiva Combobox ${Date.now().toString(36)}`;

    await page.goto("/atendimentos/novo");
    await page.getByTestId("combobox-noiva").click();
    await page.getByPlaceholder("Buscar por nome ou WhatsApp…").fill(nome);

    const oferta = page.getByTestId("cadastrar-inline");
    await expect(oferta).toBeVisible();
    await expect(oferta).toContainText(`«${nome}»`);

    await page.getByTestId("cadastrar-origem-INSTAGRAM").click();

    // Ela fica SELECIONADA no formulário — o ponto do item: quem cadastrou não
    // volta ao início do fluxo de agendar.
    await expect(page.getByTestId("combobox-noiva")).toContainText(nome);

    // E nasceu com a origem que foi clicada, não com o default da coluna.
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
    const busca = await request.get(
      `${API_URL}/api/lojas/${estado.lojaId}/leads?q=${encodeURIComponent(nome)}`,
    );
    const { itens } = (await busca.json()) as { itens: { noivaNome: string; origem: string }[] };
    const criada = itens.find((l) => l.noivaNome === nome);
    expect(criada, "a noiva cadastrada pelo combobox").toBeTruthy();
    expect(criada!.origem).toBe("INSTAGRAM");
  });

  test("o cadastro de noiva não responde a origem por quem a preenche", async ({ page }) => {
    // F2: o select nasce VAZIO. Antes ele mostrava "Loja" já escolhida, e
    // submeter sem olhar criava uma noiva de canal LOJA para sempre.
    await page.goto("/noivas/nova");
    await expect(page.getByTestId("select-noiva-origem")).toContainText("De onde ela veio?");

    await page.getByTestId("input-noiva-nome").fill(`Noiva Sem Origem ${Date.now().toString(36)}`);
    await page.getByTestId("button-salvar-noiva").click();

    // Sem origem escolhida o formulário não passa — e diz o que falta.
    await expect(page.getByText("Escolha de onde ela veio")).toBeVisible();
    await expect(page).toHaveURL(/\/noivas\/nova$/);
  });
});
