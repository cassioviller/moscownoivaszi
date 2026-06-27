import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = "http://localhost:5000", LOJA = "loja-moscow";
mkdirSync("/tmp/dia", { recursive: true });
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
await page.goto(`${BASE}/loja/${LOJA}`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
console.log("tem 'Hoje no atelier'?", await page.locator('h2:has-text("Hoje no atelier")').count());
console.log("seções visíveis:", JSON.stringify(await page.locator('main h3').allInnerTexts()));
await page.screenshot({ path: "/tmp/dia/inicio.png", fullPage: true });

// Calendário — grade limpa (sem dia), depois clicar um dia
await page.goto(`${BASE}/loja/loja-moscow/calendario?aba=mes`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
console.log("painel aberto sem clique? (espera 0):", await page.locator('main h3').count());
await page.screenshot({ path: "/tmp/dia/mes.png", fullPage: true });
const algumDia = page.locator('a[href*="&dia="]').first();
await algumDia.click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(400);
console.log("após clicar, URL tem &dia=?", page.url().includes("&dia="));
console.log("anel/seção do dia (h3) presente?", await page.locator('main h3').count());
await page.screenshot({ path: "/tmp/dia/mes-aberto.png", fullPage: true });

await browser.close();
