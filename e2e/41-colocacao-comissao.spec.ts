import { test, expect } from "@playwright/test";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db, contratosTable, leadsTable, comissaoRegrasTable, comissaoFaixasTable } from "../lib/db/src/index";
import { lerEstado, sessaoViaAPI, API_URL, QUALIFICACAO_DA_NOIVA } from "./helpers";

const estado = lerEstado();

/**
 * E55: a colocação no extrato pessoal. O ranking já existia atrás do gate de
 * gestão — a vendedora não podia ver onde está sem ganhar acesso a quanto todo
 * mundo ganha.
 *
 * O seed tem duas pessoas (admin e Maria); as duas vendem na competência
 * corrente para haver ranking. A Maria é quem prova o ponto do épico: ela não
 * tem o módulo de comissão e ainda assim vê a própria posição.
 */
test.describe("Colocação no extrato pessoal (E55)", () => {
  const stamp = Date.now();
  const competencia = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 7);
  const contratos: string[] = [];
  const leads: string[] = [];
  /**
   * S-O130 — a regra de comissão da Maria, criada aqui, sai no hook. Pelo par
   * (vendedora, vigência) e não pelo id: o 409 que o spec tolerava era a regra
   * do run ANTERIOR ainda de pé, e um hook por id nunca a alcançaria.
   */
  let mariaId: string | null = null;

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    await api.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await api.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const equipe = await api.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    expect(equipe.status()).toBe(200);
    const membros = (await equipe.json()) as { usuarioId: string; email: string }[];
    const admin = membros.find((m) => m.email === estado.adminEmail)!;
    const maria = membros.find((m) => m.email === estado.mariaEmail)!;

    // A Maria precisa de escada própria: o ranking é de COMISSÃO, e sem
    // escada a comissão é zero — ela apareceria em último tendo vendido mais.
    const regra = await api.post(`${API_URL}/api/lojas/${estado.lojaId}/comissao/regras`, {
      data: {
        vendedoraId: maria.usuarioId,
        vigenciaInicio: "2020-01-01T12:00:00-03:00",
        faixas: [{ minAcumulado: 0, percentual: 10 }],
      },
    });
    expect([200, 201, 409]).toContain(regra.status());
    mariaId = maria.usuarioId;

    // Valores distintos: a Maria vende mais, então fica na frente.
    for (const [vendedoraId, valorTotal] of [
      [admin.usuarioId, 3000],
      [maria.usuarioId, 9000],
    ] as const) {
      const lead = await api.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
        data: { noivaNome: `E2E Colocacao ${stamp}-${valorTotal}`, origem: "LOJA", ...QUALIFICACAO_DA_NOIVA },
      });
      const leadId = (await lead.json()).id as string;
      leads.push(leadId);
      const contrato = await api.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
        data: { leadId, vendedoraId, valorTotal },
      });
      expect(contrato.status(), await contrato.text()).toBe(201);
      contratos.push((await contrato.json()).id);
    }
    await api.dispose();
  });

  test.afterAll(async () => {
    // S-D45: cancelar tirava as vendas do ranking (E53) mas deixava as
    // linhas — 300 contratos e 300 leads acumulados de 21/07 a 07/08, +2 por
    // passada. A forma é a da S-D25 nas cabines: o spec apaga o que criou.
    // Contratos antes dos leads porque `contratos.lead_id` é RESTRICT; o
    // spec não cria parcela nem item, então não há mais nada pendurado.
    if (contratos.length > 0) {
      await db.delete(contratosTable).where(inArray(contratosTable.id, contratos));
    }
    if (leads.length > 0) {
      await db.delete(leadsTable).where(inArray(leadsTable.id, leads));
    }
    // S-O130: a REGRA criada no beforeAll ficava (o 409 da reexecução era o
    // sintoma — "já existe regra começando nesta data" desde o run anterior).
    if (mariaId) {
      const regras = await db.select({ id: comissaoRegrasTable.id }).from(comissaoRegrasTable).where(and(
        eq(comissaoRegrasTable.lojaId, estado.lojaId),
        eq(comissaoRegrasTable.vendedoraId, mariaId),
        eq(comissaoRegrasTable.vigenciaInicio, new Date("2020-01-01T12:00:00-03:00")),
      ));
      const ids = regras.map((r) => r.id);
      if (ids.length > 0) {
        await db.delete(comissaoFaixasTable).where(inArray(comissaoFaixasTable.regraId, ids));
        await db.delete(comissaoRegrasTable).where(inArray(comissaoRegrasTable.id, ids));
      }
    }
  });

  test("a vendedora SEM módulo de comissão vê a própria posição", async ({ page }) => {
    // Maria é vendedora comum: a tela de selecionar loja não a atende (C5),
    // então a sessão entra pela API — é o caminho que os outros specs usam.
    await sessaoViaAPI(page, estado.mariaEmail, estado.senha, estado.lojaId);

    await page.goto(`/minha-comissao?competencia=${competencia}`);
    const colocacao = page.getByTestId("colocacao");
    await expect(colocacao).toBeVisible();
    // A POSIÇÃO exata não se afirma aqui: a loja do e2e acumula vendas dos
    // outros specs na competência corrente, e fixar "1º" tornaria este spec
    // refém deles. O número certo é provado no teste de API, com fixture
    // isolada; o que importa aqui é que ela VÊ a colocação.
    await expect(colocacao).toContainText(/\d+º de \d+/);

    // E o extrato dela não carrega o nome nem o valor de ninguém: a página
    // inteira não pode mostrar a colega.
    const corpo = (await page.locator("body").textContent()) ?? "";
    expect(corpo).not.toContain("3.000,00");
  });
});
