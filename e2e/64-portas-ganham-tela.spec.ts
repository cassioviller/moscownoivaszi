import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, lojasTable, usuariosTable, atributosTable, atributoOpcoesTable, comissaoRegrasTable, comissaoFaixasTable } from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

/**
 * S-O131 — **as seis portas do cliente que existiam sem tela ganharam gesto**
 * (decisão da dona, 16/08/2026: "ganha tela"). Cada cena clica o gesto novo e
 * prova a escrita no banco; a recusa da porta (409, com histórico/em uso)
 * continua sendo a régua, e a tela só a traduz.
 *
 * - `deleteLoja` e `deleteUsuario`: o console do superadmin (`/admin`) ganha
 *   "Apagar" ao lado de "Editar", com confirmação; só sai o que está VAZIO.
 * - `listAuditoriaGlobal`: o console ganha a seção "Auditoria global" — as
 *   linhas de `lojaId` nulo (apagar loja, apagar pessoa), gravadas desde a S3
 *   e nunca lidas por tela nenhuma.
 * - `deleteAtributo` e `deleteAtributoOpcao`: a edição do atributo ganha o X
 *   por opção e "Apagar atributo"; o que classifica peça ou noiva, a porta
 *   recusa (`ATRIBUTO_EM_USO`/`OPCAO_EM_USO`) e a frase dela ensina a desativar.
 * - `updateComissaoRegra`: a escada de comissão ganha "Desativar"/"Reativar".
 */
