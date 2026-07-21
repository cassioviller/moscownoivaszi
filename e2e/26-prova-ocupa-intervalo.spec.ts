import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E40: uma PROVA ocupa `provaDuracao` slots (o seed usa 2 = 1h). Mover um
 * atendimento para DENTRO desse intervalo é recusado por sobreposição — mesmo
 * num instante em que não há nenhum outro atendimento —, e para FORA passa.
 * Prova a mudança de "conflito de instante" para "conflito de intervalo".
 */
test.describe("Prova ocupa intervalo (E40)", () => {
  test("mover para dentro da prova é recusado; para depois dela passa", async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoraId = ((await equipe.json()) as { usuarioId: string }[])[0]!.usuarioId;

    // Base única por execução, dentro do expediente (10:00–13:00 + offset).
    const ymd = new Date().toISOString().slice(0, 10);
    const baseMs = Date.parse(`${ymd}T10:00:00-03:00`) + (Date.now() % (3 * 3600_000));
    const H = 3600_000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const criar = (tipo: "ATENDIMENTO" | "PROVA", inicio: string) =>
      request.post(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos`, {
        data: { leadId: estado.leadId, cabineId: "e2e-cabine-1", vendedoraId, tipo, inicio },
      });

    // Prova ocupa [base, base+1h). Atendimento avulso 3h depois (sem conflito).
    const prova = await criar("PROVA", iso(baseMs));
    expect(prova.status(), await prova.text()).toBe(201);
    const atend = await criar("ATENDIMENTO", iso(baseMs + 3 * H));
    expect(atend.status(), await atend.text()).toBe(201);
    const atendId = (await atend.json()).id as string;

    const mover = (ms: number) =>
      request.patch(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos/${atendId}`, {
        data: { cabineId: "e2e-cabine-1", inicio: iso(ms) },
      });

    // base+30min cai DENTRO da prova [base, base+1h) — recusado, embora não haja
    // nenhum atendimento naquele instante exato.
    const dentro = await mover(baseMs + H / 2);
    expect(dentro.status(), await dentro.text()).toBe(422);
    expect((await dentro.json()).error).toBe("CABINE_OCUPADA");

    // base+90min já é DEPOIS da prova — passa.
    const depois = await mover(baseMs + H + H / 2);
    expect(depois.status(), await depois.text()).toBe(200);
  });
});
