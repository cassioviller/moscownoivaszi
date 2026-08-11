import { expect, type Page, type Locator, type APIRequestContext, request } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, atendimentosTable, cabinesTable } from "../lib/db/src/index";

export interface E2EState {
  lojaId: string;
  lojaNome: string;
  /** E93/D1: a segunda loja da admin — o "B" do bookmark com a sessão em A. */
  lojaBId: string;
  lojaBNome: string;
  adminEmail: string;
  mariaEmail: string;
  senha: string;
  vestidoId: string;
  leadId: string;
  orcamentoId: string;
  contratoId: string | null;
  cabineId: string;
  // S-D39: `bloqueioId` era gravado no state e nenhum spec o lia — saiu de lá
  // em vez de entrar aqui. Quem precisa do bloqueio da fixture o acha pelo
  // nome da noiva (13-onda2) ou cria o seu (23, 48).
}

export function lerEstado(): E2EState {
  return JSON.parse(readFileSync(path.join(__dirname, ".state.json"), "utf-8"));
}

export const API_URL = "http://localhost:5099";

/**
 * E115 — cria um atendimento num horário LIVRE do expediente, tentando outras
 * horas quando a agenda recusa por ocupação.
 *
 * O POST de atendimento passou a rodar as quatro recusas do agenda-core
 * (expediente e sobreposição de INTERVALO), e o banco do E2E persiste entre
 * execuções: as sobras acumuladas ocupam a vendedora e a cabine
 * compartilhadas, e um horário fixo colide de forma DETERMINÍSTICA — era a
 * família S7/S22, que o guard novo tirou do acaso. A saída é a do balcão
 * real: agenda ocupada, procura-se outro horário. Recusa que NÃO seja de
 * ocupação estoura na hora — ela é um defeito, não um horário ruim.
 */
export async function criarAtendimentoLivre(
  req: APIRequestContext,
  lojaId: string,
  dados: {
    leadId: string;
    cabineId: string;
    vendedoraId: string;
    tipo?: "ATENDIMENTO" | "PROVA";
    /** Dia (YYYY-MM-DD) no fuso da loja. */
    ymd: string;
  },
): Promise<{ id: string; inicio: string }> {
  const stamp = Date.now();
  for (let tentativa = 0; tentativa < 12; tentativa++) {
    const hh = String(9 + ((stamp + tentativa) % 8)).padStart(2, "0");
    const mm = String((Math.floor(stamp / 1000) + tentativa * 7) % 60).padStart(2, "0");
    const ss = String(stamp % 60).padStart(2, "0");
    const inicio = `${dados.ymd}T${hh}:${mm}:${ss}-03:00`;
    const res = await req.post(`${API_URL}/api/lojas/${lojaId}/atendimentos`, {
      data: {
        leadId: dados.leadId,
        cabineId: dados.cabineId,
        vendedoraId: dados.vendedoraId,
        tipo: dados.tipo ?? "ATENDIMENTO",
        inicio,
      },
    });
    if (res.status() === 201) {
      return { id: ((await res.json()) as { id: string }).id, inicio };
    }
    const corpo = (await res.json()) as { error?: string };
    if (corpo.error !== "CABINE_OCUPADA" && corpo.error !== "VENDEDORA_OCUPADA") {
      throw new Error(`criarAtendimentoLivre: ${res.status()} ${JSON.stringify(corpo)}`);
    }
  }
  throw new Error(
    "criarAtendimentoLivre: 12 horários tentados e todos ocupados — o banco do E2E precisa de limpeza (família S18/S25)",
  );
}

/**
 * S-D25/S-D40 — a régua única de limpeza da cabine criada por execução.
 *
 * O banco do E2E persiste entre execuções, e cabine esquecida não é lixo
 * invisível: ela nasce ATIVA na loja do seed e vira coluna que a agenda
 * desenha. Quando esta régua nasceu eram **220 `e<NN>-<timestamp>`** acumuladas
 * em uma semana (e22 68, e25 66, e24 36, e57 26, e59 24) — quatro novas por
 * passada completa da suíte. Os três specs que já limpavam escreviam a mesma
 * limpeza em três grafias, que é a regra 26 pedindo uma régua; a varredura
 * `varredura-cabines-do-e2e` cobra que spec que cria cabine chame esta.
 *
 * O delete de atendimentos é explícito, e não confiança no CASCADE do schema:
 * se a FK um dia virar RESTRICT, a limpeza continua inteira. Os imports são
 * ESTÁTICOS de propósito: `await import(...)` aqui atravessa a transpilação do
 * Playwright e chega ao `.ts` cru como ESM — `exports is not defined`, medido
 * com 7 specs vermelhos na primeira execução desta régua.
 */
export async function apagarCabineCriada(cabineId: string | null | undefined): Promise<void> {
  if (!cabineId) return;
  await db.delete(atendimentosTable).where(eq(atendimentosTable.cabineId, cabineId));
  await db.delete(cabinesTable).where(eq(cabinesTable.id, cabineId));
}

