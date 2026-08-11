import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, atendimentosTable, cabinesTable, usuariosTable } from "../lib/db/src/index";
import {
  lerEstado,
  API_URL,
  diaLocalSP,
  criarReservaParaProva,
  apagarReservaDeProva,
  type ReservaDeProva,
} from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E40: uma PROVA ocupa `provaDuracao` slots (o seed usa 2 = 1h). Mover um
 * atendimento para DENTRO desse intervalo é recusado por sobreposição — mesmo
 * num instante em que não há nenhum outro atendimento —, e para FORA passa.
 * Prova a mudança de "conflito de instante" para "conflito de intervalo".
 *
 * Cabine E vendedora PRÓPRIAS por execução: o banco e2e é persistente, e o
 * conflito do E40 cruza cabines pela vendedora — isolar só a cabine (E80)
 * não bastou: provas de execuções anteriores do mesmo dia ocupavam a
 * vendedora compartilhada do seed e o "para depois passa" levava 422
 * VENDEDORA_OCUPADA (sobra da rodada 5). A vendedora nasce via POST /equipe
 * (mesmo desenho do E56 no spec 42) e morre no afterAll.
 */
test.describe("Prova ocupa intervalo (E40)", () => {
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const cabineId = `e2e-cabine-e40-${randomUUID().slice(0, 8)}`;
  let vendedoraId: string;
  // E161/G7: prova exige a reserva do vestido — descartável, própria do spec.
  let reserva: ReservaDeProva | undefined;

  test.beforeAll(async ({ request }) => {
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: estado.lojaId, nome: cabineId });

    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
    const perfis = await request.get(`${API_URL}/api/admin/perfis`);
    expect(perfis.status(), await perfis.text()).toBe(200);
    const membro = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/equipe`, {
      data: {
        nome: `E2E Vendedora E40 ${stamp}`,
        email: `e2e-vendedora-e40-${stamp}@teste.local`,
        senha: "senha-e2e-123456",
        perfilId: (await perfis.json())[0].id,
      },
    });
    expect(membro.status(), await membro.text()).toBe(201);
    vendedoraId = (await membro.json()).usuarioId;
  });

  test.afterAll(async () => {
    await db.delete(atendimentosTable).where(eq(atendimentosTable.cabineId, cabineId));
    await db.delete(cabinesTable).where(eq(cabinesTable.id, cabineId));
    await apagarReservaDeProva(reserva);
    if (vendedoraId) await db.delete(usuariosTable).where(eq(usuariosTable.id, vendedoraId));
  });

  test("mover para dentro da prova é recusado; para depois dela passa", async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    // Base fixa dentro do expediente — cabine e vendedora são só desta execução.
    const ymd = diaLocalSP();
    const baseMs = Date.parse(`${ymd}T10:00:00-03:00`);
    const H = 3600_000;
    const iso = (ms: number) => new Date(ms).toISOString();
    // E161/G7: a rota passou a exigir a reserva do vestido em toda PROVA.
    reserva = await criarReservaParaProva(request, estado.lojaId, estado.leadId);

    const criar = (tipo: "ATENDIMENTO" | "PROVA", inicio: string) =>
      request.post(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos`, {
        data: {
          leadId: estado.leadId,
          cabineId,
          vendedoraId,
          tipo,
          ...(tipo === "PROVA" ? { bloqueioId: reserva!.bloqueioId } : {}),
          inicio,
        },
      });

    // Prova ocupa [base, base+1h). Atendimento avulso 3h depois (sem conflito).
    const prova = await criar("PROVA", iso(baseMs));
    expect(prova.status(), await prova.text()).toBe(201);
    const atend = await criar("ATENDIMENTO", iso(baseMs + 3 * H));
    expect(atend.status(), await atend.text()).toBe(201);
    const atendId = (await atend.json()).id as string;

    const mover = (ms: number) =>
      request.patch(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos/${atendId}`, {
        data: { cabineId, inicio: iso(ms) },
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
