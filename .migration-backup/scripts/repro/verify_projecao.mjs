import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = "http://localhost:5000", LOJA = "loja-moscow";
mkdirSync("/tmp/projecao", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", "admin@moscownoivas.local"); await page.fill("#senha", "admin123");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 }).catch(()=>{});
await page.goto(`${BASE}/selecionar-loja`, { waitUntil: "networkidle" });
await page.check(`input[name="lojaId"][value="${LOJA}"]`).catch(()=>{});
await page.click('button[type="submit"]').catch(()=>{});
await page.waitForURL((u) => !u.pathname.endsWith("/selecionar-loja"), { timeout: 15000 }).catch(()=>{});

// Verificar link "Projeção de caixa" na tela de Fluxo de caixa
await page.goto(`${BASE}/loja/${LOJA}/financeiro`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const linkProjecao = page.locator('a[href*="/financeiro/projecao"]');
console.log("link 'Projeção de caixa' visível no Fluxo?", await linkProjecao.count());
await page.screenshot({ path: "/tmp/projecao/fluxo.png", fullPage: true });

// Navegar para a tela de Projeção de caixa
await page.goto(`${BASE}/loja/${LOJA}/financeiro/projecao`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
console.log("título da projeção:", await page.locator('h1').innerText().catch(() => "(não encontrado)"));
await page.screenshot({ path: "/tmp/projecao/projecao-inicial.png", fullPage: true });

// Se o form de saldo de referência estiver presente, preencher e salvar
const formSaldo = page.locator('form, section').filter({ hasText: /saldo.*referência|informe.*saldo/i }).first();
const formVisivel = await formSaldo.isVisible().catch(() => false);
if (formVisivel) {
  console.log("form de saldo de referência encontrado — preenchendo...");
  // Data de hoje no formato YYYY-MM-DD
  const hoje = new Date().toISOString().slice(0, 10);
  const inputData = page.locator('input[type="date"], input[name="data"]').first();
  const inputValor = page.locator('input[name="valor"], input[placeholder*="0,00"], input[placeholder*="valor"]').first();
  await inputData.fill(hoje).catch(() => console.log("campo data não encontrado"));
  await inputValor.fill("8000,00").catch(() => console.log("campo valor não encontrado"));
  await page.screenshot({ path: "/tmp/projecao/projecao-form-preenchido.png", fullPage: true });
  const btnSalvar = page.locator('button[type="submit"]').first();
  await btnSalvar.click().catch(() => console.log("botão salvar não encontrado"));
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
  console.log("após salvar, URL:", page.url());
  await page.screenshot({ path: "/tmp/projecao/projecao-pos-saldo.png", fullPage: true });
} else {
  console.log("form de saldo de referência não encontrado — projeção já pode estar configurada");
}

// Screenshot final da projeção com saldo/curva
await page.screenshot({ path: "/tmp/projecao/projecao-final.png", fullPage: true });
console.log("títulos de seção:", JSON.stringify(await page.locator('main h2, main h3').allInnerTexts().catch(() => [])));

await browser.close();