test.describe.serial("S-O131 — as portas que ganharam tela", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });
  const stamp = Date.now();
  let lojaVaziaId: string | null = null;
  let usuarioNovoId: string | null = null;
  let atributoId: string | null = null;
  let opcaoId: string | null = null;
  let regraId: string | null = null;
  let mariaId: string | null = null;
  /**
   * S-R14 — o ID do próprio admin logado. A cena de "não apagar a si mesmo"
   * pedia `apagar-usuario-${estado.adminEmail}`, e a tela monta o testid com
   * `u.id` (`admin/index.tsx:596`): o seletor NUNCA existiu, e o `toHaveCount(0)`
   * era verdadeiro com a guarda (`:590`) no lugar e sem ela.
   */
  let adminId: string | null = null;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, { data: { email: estado.adminEmail, senha: estado.senha } });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    // S-R14: o próprio admin, pelo ID — é com ele que a tela monta o testid.
    const [admin] = await db
      .select({ id: usuariosTable.id })
      .from(usuariosTable)
      .where(eq(usuariosTable.email, estado.adminEmail));
    expect(admin?.id, `o admin ${estado.adminEmail} tem de existir no banco`).toBeTruthy();
    adminId = admin!.id;

    const loja = await request.post(`${API_URL}/api/admin/lojas`, { data: { nome: `E2E Loja vazia ${stamp}` } });
    expect(loja.status(), await loja.text()).toBe(201);
    lojaVaziaId = ((await loja.json()) as { id: string }).id;

    const usuario = await request.post(`${API_URL}/api/admin/usuarios`, {
      data: { nome: `E2E Pessoa sem histórico ${stamp}`, email: `e2e-sem-historico-${stamp}@moscownoivas.com`, senha: "senha-e2e-123" },
    });
    expect(usuario.status(), await usuario.text()).toBe(201);
    usuarioNovoId = ((await usuario.json()) as { id: string }).id;

    const attr = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/atributos`, {
      data: { nome: `E2E Barra ${stamp}`, tipo: "OPCAO_UNICA" },
    });
    expect(attr.status(), await attr.text()).toBe(201);
    atributoId = ((await attr.json()) as { id: string }).id;
    const op = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/atributos/${atributoId}/opcoes`, {
      data: { valor: `Reta ${stamp}` },
    });
    expect(op.status(), await op.text()).toBe(201);
    opcaoId = ((await op.json()) as { id: string }).id;

    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const membros = (await equipe.json()) as { usuarioId: string; email: string }[];
    mariaId = membros.find((m) => m.email === estado.mariaEmail)!.usuarioId;
    // Vigência num dia que nenhum outro spec usa (o 41 usa 2020-01-01; a UNIQUE é por instante e a escada vale por mês inteiro).
    const regra = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/comissao/regras`, {
      data: { vendedoraId: mariaId, vigenciaInicio: "2019-06-01T12:00:00-03:00", faixas: [{ minAcumulado: 0, percentual: 5 }] },
    });
    expect(regra.status(), await regra.text()).toBe(201);
    regraId = ((await regra.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    // O que a tela não apagou (a cena falhou no meio) sai aqui, na ordem das FKs.
    if (regraId) {
      await db.delete(comissaoFaixasTable).where(eq(comissaoFaixasTable.regraId, regraId));
      await db.delete(comissaoRegrasTable).where(eq(comissaoRegrasTable.id, regraId));
    }
    if (opcaoId) await db.delete(atributoOpcoesTable).where(eq(atributoOpcoesTable.id, opcaoId));
    if (atributoId) await db.delete(atributosTable).where(eq(atributosTable.id, atributoId));
    if (usuarioNovoId) await db.delete(usuariosTable).where(eq(usuariosTable.id, usuarioNovoId));
    if (lojaVaziaId) await db.delete(lojasTable).where(eq(lojasTable.id, lojaVaziaId));
  });

  test("o superadmin apaga a loja VAZIA e a pessoa SEM histórico pelo console — e a loja da suíte, com histórico, é recusada com a frase certa", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Lojas" })).toBeVisible();

    // A loja da suíte tem histórico: a porta recusa (409 LOJA_COM_HISTORICO) e a tela diz para desativar.
    await page.getByTestId(`apagar-loja-${estado.lojaId}`).click();
    await page.getByTestId("confirmar-apagar-loja").click();
    // C8 (higiene da conferência): a frase é a do SERVIDOR, com a contagem — a tela
    // não a sobrescreve mais pelo dicionário.
    await expect(page.getByText(/Esta loja tem .* — excluir apagaria tudo isso/).first()).toBeVisible();
    const [aindaLa] = await db.select({ id: lojasTable.id }).from(lojasTable).where(eq(lojasTable.id, estado.lojaId));
    expect(aindaLa?.id).toBe(estado.lojaId);

    // A loja vazia sai.
    await page.getByTestId(`apagar-loja-${lojaVaziaId}`).click();
    await page.getByTestId("confirmar-apagar-loja").click();
    await expect(page.getByText("Loja apagada").first()).toBeVisible();
    await expect.poll(async () => (await db.select({ id: lojasTable.id }).from(lojasTable).where(eq(lojasTable.id, lojaVaziaId!))).length).toBe(0);
    lojaVaziaId = null;

    // A pessoa sem histórico sai; a própria pessoa (o admin logado) não tem o botão.
    //
    // S-R14 (regra 34) — o assert de antes pedia `apagar-usuario-${estado.adminEmail}`
    // e a tela monta `apagar-usuario-${u.id}`: um e-mail nunca é um UUID, o
    // seletor não casava com nada, e a ÚNICA cena de "não apagar a si mesmo"
    // ficava verde com a guarda de `admin/index.tsx:590` removida. A linha do
    // admin precisa estar DESENHADA para o count 0 significar alguma coisa —
    // por isso o "Editar" dele, que a tela mostra para todo mundo, é afirmado
    // antes: sem ele, ausência de botão e ausência de linha seriam o mesmo verde.
    await expect(page.getByTestId(`editar-usuario-${adminId}`)).toBeVisible();
    await expect(page.getByTestId(`apagar-usuario-${adminId}`)).toHaveCount(0);
    await page.getByTestId(`apagar-usuario-${usuarioNovoId}`).click();
    await page.getByTestId("confirmar-apagar-usuario").click();
    await expect(page.getByText("Pessoa apagada").first()).toBeVisible();
    await expect.poll(async () => (await db.select({ id: usuariosTable.id }).from(usuariosTable).where(eq(usuariosTable.id, usuarioNovoId!))).length).toBe(0);
    usuarioNovoId = null;

    // E os dois atos aparecem na Auditoria global — a trilha de lojaId nulo, que nenhuma tela lia.
    await page.reload();
    const auditoria = page.getByTestId("auditoria-global");
    await expect(auditoria).toBeVisible();
    await expect(auditoria.locator("li")).not.toHaveCount(0);
  });

  test("a edição do atributo apaga a opção sem uso e depois o atributo, e o banco confirma", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/catalogo/${atributoId}/editar`);
    await expect(page.getByTestId("apagar-atributo")).toBeVisible();

    await page.getByTestId(`apagar-opcao-${opcaoId}`).click();
    await page.getByTestId("confirmar-apagar-opcao").click();
    await expect(page.getByText("Opção apagada").first()).toBeVisible();
    await expect.poll(async () => (await db.select({ id: atributoOpcoesTable.id }).from(atributoOpcoesTable).where(eq(atributoOpcoesTable.id, opcaoId!))).length).toBe(0);
    opcaoId = null;

    await page.getByTestId("apagar-atributo").click();
    await page.getByTestId("confirmar-apagar-atributo").click();
    await expect(page).toHaveURL(new RegExp(`/loja/${estado.lojaId}/catalogo$`));
    await expect.poll(async () => (await db.select({ id: atributosTable.id }).from(atributosTable).where(eq(atributosTable.id, atributoId!))).length).toBe(0);
    atributoId = null;
  });

  test("a escada de comissão desativa e reativa pela tela, e a coluna `ativo` acompanha", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/comissoes`);
    const botao = page.getByTestId(`alternar-regra-${regraId}`);
    await expect(botao).toHaveText("Desativar");
    await botao.click();
    await expect(page.getByText("Regra desativada").first()).toBeVisible();
    await expect.poll(async () => (await db.select({ ativo: comissaoRegrasTable.ativo }).from(comissaoRegrasTable).where(eq(comissaoRegrasTable.id, regraId!)))[0]?.ativo).toBe(false);
    await expect(botao).toHaveText("Reativar");
    await botao.click();
    await expect(page.getByText("Regra reativada").first()).toBeVisible();
    await expect.poll(async () => (await db.select({ ativo: comissaoRegrasTable.ativo }).from(comissaoRegrasTable).where(eq(comissaoRegrasTable.id, regraId!)))[0]?.ativo).toBe(true);
  });
});
