import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E37: concluir um atendimento de PROVA carimba `provaDataReal` no bloqueio,
 * fechando o loop agenda↔disponibilidade. Antes só a edição manual da reserva
 * setava esse campo. Teste de API puro — a lógica vive no PATCH do atendimento.
 */
test.describe("Prova conclui e carimba a data real (E37)", () => {
  test("concluir a prova seta provaDataReal no bloqueio", async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoras = (await equipe.json()) as { usuarioId: string }[];

    // Bloqueio fresco em data distante E única por execução: cada run espalha o
    // casamento por um offset diferente, senão as ocupações de runs anteriores
    // (DB persistente) colidiriam entre si (VESTIDO_INDISPONIVEL).
    const offsetDias = 300 + (Date.now() % 3000);
    const casamento = new Date(Date.now() + offsetDias * 24 * 3600_000).toISOString();
    const bloq = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/bloqueios`, {
      data: {
        vestidoId: "e2e-vestido-1",
        leadId: estado.leadId,
        tipo: "RESERVA_CASAMENTO",
        casamentoData: casamento,
      },
    });
    expect(bloq.status(), await bloq.text()).toBe(201);
    const bloqueioId = (await bloq.json()).id as string;

    // Prova ligada ao bloqueio, instante único de hoje (dentro do expediente).
    const base = new Date();
    base.setHours(9, 0, 0, 0);
    const inicio = new Date(base.getTime() + (Date.now() % (9 * 3600_000))).toISOString();
    const at = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos`, {
      data: {
        leadId: estado.leadId,
        cabineId: "e2e-cabine-1",
        vendedoraId: vendedoras[0]!.usuarioId,
        tipo: "PROVA",
        inicio,
        bloqueioId,
      },
    });
    expect(at.status(), await at.text()).toBe(201);
    const atId = (await at.json()).id as string;

    // Antes de concluir, o bloqueio não tem data real de prova.
    const antes = ((await (await request.get(`${API_URL}/api/lojas/${estado.lojaId}/bloqueios`)).json()) as {
      id: string;
      provaDataReal: string | null;
    }[]).find((b) => b.id === bloqueioId);
    expect(antes?.provaDataReal ?? null).toBeNull();

    // Iniciar (carimba atendidoEm) e concluir (dispara o E37).
    const iniciar = await request.patch(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos/${atId}`, {
      data: { situacao: "EM_ATENDIMENTO" },
    });
    expect(iniciar.status(), await iniciar.text()).toBe(200);
    const concluir = await request.patch(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos/${atId}`, {
      data: { situacao: "CONCLUIDO", desfecho: "RESERVOU" },
    });
    expect(concluir.status(), await concluir.text()).toBe(200);

    const depois = ((await (await request.get(`${API_URL}/api/lojas/${estado.lojaId}/bloqueios`)).json()) as {
      id: string;
      provaDataReal: string | null;
    }[]).find((b) => b.id === bloqueioId);
    expect(depois?.provaDataReal, "a prova concluída deveria carimbar provaDataReal").not.toBeNull();
  });
});
