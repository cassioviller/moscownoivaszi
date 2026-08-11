import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, atendimentosTable, cabinesTable, usuariosTable, vestidosTable } from "../lib/db/src/index";
import { lerEstado, API_URL , diaLocalSP} from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E37: concluir um atendimento de PROVA carimba `provaDataReal` no bloqueio,
 * fechando o loop agenda↔disponibilidade. Antes só a edição manual da reserva
 * setava esse campo. Teste de API puro — a lógica vive no PATCH do atendimento.
 *
 * Cabine, vendedora E vestido PRÓPRIOS por execução (mesmo desenho do spec 26,
 * sobra da rodada 5): o banco e2e é persistente e cada run deixava uma prova
 * de 1h na cabine/vendedora compartilhadas e um bloqueio no vestido
 * compartilhado — o "instante único"/"offset único" sorteados colidiam cada
 * vez mais conforme os runs acumulavam (flake visto na rodada do E87; o
 * VESTIDO_INDISPONIVEL reapareceu ao reproduzir aqui). Com recurso próprio as
 * datas podem ser FIXAS, e o afterAll limpa tudo (bloqueios caem em cascata
 * com o vestido).
 */
test.describe("Prova conclui e carimba a data real (E37)", () => {
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const cabineId = `e2e-cabine-e37-${randomUUID().slice(0, 8)}`;
  const vestidoId = `e2e-vestido-e37-${randomUUID().slice(0, 8)}`;
  let vendedoraId: string;

  test.beforeAll(async ({ request }) => {
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: estado.lojaId, nome: cabineId });
    await db.insert(vestidosTable).values({
      id: vestidoId,
      lojaId: estado.lojaId,
      codigo: vestidoId,
      nome: `E2E Vestido E37 ${stamp}`,
      precoBase: 4200,
      tamanho: "38",
      cor: "Marfim",
      categoria: "Princesa",
    });

    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
    const perfis = await request.get(`${API_URL}/api/admin/perfis`);
    expect(perfis.status(), await perfis.text()).toBe(200);
    const membro = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/equipe`, {
      data: {
        nome: `E2E Vendedora E37 ${stamp}`,
        email: `e2e-vendedora-e37-${stamp}@teste.local`,
        senha: "senha-e2e-123456",
        perfilId: (await perfis.json())[0].id,
      },
    });
    expect(membro.status(), await membro.text()).toBe(201);
    vendedoraId = (await membro.json()).usuarioId;
  });

  test.afterAll(async () => {
    await db.delete(atendimentosTable).where(eq(atendimentosTable.cabineId, cabineId));
    await db.delete(vestidosTable).where(eq(vestidosTable.id, vestidoId));
    await db.delete(cabinesTable).where(eq(cabinesTable.id, cabineId));
    if (vendedoraId) await db.delete(usuariosTable).where(eq(usuariosTable.id, vendedoraId));
  });

  test("concluir a prova seta provaDataReal no bloqueio", async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    // Bloqueio em data futura fixa: o vestido é só desta execução, então não
    // há ocupação acumulada de runs anteriores com quem colidir (o offset
    // sorteado de antes ainda flakeava — VESTIDO_INDISPONIVEL — quando o
    // sorteio caía numa janela já ocupada do vestido compartilhado).
    const casamento = new Date(Date.now() + 90 * 24 * 3600_000).toISOString();
    const bloq = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/bloqueios`, {
      data: {
        vestidoId,
        leadId: estado.leadId,
        tipo: "RESERVA_CASAMENTO",
        casamentoData: casamento,
      },
    });
    expect(bloq.status(), await bloq.text()).toBe(201);
    const bloqueioId = (await bloq.json()).id as string;

    // Prova ligada ao bloqueio, instante fixo dentro do expediente — cabine e
    // vendedora são só desta execução, então não há com quem colidir.
    const ymd = diaLocalSP();
    const inicio = new Date(Date.parse(`${ymd}T10:00:00-03:00`)).toISOString();
    const at = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos`, {
      data: {
        leadId: estado.leadId,
        cabineId,
        vendedoraId,
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
