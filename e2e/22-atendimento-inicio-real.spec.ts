import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E36: iniciar um atendimento carimba `atendidoEm` (antes coluna morta) e a fila
 * passa a mostrar a que horas começou de verdade e a espera vs. o horário.
 */
test.describe("Atendimento — início real (E36)", () => {
  let atendimentoId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    // A vendedora é a PESSOA LOGADA, e isso importa desde o F13: a barra do
    // atendimento em curso só aparece para quem está conduzindo. Um atendimento
    // de `equipe[0]` — que pode ser outra pessoa — corretamente não produz barra
    // nenhuma para quem olha, e foi assim que este spec falhou da primeira vez.
    const me = await request.get(`${API_URL}/api/auth/me`);
    const usuarioLogadoId = (await me.json()).usuario.id as string;

    // Instante único dentro do expediente (09:00–18:00 de hoje) para não bater
    // na trava anti-corrida (cabine/vendedora × instante) entre execuções.
    const base = new Date();
    base.setHours(9, 0, 0, 0);
    const inicio = new Date(base.getTime() + (Date.now() % (9 * 3600_000))).toISOString();

    const criado = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos`, {
      data: {
        leadId: estado.leadId,
        cabineId: "e2e-cabine-1",
        vendedoraId: usuarioLogadoId,
        tipo: "ATENDIMENTO",
        inicio,
      },
    });
    expect(criado.status(), await criado.text()).toBe(201);
    atendimentoId = (await criado.json()).id as string;
  });

  /**
   * O spec DEIXA um atendimento EM_ATENDIMENTO, e o banco de dev persiste — a
   * barra do F13 passaria a aparecer em todas as telas de todos os specs
   * seguintes do mesmo dia. Não é hipótese: foi o que aconteceu, e derrubou o
   * `21-orcamento-item-catalogo` com "element is outside of the viewport".
   *
   * Mesma classe da sobra S7 ("recurso próprio por execução"), com um detalhe
   * que vale registrar: **o vazamento é o próprio achado do F13** — um
   * atendimento iniciado e nunca concluído fica EM_ATENDIMENTO para sempre. O
   * teste da barra reproduziu o problema que a barra existe para resolver.
   */
  test.afterAll(async ({ request }) => {
    if (!atendimentoId) return;
    await request.delete(
      `${API_URL}/api/lojas/${estado.lojaId}/atendimentos/${atendimentoId}`,
    );
  });

  test("iniciar carimba atendidoEm e a fila mostra o início real", async ({ page }) => {
    await page.goto("/atendimentos");
    const linha = page.getByTestId(`linha-atendimento-${atendimentoId}`);
    await expect(linha).toBeVisible();

    // Antes de iniciar, não há início real.
    await expect(page.getByTestId(`inicio-real-${atendimentoId}`)).toHaveCount(0);

    await linha.getByRole("button", { name: "Iniciar atendimento" }).click();

    const inicioReal = page.getByTestId(`inicio-real-${atendimentoId}`);
    await expect(inicioReal).toBeVisible();
    await expect(inicioReal).toContainText("começou");
  });

  /**
   * F13/E98 — o DURANTE do atendimento, que era o buraco entre o E36 (o início)
   * e o E61 (o depois).
   *
   * A vendedora clica "Iniciar atendimento", sai da fila para preencher
   * interesses com a noiva do lado, e a partir dali **nenhuma tela do app sabia
   * que havia um atendimento acontecendo**. O teste faz o caminho que ela faz:
   * sai da fila para uma tela distante e confirma que a barra a acompanhou.
   *
   * Depende do teste anterior ter iniciado o atendimento — de propósito: é o
   * mesmo atendimento e a mesma sessão, que é o cenário real.
   */
  test("iniciado, a barra acompanha a vendedora para fora da fila", async ({ page }) => {
    // A tela mais distante da fila, e a que mais rola: o acervo.
    await page.goto("/vestidos");

    const barra = page.getByTestId("barra-atendimento");
    await expect(barra).toBeVisible();
    await expect(barra).toContainText("Atendendo");
    await expect(barra).toContainText("desde");

    // Os caminhos que ela vai querer, a partir de onde ela está.
    await barra.getByRole("link", { name: "Interesses" }).click();
    await expect(page).toHaveURL(/\/noivas\/.+\/interesses/);
    // E a barra continua lá, porque o atendimento continua acontecendo.
    await expect(page.getByTestId("barra-atendimento")).toBeVisible();

    // "Concluir" leva à fila, onde se escolhe o desfecho — não conclui daqui.
    await page.getByTestId("barra-atendimento-concluir").click();
    await expect(page).toHaveURL(/\/atendimentos$/);
  });
});
