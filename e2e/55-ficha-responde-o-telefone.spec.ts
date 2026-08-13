import { test, expect, request as pwRequest } from "@playwright/test";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  leadsTable,
  parcelasTable,
  contratosTable,
  atendimentosTable,
} from "../lib/db/src/index";
import {
  lerEstado,
  API_URL,
  criarAtendimentoLivre,
  apagarCabineCriada,
  apagarReservaDeProva,
  type ReservaDeProva,
  QUALIFICACAO_DA_NOIVA,
} from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E125 (D3/D4): a ficha responde o telefone.
 *
 * A ligação mais comum tem duas perguntas. "Que dia é a minha prova?" — a
 * ficha não pedia a agenda; a resposta custava 2 telas e uma digitação.
 * "Quanto falta pagar?" — a soma do aberto só existia DENTRO do diálogo de
 * cancelar; a vendedora somava 7 parcelas de cabeça por ligação.
 *
 * O spec cria a noiva do caso do achado (contrato de R$ 8.400,00 em 10×, 3
 * recebidas → faltam R$ 5.880,00, prova marcada) e prova pelas TELAS. Uma
 * segunda noiva NOVA com horário marcado prova que o banner parou de sugerir
 * agendar o que já existe.
 */
test.describe("E125 — a ficha responde o telefone", () => {
  const stamp = Date.now();
  const noivaNome = `E2E Telefone ${stamp}`;
  const noivaNovaNome = `E2E Telefone Nova ${stamp}`;
  let leadId: string;
  let leadNovaId: string;
  let contratoId: string;
  let cabineId: string;
  // E161/G7: a PROVA da visita ganha reserva descartável — a limpeza é nossa.
  const reservas: ReservaDeProva[] = [];

  test.beforeAll(async () => {
    const api = await pwRequest.newContext({ baseURL: API_URL });
    await api.post("/api/auth/login", {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await api.post("/api/auth/selecionar-loja", { data: { lojaId: estado.lojaId } });

    const equipe = await api.get(`/api/lojas/${estado.lojaId}/equipe`);
    const vendedoras = ((await equipe.json()) as { usuarioId: string }[]).map((m) => m.usuarioId);
    const vendedoraId = vendedoras[0]!;

    // Cabine própria por execução: o banco do E2E persiste e a checagem de
    // intervalo faz execuções colidirem na cabine compartilhada (lição do 49).
    const cab = await api.post(`/api/lojas/${estado.lojaId}/cabines`, {
      data: { nome: `e55-${stamp}` },
    });
    expect(cab.status(), await cab.text()).toBe(201);
    cabineId = ((await cab.json()) as { id: string }).id;

    const ymdFuturo = (offsetDias: number) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
        new Date(Date.now() + offsetDias * 24 * 3_600_000),
      );

    // A visita só precisa ser FUTURA: tenta-se dias e vendedoras até achar
    // vaga. O dia +6 fica FORA da lista de propósito — é o dia que o spec 49
    // usa com a vendedora compartilhada, e disputar os mesmos horários numa
    // suíte paralela é colisão gratuita.
    const visitaFutura = async (dados: { leadId: string; tipo: "ATENDIMENTO" | "PROVA" }) => {
      const erros: string[] = [];
      for (const offset of [8, 9, 11, 13, 15]) {
        for (const v of vendedoras) {
          try {
            const criado = await criarAtendimentoLivre(api, estado.lojaId, {
              leadId: dados.leadId,
              cabineId,
              vendedoraId: v,
              tipo: dados.tipo,
              ymd: ymdFuturo(offset),
            });
            if (criado.reservaCriada) reservas.push(criado.reservaCriada);
            return criado;
          } catch (e) {
            erros.push(String(e));
          }
        }
      }
      throw new Error(`visitaFutura: nenhuma vaga em 5 dias × equipe.\n${erros.join("\n")}`);
    };

    // ── Noiva do telefone: contrato 8.400 em 10×, 3 recebidas, prova marcada.
    const lead = await api.post(`/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome, whatsapp: "11955553333", ...QUALIFICACAO_DA_NOIVA },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = ((await lead.json()) as { id: string }).id;

    const contrato = await api.post(`/api/lojas/${estado.lojaId}/contratos`, {
      data: { leadId, vendedoraId, valorTotal: 8400 },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    contratoId = ((await contrato.json()) as { id: string }).id;

    const plano = await api.post(
      `${API_URL}/api/lojas/${estado.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`,
      { data: { numParcelas: 10, primeiroVencimento: new Date(Date.now() + 30 * 24 * 3_600_000).toISOString() } },
    );
    expect(plano.status(), await plano.text()).toBe(201);

    const cheio = await api.get(`/api/lojas/${estado.lojaId}/contratos/${contratoId}`);
    const parcelas = ((await cheio.json()) as { parcelas: { id: string; numero: number }[] })
      .parcelas.sort((a, b) => a.numero - b.numero);
    for (const p of parcelas.slice(0, 3)) {
      const rec = await api.post(`/api/lojas/${estado.lojaId}/parcelas/${p.id}/receber`, {
        data: { valorRecebido: 840, recebidoEm: new Date().toISOString(), formaRecebimento: "PIX" },
      });
      expect(rec.status(), await rec.text()).toBe(200);
    }

    await visitaFutura({ leadId, tipo: "PROVA" });

    // ── Noiva NOVA com horário já marcado: o caso do banner (D3).
    const leadNova = await api.post(`/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: noivaNovaNome },
    });
    expect(leadNova.status(), await leadNova.text()).toBe(201);
    leadNovaId = ((await leadNova.json()) as { id: string }).id;
    await visitaFutura({ leadId: leadNovaId, tipo: "ATENDIMENTO" });

    await api.dispose();
  });

  test.afterAll(async () => {
    // O banco do E2E persiste entre execuções: o rastro deste spec sai.
    const leads = [leadId, leadNovaId].filter(Boolean);
    if (leads.length > 0)
      await db.delete(atendimentosTable).where(inArray(atendimentosTable.leadId, leads));
    // E161/G7: a reserva descartável sai antes do lead que ela referencia.
    for (const r of reservas) await apagarReservaDeProva(r);
    await apagarCabineCriada(cabineId);
    if (contratoId) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));
      await db.delete(contratosTable).where(eq(contratosTable.id, contratoId));
    }
    if (leads.length > 0) await db.delete(leadsTable).where(inArray(leadsTable.id, leads));
  });

  test("a ficha diz a próxima prova e quanto falta receber", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/noivas/${leadId}`);
    await expect(page.getByTestId("text-noiva-nome")).toBeVisible();

    // D3: a resposta de "que dia é a minha prova?" no card do casamento,
    // com link para a agenda do dia.
    await expect(page.getByText("Próxima prova")).toBeVisible();
    await expect(page.getByTestId("link-proxima-visita")).toBeVisible();

    // D4: "quanto falta pagar?" — 10×840 com 3 recebidas = R$ 5.880,00.
    await expect(page.getByTestId("text-falta-receber-ficha")).toHaveText(/5\.880,00/);
  });

  test("o contrato mostra o saldo devedor fora do diálogo de cancelar", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/contratos/${contratoId}`);
    await expect(page.getByText("Detalhes financeiros")).toBeVisible();
    await expect(page.getByTestId("text-falta-receber")).toHaveText(/5\.880,00/);
  });

  test("o banner não manda agendar o que já está marcado", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/noivas/${leadNovaId}`);
    await expect(page.getByTestId("text-noiva-nome")).toBeVisible();

    // Etapa NOVO + atendimento futuro: o passo vira o preparo, não o agendar.
    await expect(page.getByText("Registrar os interesses dela")).toBeVisible();
    await expect(page.getByText("Agendar o primeiro atendimento")).toHaveCount(0);
    // E o card do casamento nomeia o horário marcado.
    await expect(page.getByText("Próximo atendimento")).toBeVisible();
  });
});