/** Login pela UI (o mesmo caminho da usuária real). */
export async function loginViaUI(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/**
 * Sessão via API com loja ativa (login + selecionar-loja), injetando o cookie
 * httpOnly no browser. Necessário para a vendedora: a tela de selecionar loja
 * quebra para ela (C5), então a UI não oferece caminho até o dashboard.
 */
export async function sessaoViaAPI(
  page: Page,
  email: string,
  senha: string,
  lojaId: string,
): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: API_URL });
  const login = await api.post("/api/auth/login", { data: { email, senha } });
  expect(login.ok(), `login API de ${email} deveria responder 200`).toBeTruthy();
  const selecionar = await api.post("/api/auth/selecionar-loja", { data: { lojaId } });
  expect(selecionar.ok(), "selecionar-loja via API deveria responder 200").toBeTruthy();

  const cookies = (await api.storageState()).cookies.map((c) => ({
    ...c,
    // O cookie foi emitido para :5099; o browser navega em :5173.
    domain: "localhost",
  }));
  await page.context().addCookies(cookies);
  return api;
}

/**
 * Fecha o tour do acesso (E24), que abre modal sobre o dashboard na PRIMEIRA
 * entrada de cada perfil. Enquanto ele está aberto o overlay do Radix intercepta
 * todo clique atrás dele — a sidebar existe no snapshot mas nada nela responde,
 * e o spec morre por timeout num `click` que parece trivial.
 *
 * Espera antes de checar: o tour monta depois que os acessos do /me resolvem,
 * então um `isVisible()` seco passa direto e a corrida volta mais tarde.
 */
export async function fecharTourDoAcesso(page: Page): Promise<void> {
  const comecar = page.getByRole("button", { name: "Começar" });
  await comecar.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  if (await comecar.isVisible().catch(() => false)) {
    await comecar.click();
    await expect(comecar).toBeHidden();
  }
}

/**
 * Arraste de verdade, para as telas com dnd-kit (funil do E27, grade do E28).
 *
 * `dragTo` do Playwright é um salto único e o PointerSensor só ativa depois de
 * 8px de movimento — o salto não passa por esse limiar e o drop nunca acontece.
 * Daí os passos intermediários.
 */
export async function arrastar(page: Page, alca: Locator, alvo: Locator): Promise<void> {
  // Numa grade alta com overflow, o alvo pode estar fora da viewport: o mouse
  // não alcança um ponto que não está na tela. Trazer o alvo à vista primeiro.
  await alvo.scrollIntoViewIfNeeded();
  const origem = await alca.boundingBox();
  const destino = await alvo.boundingBox();
  if (!origem || !destino) throw new Error("origem ou destino sem caixa visível");

  await page.mouse.move(origem.x + origem.width / 2, origem.y + origem.height / 2);
  await page.mouse.down();
  // O salto com passos intermediários cruza o limiar de 8px do PointerSensor já
  // no primeiro sub-passo; o clamp evita mirar longe demais numa coluna alta,
  // e numa célula baixa cai no centro (height/2 < 120).
  await page.mouse.move(
    destino.x + destino.width / 2,
    destino.y + Math.min(destino.height / 2, 120),
    { steps: 20 },
  );
  await page.mouse.up();
}

export interface ErroApi {
  status: number;
  url: string;
}

/**
 * Coleta respostas de erro das chamadas /api feitas pela página — evidência
 * objetiva de contrato quebrado entre frontend e servidor.
 *
 * 404s que são ESTADO (não erro) ficam de fora: o card do portal (E78)
 * pergunta "existe link?" e "nunca gerado" responde 404 por contrato.
 */
const ERROS_ESPERADOS = [/^GET .*\/leads\/[^/]+\/portal$/];

export function coletarErrosApi(page: Page): ErroApi[] {
  const erros: ErroApi[] = [];
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/api/") || res.status() < 400) return;
    const caminho = url.replace(/^https?:\/\/[^/]+/, "");
    const assinatura = `${res.request().method()} ${caminho}`;
    if (res.status() === 404 && ERROS_ESPERADOS.some((re) => re.test(assinatura))) return;
    erros.push({ status: res.status(), url: caminho });
  });
  return erros;
}

export function resumoErros(erros: ErroApi[]): string {
  return erros.map((e) => `${e.status} ${e.url}`).join("\n");
}

/**
 * S-M25 (rodada 2, achado 2#3) — o "hoje" (e o dia relativo) no fuso da LOJA.
 *
 * Dez specs computavam o dia por `toISOString().slice(0, 10)` — o calendário
 * UTC. Das 21h à meia-noite de São Paulo o dia UTC já é o dia SEGUINTE: o
 * spec 09 criava a conta vencendo no dia-UTC e a tela de Pagar (janela do mês
 * corrente de `hojeLocal()`) não a mostrava — vermelho determinístico nas ~3
 * horas finais do último dia de cada mês, sem código errado. O app inteiro
 * vive em `hojeLocal()`; os specs passam a viver no mesmo dia.
 */
export function diaLocalSP(offsetDias = 0, base: Date = new Date()): string {
  const instante = new Date(base.getTime() + offsetDias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}
