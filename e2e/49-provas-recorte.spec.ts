import { test, expect, request as pwRequest, type Page } from "@playwright/test";
import path from "node:path";
import { inArray } from "drizzle-orm";
import { db, leadsTable, atendimentosTable } from "../lib/db/src/index";
import {
  lerEstado,
  API_URL,
  criarAtendimentoLivre,
  apagarCabineCriada,
  apagarReservaDeProva,
  type ReservaDeProva,
} from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E87: a tela de provas pede o RECORTE pela janela do E83 — futuras = `de=hoje`,
 * passadas = `ate=ontem` — e o toggle continua contando a verdade: cada lente
 * mostra exatamente a prova que lhe pertence, e nenhuma request pede o acervo
 * inteiro. Duas noivas de nomes únicos (uma prova futura, uma passada) provam
 * as duas direções do corte.
 */
test.describe("Provas pedem o recorte (E87)", () => {
  const sufixo = Date.now();
  const nomeFutura = `E2E Prova Futura ${sufixo}`;
  const nomePassada = `E2E Prova Passada ${sufixo}`;
  const leadIds: string[] = [];
  // E161/G7: cada PROVA ganha uma reserva descartável — e a limpeza é nossa.
  const reservas: ReservaDeProva[] = [];
  let cabineId: string;

  /** Coleta as URLs das chamadas GET /atendimentos que a tela dispara. */
  function observarAtendimentos(page: Page): URL[] {
    const urls: URL[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (r.method() === "GET" && url.pathname.endsWith("/atendimentos")) urls.push(url);
    });
    return urls;
  }

  test.beforeAll(async () => {
    const api = await pwRequest.newContext({ baseURL: API_URL });
    await api.post("/api/auth/login", {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await api.post("/api/auth/selecionar-loja", { data: { lojaId: estado.lojaId } });

    const equipe = await api.get(`/api/lojas/${estado.lojaId}/equipe`);
    const vendedoraId = ((await equipe.json()) as { usuarioId: string }[])[0]!.usuarioId;

    // E115: o POST passou a rodar as recusas do expediente, e o "09:00" daqui
    // era `setHours` no relógio do PROCESSO (UTC no container) — 06:00 em São
    // Paulo, FORA_DO_HORARIO. Hora no fuso da LOJA, e cabine própria por
    // execução: a checagem de INTERVALO nova faz duas execuções no mesmo dia
    // colidirem na cabine compartilhada (a prova ocupa 90 minutos).
    const stamp = Date.now();
    const cab = await api.post(`/api/lojas/${estado.lojaId}/cabines`, {
      data: { nome: `e49-${stamp}` },
    });
    expect(cab.status(), await cab.text()).toBe(201);
    cabineId = ((await cab.json()) as { id: string }).id;
    const prova = async (noivaNome: string, offsetDias: number) => {
      const lead = await api.post(`/api/lojas/${estado.lojaId}/leads`, {
        data: { noivaNome, origem: "LOJA" },
      });
      expect(lead.status(), await lead.text()).toBe(201);
      const leadId = ((await lead.json()) as { id: string }).id;
      leadIds.push(leadId);
      const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
        new Date(Date.now() + offsetDias * 24 * 3_600_000),
      );
      // Horário LIVRE: a vendedora é compartilhada e o banco persiste — as
      // sobras das execuções passadas ocupam intervalos (E115).
      const criado = await criarAtendimentoLivre(api, estado.lojaId, {
        leadId,
        cabineId,
        vendedoraId,
        tipo: "PROVA",
        ymd,
      });
      if (criado.reservaCriada) reservas.push(criado.reservaCriada);
    };

    await prova(nomeFutura, 6);
    await prova(nomePassada, -6);
    await api.dispose();
  });

  test.afterAll(async () => {
    // O banco do E2E persiste entre execuções, e este spec era o último de
    // agenda SEM limpeza (família S18/S25): cada passada completa deixava uma
    // prova de 90min no dia +6 da vendedora[0] — na rodada 7, com uma suíte
    // completa por épico no MESMO dia, seis sobras saturaram o expediente e o
    // beforeAll passou a falhar com 12 horários ocupados.
    if (leadIds.length > 0) {
      await db.delete(atendimentosTable).where(inArray(atendimentosTable.leadId, leadIds));
    }
    // E161/G7: as reservas descartáveis saem ANTES dos leads — o bloqueio
    // referencia o lead, e a peça não pode acumular no banco persistente.
    for (const r of reservas) await apagarReservaDeProva(r);
    if (leadIds.length > 0) {
      await db.delete(leadsTable).where(inArray(leadsTable.id, leadIds));
    }
    await apagarCabineCriada(cabineId);
  });

  test("o toggle futuras/passadas conta a verdade e só pede a janela", async ({ page }) => {
    const chamadas = observarAtendimentos(page);

    await page.goto("/provas");
    await expect(page.getByRole("heading", { name: "Provas", exact: true })).toBeVisible();

    // Lente das próximas: a prova futura está, a passada NÃO veio junto.
    await expect(page.getByText(nomeFutura)).toBeVisible();
    await expect(page.getByText(nomePassada)).toHaveCount(0);

    // Ver o passado é uma escolha explícita — e a lente inverte por inteiro.
    await page.getByRole("button", { name: "Ver provas anteriores" }).click();
    await expect(page.getByRole("heading", { name: "Provas anteriores" })).toBeVisible();
    await expect(page.getByText(nomePassada)).toBeVisible();
    await expect(page.getByText(nomeFutura)).toHaveCount(0);

    // Nenhuma chamada pediu o acervo: toda request de atendimentos que a página
    // dispara (a tela E o poll do sino, que também roda aqui) leva uma borda de
    // janela; e a tela pediu exatamente as duas lentes de PROVA — futuras com
    // de=, passadas com ate=.
    expect(chamadas.length).toBeGreaterThanOrEqual(2);
    for (const url of chamadas) {
      expect(
        url.searchParams.has("de") || url.searchParams.has("ate"),
        `pediu o acervo inteiro: ${url}`,
      ).toBe(true);
    }
    const daTela = chamadas.filter((u) => u.searchParams.get("tipo") === "PROVA");
    expect(daTela.some((u) => u.searchParams.has("de") && !u.searchParams.has("ate"))).toBe(true);
    expect(daTela.some((u) => u.searchParams.has("ate") && !u.searchParams.has("de"))).toBe(true);
  });
});
