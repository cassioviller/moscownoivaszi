import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5000";
const LOJA = "loja-moscow";
const OUT = "/tmp/repro-prova";
mkdirSync(OUT, { recursive: true });

const log = (m) => console.log(m);

const browser = await chromium.launch({
  executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

// 1) Login
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", "admin@moscownoivas.local");
await page.fill("#senha", "admin123");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 }).catch(() => {});
await page.waitForLoadState("networkidle");

// 1b) Selecionar loja
await page.goto(`${BASE}/selecionar-loja`, { waitUntil: "networkidle" });
await page.check(`input[name="lojaId"][value="${LOJA}"]`).catch(() => {});
await page.click('button[type="submit"]').catch(() => {});
await page.waitForURL((u) => !u.pathname.endsWith("/selecionar-loja"), { timeout: 15000 }).catch(() => {});
await page.waitForLoadState("networkidle");
log(`pós-login URL: ${page.url()}`);

// 2) Abrir Agendar e mudar Tipo para Prova
await page.goto(`${BASE}/loja/${LOJA}/atendimentos/novo`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Prova" }).click();
await page.waitForTimeout(300);

// Helpers: lê as opções e o valor selecionado do select de Reserva
async function lerReserva() {
  // espera sair do "Carregando reservas…" se estiver presente
  await page.waitForTimeout(600);
  const sel = page.locator('select[aria-label="Reserva"]');
  const existe = await sel.count();
  if (!existe) {
    const aviso = await page.locator('label:has-text("Reserva")').innerText().catch(() => "(sem label)");
    return { temSelect: false, aviso };
  }
  const opcoes = await sel.locator("option").allInnerTexts();
  const valor = await sel.inputValue();
  const selecionadoTexto = await sel.locator("option:checked").innerText().catch(() => "");
  return { temSelect: true, valor, selecionadoTexto, opcoes };
}

// Lista as noivas disponíveis
const noivaSel = page.locator('select[aria-label="Noiva"]');
const noivas = (await noivaSel.locator("option").allInnerTexts()).filter((t) => t && !/Selecione/.test(t));
log(`\nNoivas no seletor (${noivas.length}): ${noivas.slice(0, 6).join(" | ")} ...`);

// Escolhe duas noivas distintas para o teste de troca
const A = noivas.find((n) => /Mariana/.test(n)) ?? noivas[0];
const B = noivas.find((n) => /Camila/.test(n)) ?? noivas[1];

log(`\n=== PASSO 1: seleciona "${A}" ===`);
await noivaSel.selectOption({ label: A });
const r1 = await lerReserva();
log(JSON.stringify(r1, null, 2));
await page.screenshot({ path: `${OUT}/01-noivaA.png`, fullPage: true });

log(`\n=== PASSO 2: TROCA para "${B}" ===`);
await noivaSel.selectOption({ label: B });
const r2 = await lerReserva();
log(JSON.stringify(r2, null, 2));
await page.screenshot({ path: `${OUT}/02-noivaB.png`, fullPage: true });

log(`\n=== PASSO 3: VOLTA para "${A}" ===`);
await noivaSel.selectOption({ label: A });
const r3 = await lerReserva();
log(JSON.stringify(r3, null, 2));

// Veredito
log(`\n=== VEREDITO ===`);
if (r1.temSelect && r2.temSelect) {
  const mesmasOpcoes = JSON.stringify(r1.opcoes) === JSON.stringify(r2.opcoes);
  log(`Opções de A == opções de B ? ${mesmasOpcoes ? "SIM (suspeito: reservas não trocaram)" : "não (trocou corretamente)"}`);
  log(`Após trocar p/ B, valor pré-selecionado: "${r2.valor}" (esperado vazio se troca limpa)`);
}

await browser.close();
log(`\nscreenshots em ${OUT}`);
