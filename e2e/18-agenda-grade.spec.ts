import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL, arrastar } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * Grade da agenda (E28) — arrastar o atendimento entre horários e cabines.
 *
 * O dia é fixo e futuro, ancorado na URL (`?dia=`): a grade de "hoje" mudaria
 * de conteúdo a cada execução, e o seed global não garante atendimento nenhum
 * no dia em que a suíte roda.
 */

const DIA = "2027-05-18";
const emSP = (hora: string) => `${DIA}T${hora}:00-03:00`;

test.describe("Agenda — grade do dia", () => {
  let atendimentoId: string;
  let cabineDoisId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    // Segunda cabine, com nome fixo e reusável. Além disso, desativo as cabines
    // "Cabine E2E {timestamp}" que execuções anteriores deste spec deixaram: sem
    // isso a grade cresce a cada run, transborda a viewport, e o arraste
    // cross-cabine tem de rolar na horizontal — o que tira o card-origem da tela.
    const cabines = (await (await request.get(`${API_URL}/api/lojas/${estado.lojaId}/cabines`)).json()) as {
      id: string;
      nome: string;
      ativo: boolean;
    }[];
    for (const c of cabines) {
      if (c.ativo && /^Cabine E2E \d+$/.test(c.nome)) {
        await request.patch(`${API_URL}/api/lojas/${estado.lojaId}/cabines/${c.id}`, {
          data: { ativo: false },
        });
      }
    }
    const grade = cabines.find((c) => c.nome === "Cabine E2E Grade" && c.ativo);
    if (grade) {
      cabineDoisId = grade.id;
    } else {
      const cabine = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/cabines`, {
        data: { nome: "Cabine E2E Grade" },
      });
      expect(cabine.status(), await cabine.text()).toBe(201);
      cabineDoisId = (await cabine.json()).id;
    }

    // Re-executável: o dia é fixo, então limpo o que uma corrida anterior
    // deixou nele, senão o POST abaixo bate na unique (cabine, inicio).
    const existentes = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos`);
    for (const a of (await existentes.json()) as { id: string; inicio: string }[]) {
      if (a.inicio.startsWith(DIA)) {
        await request.delete(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos/${a.id}`);
      }
    }

    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoras = (await equipe.json()) as { usuarioId: string }[];

    const criado = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos`, {
      data: {
        leadId: estado.leadId,
        cabineId: estado.cabineId,
        vendedoraId: vendedoras[0]!.usuarioId,
        tipo: "ATENDIMENTO",
        inicio: new Date(emSP("10:00")).toISOString(),
      },
    });
    expect(criado.status(), await criado.text()).toBe(201);
    atendimentoId = (await criado.json()).id;
  });

  test("a grade desenha as cabines e os horários do expediente", async ({ page }) => {
    await page.goto(`/agenda?dia=${DIA}`);

    await expect(page.getByTestId("grade-agenda")).toBeVisible();
    // Expediente padrão 9h–19h, malha de 30 min.
    await expect(page.getByTestId(`celula-agenda-${estado.cabineId}-09:00`)).toBeVisible();
    await expect(page.getByTestId(`celula-agenda-${estado.cabineId}-18:30`)).toBeVisible();
    // O atendimento das 10h está na célula das 10h.
    await expect(
      page.getByTestId(`celula-agenda-${estado.cabineId}-10:00`).getByTestId(`card-agenda-${atendimentoId}`),
    ).toBeVisible();
  });

  test("arrastar para outro horário reagenda e persiste", async ({ page, request }) => {
    await page.goto(`/agenda?dia=${DIA}`);

    const card = page.getByTestId(`card-agenda-${atendimentoId}`);
    await expect(card).toBeVisible();

    await arrastar(
      page,
      card.getByRole("button", { name: /Arrastar/ }),
      page.getByTestId(`celula-agenda-${estado.cabineId}-11:30`),
    );

    await expect(
      page.getByTestId(`celula-agenda-${estado.cabineId}-11:30`).getByTestId(`card-agenda-${atendimentoId}`),
    ).toBeVisible();

    // O horário é do servidor, não da tela.
    const conferido = await request.get(
      `${API_URL}/api/lojas/${estado.lojaId}/atendimentos`,
    );
    const lista = (await conferido.json()) as { id: string; inicio: string }[];
    const achado = lista.find((a) => a.id === atendimentoId)!;
    expect(new Date(achado.inicio).toISOString()).toBe(new Date(emSP("11:30")).toISOString());
  });

  test("arrastar para outra cabine muda a coluna", async ({ page, request }) => {
    await page.goto(`/agenda?dia=${DIA}`);

    const card = page.getByTestId(`card-agenda-${atendimentoId}`);
    await expect(card).toBeVisible();

    // Mesma linha (11:30, onde o teste anterior deixou o card), outra coluna:
    // isola o eixo cabine do eixo horário.
    await arrastar(
      page,
      card.getByRole("button", { name: /Arrastar/ }),
      page.getByTestId(`celula-agenda-${cabineDoisId}-11:30`),
    );

    await expect(
      page.getByTestId(`celula-agenda-${cabineDoisId}-11:30`).getByTestId(`card-agenda-${atendimentoId}`),
    ).toBeVisible();

    const conferido = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos`);
    const lista = (await conferido.json()) as { id: string; cabineId: string }[];
    expect(lista.find((a) => a.id === atendimentoId)!.cabineId).toBe(cabineDoisId);
  });
});
