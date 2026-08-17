import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, vestidosTable } from "../lib/db/src/index";
import { lerEstado } from "./helpers";

const estado = lerEstado();

/**
 * **E273 — o caderno de papel tem botão, e o botão CONFERE antes de escrever.**
 *
 * A pergunta que abriu o épico foi *"onde está o botão de importação?"*, e a
 * resposta era "não existe: é comando de console". Esta cena prova que existe,
 * e prova a metade que só a tela pode provar — que a pessoa lê o número ANTES
 * de aplicar.
 *
 * **A cena para no ensaio de propósito, e isso é decisão, não preguiça.**
 * Aplicar aqui despejaria 132 peças e 163 noivas na loja da suíte, e toda
 * contagem de acervo e de funil dos outros specs passaria a medir o caderno em
 * vez de medir a própria fixture — é a classe de estrago que o E260 pagou com o
 * banco poluído. Quem prova a ESCRITA é a suíte de API
 * (`e273-importar-legado-api.test.ts`), que cria a própria loja, aplica, confere
 * no banco e ainda mede que a segunda passada insere zero.
 *
 * O que fica provado aqui: o card existe no console do superadmin, o ensaio
 * responde com números de verdade, e **o banco não mudou** depois dele.
 */
test.describe("E273 — a importação do caderno pela tela", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

  test("o console da rede se alcança pela tela, sem digitar URL", async ({ page }) => {
    // E273 — `/admin` existia desde o E76 e nenhuma tela levava até ele. A
    // aba de Administração das Configurações é a casa do superadmin, e é de lá
    // que o caminho sai.
    await page.goto(`/loja/${estado.lojaId}/configuracoes`);
    await page.getByRole("tab", { name: /Administra/i }).click();
    await page.getByTestId("abrir-console-da-rede").click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("importar-caderno")).toBeVisible();
  });

  test("o ensaio mostra o que entraria e não escreve nada", async ({ page }) => {
    const antes = (
      await db.select({ id: vestidosTable.id }).from(vestidosTable).where(eq(vestidosTable.lojaId, estado.lojaId))
    ).length;

    await page.goto("/admin");

    const card = page.getByTestId("importar-caderno");
    await expect(card).toBeVisible();

    // A loja da suíte é a que recebe — o seletor abre com a primeira, e a cena
    // escolhe a da fixture pelo id para não depender da ordem alfabética.
    await card.getByRole("combobox").nth(1).selectOption(estado.lojaId);

    await card.getByRole("button", { name: "Conferir" }).click();

    const ensaio = page.getByTestId("ensaio-do-caderno");
    await expect(ensaio).toBeVisible();
    await expect(ensaio).toContainText("peças entram");
    await expect(ensaio).toContainText("noivas entram");
    await expect(ensaio).toContainText("Nada foi escrito ainda.");

    // O botão de aplicar só acende depois do ensaio, e diz o que vai fazer.
    await expect(card.getByRole("button", { name: /^Importar / })).toBeEnabled();

    // E a régua que importa: o banco não se mexeu.
    const depois = (
      await db.select({ id: vestidosTable.id }).from(vestidosTable).where(eq(vestidosTable.lojaId, estado.lojaId))
    ).length;
    expect(depois, "o ensaio escreveu no banco").toBe(antes);
  });
});
