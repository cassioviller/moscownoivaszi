import { chromium } from "playwright";

const BASE = "http://localhost:5000";
const LOJA = "loja-moscow";
const log = (m) => console.log(m);

const browser = await chromium.launch({
  executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", "admin@moscownoivas.local");
await page.fill("#senha", "admin123");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 }).catch(() => {});
await page.goto(`${BASE}/selecionar-loja`, { waitUntil: "networkidle" });
await page.check(`input[name="lojaId"][value="${LOJA}"]`).catch(() => {});
await page.click('button[type="submit"]').catch(() => {});
await page.waitForURL((u) => !u.pathname.endsWith("/selecionar-loja"), { timeout: 15000 }).catch(() => {});

// 1) Abrir o livro de reservas e entrar na primeira reserva
await page.goto(`${BASE}/loja/${LOJA}/reservas`, { waitUntil: "networkidle" });
const primeira = page.locator('a[href*="/reservas/"]').first();
const hrefReserva = await primeira.getAttribute("href");
log(`Entrando na reserva: ${hrefReserva}`);
await primeira.click();
await page.waitForLoadState("networkidle");

// Nome da noiva DONA da reserva (do H1 do detalhe)
const h1 = await page.locator("h1").first().innerText().catch(() => "(sem h1)");
log(`Detalhe da reserva — título: ${h1}`);

// 2) Clicar em "Agendar prova" (deep-link com noiva+reserva pré-preenchidos)
const agendarProva = page.getByRole("link", { name: /Agendar prova/i });
if ((await agendarProva.count()) === 0) {
  log("!! Não achei o link 'Agendar prova' nesta reserva.");
  await browser.close();
  process.exit(0);
}
await agendarProva.click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);
log(`URL do agendar: ${page.url()}`);

async function estado() {
  const noiva = page.locator('select[aria-label="Noiva"]');
  const reserva = page.locator('select[aria-label="Reserva"]');
  const noivaTxt = await noiva.locator("option:checked").innerText().catch(() => "");
  const temReserva = await reserva.count();
  const reservaVal = temReserva ? await reserva.inputValue() : "(sem select)";
  const reservaTxt = temReserva ? await reserva.locator("option:checked").innerText().catch(() => "") : "";
  // valor do input oculto que VAI pro servidor
  const hidden = await page.locator('input[name="bloqueioId"]').inputValue().catch(() => "(n/a)");
  return { noivaTxt, reservaVal, reservaTxt, hiddenBloqueioId: hidden };
}

log(`\n=== ESTADO INICIAL (deep-link) ===`);
const e0 = await estado();
log(JSON.stringify(e0, null, 2));

// 3) Trocar a noiva para OUTRA e ver se a reserva/hidden limpam
const noivaSel = page.locator('select[aria-label="Noiva"]');
const todas = (await noivaSel.locator("option").allInnerTexts()).filter((t) => t && !/Selecione/.test(t));
const outra = todas.find((n) => n !== e0.noivaTxt.trim());
log(`\n=== TROCA a noiva para "${outra}" ===`);
await noivaSel.selectOption({ label: outra });
await page.waitForTimeout(800);
const e1 = await estado();
log(JSON.stringify(e1, null, 2));

log(`\n=== VEREDITO ===`);
log(`Hidden bloqueioId após trocar a noiva: "${e1.hiddenBloqueioId}" (esperado VAZIO; se trouxe o da noiva anterior = BUG)`);
log(`Reserva visível após trocar: "${e1.reservaTxt}"`);

await browser.close();
