import { test, expect } from "@playwright/test";
import path from "node:path";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, contasPagarTable } from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E48: o aluguel deixa de ser relançado à mão. A despesa recorrente é criada na
 * tela, gerada na competência pelo MESMO botão do salário, e aparece em contas
 * a pagar — que é onde ela vira dinheiro saindo.
 *
 * A competência é distante e única por execução: a geração é idempotente, e
 * duas rodadas da suíte não podem disputar o mesmo mês.
 */
test.describe("Despesa recorrente (E48)", () => {
  const stamp = Date.now();
  const descricao = `E2E Aluguel ${stamp}`;
  // Um mês bem à frente, derivado do stamp — sem colisão entre execuções.
  const competencia = `20${40 + (stamp % 50)}-0${1 + (stamp % 9)}`;

  let recorrenciaId: string;

  test.afterAll(async ({ request }) => {
    // E246 (D8): "Gerar competência" gera TODAS as recorrências ativas da loja
    // para a competência do run (20XX-0Y) — eram **779** contas entre 2040-04 e
    // 2089-09 no `heliumdb`, uma por recorrência viva por passada. A receita é
    // a do `15`: apagar as contas geradas para a competência, todas com
    // `recorrencia_id`.
    await db.delete(contasPagarTable).where(and(
      eq(contasPagarTable.lojaId, estado.lojaId),
      eq(contasPagarTable.competencia, competencia),
      isNotNull(contasPagarTable.recorrenciaId),
    ));
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
    // Desativa para não pesar nas gerações das próximas execuções.
    if (recorrenciaId) {
      await request.patch(
        `${API_URL}/api/lojas/${estado.lojaId}/financeiro/recorrencias/${recorrenciaId}`,
        { data: { ativo: false } },
      );
    }
  });

  test("criar na tela, gerar a competência e achar a conta a pagar", async ({ page, request }) => {
    await page.goto("/financeiro/folha");
    await expect(page.getByRole("heading", { name: "Folha do mês" })).toBeVisible();

    await page.locator("#despesa-descricao").fill(descricao);
    await page.locator("#despesa-fornecedor").fill("Imobiliária E2E");
    await page.locator("#despesa-valor").fill("4.500,00");
    await page.locator("#despesa-dia").fill("10");
    await page.getByRole("button", { name: "Adicionar despesa" }).click();

    // A recorrência entra na lista — ainda não é conta a pagar. A linha é
    // achada pela descrição (única por execução): o fornecedor se repete entre
    // execuções e sozinho não identifica nada.
    const linha = page
      .getByTestId("lista-despesas-recorrentes")
      .locator("li")
      .filter({ hasText: descricao });
    await expect(linha).toHaveCount(1);
    await expect(linha).toContainText("Imobiliária E2E");

    // Gera a competência: o mesmo botão que lança o salário lança o aluguel.
    await page.locator("#competencia").fill(competencia);
    await page.getByRole("button", { name: "Gerar competência" }).click();
    await expect(page.getByText(`${descricao} ${competencia}`)).toBeVisible();

    // E a conta existe de fato, com o rastro da recorrência que a originou.
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
    const contas = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/financeiro/contas-pagar`);
    expect(contas.status()).toBe(200);
    const gerada = (await contas.json()).find(
      (c: { descricao: string }) => c.descricao === `${descricao} ${competencia}`,
    );
    expect(gerada).toBeTruthy();
    expect(gerada.tipo).toBe("FORNECEDOR");
    expect(gerada.valorPrevisto).toBe(4500);
    expect(gerada.recorrenciaId).toBeTruthy();
    recorrenciaId = gerada.recorrenciaId;

    // Gerar de novo não duplica — a mensagem diz isso em vez de fingir sucesso.
    await page.getByRole("button", { name: "Gerar competência" }).click();
    // `.first()`: o Radix espelha o título do toast numa região aria-live de
    // anúncio — o getByText cru resolve DOIS elementos e o strict mode
    // derruba o assert com o toast na tela (medido no fecho da rodada 2).
    await expect(page.getByText("Competência já estava gerada").first()).toBeVisible();
  });
});
