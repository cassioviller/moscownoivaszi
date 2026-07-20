import { test, expect } from "@playwright/test";
import { lerEstado, sessaoViaAPI, API_URL, fecharTourDoAcesso } from "./helpers";

const estado = lerEstado();

/**
 * E12 — sweep da matriz de permissões.
 *
 * A régua vive espelhada à mão em três lugares: o seed (perfis padrão), os
 * requireModulo do backend e o `modulo` de cada item da sidebar. A MATRIZ
 * abaixo é a fonte única deste teste: se qualquer camada divergir dela —
 * módulo liberado a mais na API, item de menu aparecendo para quem não deve —
 * o sweep acusa a linha exata.
 */

// Perfil padrão "Vendedora" do seed. Admin não entra na tabela: o usuário
// admin do seed é SUPERADMIN (bypass) — vê tudo, e há teste disso abaixo.
const VENDEDORA = {
  leads: true,
  agenda: true,
  vestidos: true,
  financeiro: false,
  comissao: false,
  admin: false,
} as const;
type Modulo = keyof typeof VENDEDORA;
const MODULOS = Object.keys(VENDEDORA) as Modulo[];

// Um GET representativo por módulo (a ação "ver" de cada gate do backend).
const PROBES: Record<Modulo, (lojaId: string) => string> = {
  leads: (id) => `/api/lojas/${id}/leads`,
  agenda: (id) => `/api/lojas/${id}/atendimentos`,
  vestidos: (id) => `/api/lojas/${id}/vestidos`,
  financeiro: (id) => `/api/lojas/${id}/financeiro/parcelas`,
  comissao: (id) => `/api/lojas/${id}/comissao/regras`,
  admin: (id) => `/api/lojas/${id}/equipe`,
};

// O menu item a item — inclusive os descasamentos CONSCIENTES (Orçamentos,
// Contratos e Cobrança gateiam por `leads`; Reservas por `vestidos`) e os
// itens sem módulo, sempre visíveis (Configurações, Minha comissão).
const ITENS_MENU: Array<{ nome: string; modulo: Modulo | null }> = [
  { nome: "Visão Geral", modulo: null },
  { nome: "Noivas", modulo: "leads" },
  { nome: "Leads", modulo: "leads" },
  { nome: "Agenda", modulo: "agenda" },
  { nome: "Atendimentos", modulo: "agenda" },
  { nome: "Provas", modulo: "agenda" },
  { nome: "Ajustes", modulo: "agenda" },
  { nome: "Reservas", modulo: "vestidos" },
  { nome: "Vestidos", modulo: "vestidos" },
  { nome: "Catálogo", modulo: "vestidos" },
  { nome: "Orçamentos", modulo: "leads" },
  { nome: "Contratos", modulo: "leads" },
  { nome: "Financeiro", modulo: "financeiro" },
  { nome: "Comissões", modulo: "comissao" },
  { nome: "Minha comissão", modulo: null },
  { nome: "Equipe", modulo: "admin" },
  { nome: "Permissões", modulo: "admin" },
  { nome: "Configurações", modulo: null },
];

test.describe("Matriz de permissões — sweep por perfil", () => {
  test("API: vendedora recebe exatamente o que a matriz promete (200/403 módulo a módulo)", async ({ page }) => {
    const api = await sessaoViaAPI(page, estado.mariaEmail, estado.senha, estado.lojaId);
    for (const modulo of MODULOS) {
      const res = await api.get(PROBES[modulo](estado.lojaId));
      const esperado = VENDEDORA[modulo] ? 200 : 403;
      expect(
        res.status(),
        `módulo ${modulo}: GET ${PROBES[modulo]("{lojaId}")} como Vendedora deveria dar ${esperado}`,
      ).toBe(esperado);
    }
  });

  test("API: superadmin passa em todos os módulos (bypass)", async ({ page }) => {
    const api = await sessaoViaAPI(page, estado.adminEmail, estado.senha, estado.lojaId);
    for (const modulo of MODULOS) {
      const res = await api.get(PROBES[modulo](estado.lojaId));
      expect(res.status(), `módulo ${modulo} como superadmin deveria dar 200`).toBe(200);
    }
  });

  test("API: a ação conta além do ver — vendedora edita lead (leads.editar) mas não cria conta (financeiro.criar)", async ({ page }) => {
    const api = await sessaoViaAPI(page, estado.mariaEmail, estado.senha, estado.lojaId);

    // PATCH idempotente: regrava o nome que o global-setup já fixou.
    const editar = await api.patch(`/api/lojas/${estado.lojaId}/leads/${estado.leadId}`, {
      data: { noivaNome: "E2E Noiva Playwright" },
    });
    expect(editar.status(), "leads.editar=true deveria permitir o PATCH").toBe(200);

    const criarConta = await api.post(`/api/lojas/${estado.lojaId}/financeiro/contas-pagar`, {
      data: { tipo: "DESPESA", descricao: "não deveria existir", valorPrevisto: 1, vencimento: new Date().toISOString() },
    });
    expect(criarConta.status(), "financeiro.criar=false deveria negar com 403").toBe(403);
  });

  test("API: minha-comissao é pessoal — passa SEM o módulo comissao", async ({ page }) => {
    const api = await sessaoViaAPI(page, estado.mariaEmail, estado.senha, estado.lojaId);
    const res = await api.get(`/api/lojas/${estado.lojaId}/minha-comissao?competencia=2026-06`);
    expect(res.status(), "o extrato próprio não exige o módulo de gestão").toBe(200);

    const gestao = await api.get(`/api/lojas/${estado.lojaId}/comissao/preview?competencia=2026-06`);
    expect(gestao.status(), "a gestão continua fechada para a vendedora").toBe(403);
  });

  test("menu: sidebar da vendedora espelha a matriz item a item", async ({ page }) => {
    await sessaoViaAPI(page, estado.mariaEmail, estado.senha, estado.lojaId);
    await page.goto("/dashboard");
    // O tour abre sobre a sidebar na primeira entrada da vendedora e esconde
    // justamente o que este teste confere.
    await fecharTourDoAcesso(page);
    await expect(page.getByRole("heading", { name: "Visão Geral" })).toBeVisible();

    for (const item of ITENS_MENU) {
      const link = page.getByRole("link", { name: item.nome, exact: true });
      const deveVer = item.modulo === null || VENDEDORA[item.modulo];
      if (deveVer) {
        await expect(link, `Vendedora deveria ver "${item.nome}" no menu`).toBeVisible();
      } else {
        await expect(link, `Vendedora NÃO deveria ver "${item.nome}" no menu`).not.toBeVisible();
      }
    }
  });

  test("menu: superadmin vê todos os itens", async ({ page }) => {
    await sessaoViaAPI(page, estado.adminEmail, estado.senha, estado.lojaId);
    await page.goto("/dashboard");
    await fecharTourDoAcesso(page);
    await expect(page.getByRole("heading", { name: "Visão Geral" })).toBeVisible();

    for (const item of ITENS_MENU) {
      await expect(
        page.getByRole("link", { name: item.nome, exact: true }),
        `superadmin deveria ver "${item.nome}"`,
      ).toBeVisible();
    }
  });

  test("PROBE API: rotas de dados exigem sessão (anônimo → 401)", async ({ request }) => {
    const res = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/leads`);
    expect([401, 403]).toContain(res.status());
  });
});
