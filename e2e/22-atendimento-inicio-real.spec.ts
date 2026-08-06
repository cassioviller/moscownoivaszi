import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL, apagarCabineCriada } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E36: iniciar um atendimento carimba `atendidoEm` (antes coluna morta) e a fila
 * passa a mostrar a que horas começou de verdade e a espera vs. o horário.
 */
test.describe("Atendimento — início real (E36)", () => {
  let atendimentoId: string;
  let cabineId: string;

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

    // E115: o POST de atendimento passou a rodar as recusas de expediente e de
    // sobreposição do agenda-core, e este spec pagou dois preços de uma vez. O
    // "09:00" era `setHours` no relógio do PROCESSO — UTC no container, ou
    // seja 06:00 em São Paulo, FORA_DO_HORARIO (a mesma classe de defeito que
    // o E115 tirou do app). E a `e2e-cabine-1`, compartilhada num banco que
    // persiste, colide por INTERVALO com as sobras das execuções passadas.
    // Hora escrita no fuso da LOJA e cabine própria por execução (lição da S7).
    const stamp = Date.now();
    const cab = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/cabines`, {
      data: { nome: `e22-${stamp}` },
    });
    expect(cab.status(), await cab.text()).toBe(201);
    cabineId = ((await cab.json()) as { id: string }).id;
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const hh = String(9 + (stamp % 8)).padStart(2, "0");
    const mm = String(Math.floor(stamp / 1000) % 60).padStart(2, "0");
    const ss = String(stamp % 60).padStart(2, "0");
    const inicio = `${ymd}T${hh}:${mm}:${ss}-03:00`;

    const criado = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos`, {
      data: {
        leadId: estado.leadId,
        cabineId,
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
    if (atendimentoId) {
      await request.delete(
        `${API_URL}/api/lojas/${estado.lojaId}/atendimentos/${atendimentoId}`,
      );
    }
    // S-D25: a cabine por execução também sai — eram 68 `e22-` acumuladas.
    await apagarCabineCriada(cabineId);
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
