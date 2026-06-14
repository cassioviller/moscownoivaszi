import { chromium } from "playwright";
const BASE = "http://localhost:5000", LOJA = "loja-moscow";
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

const DEEP = `${BASE}/loja/${LOJA}/atendimentos/novo?noiva=demo-ld-01&tipo=PROVA&reserva=demo-blq-01`;
await page.goto(DEEP, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
console.log("URL pós-goto:", page.url());

const noiva = page.locator('select[aria-label="Noiva"]');
console.log("noiva.value:", JSON.stringify(await noiva.inputValue()));
const opts = await noiva.locator("option").evaluateAll(os => os.map(o => ({ v: o.value, t: o.textContent.trim() })));
console.log("demo-ld-01 está nas opções?", opts.some(o => o.v === "demo-ld-01"));
console.log("primeiras opções:", JSON.stringify(opts.slice(0, 4)));

// Tipo atual (botão pressionado)
const tipoPressed = await page.locator('button[aria-pressed="true"]').allInnerTexts().catch(()=>[]);
console.log("Tipo pressionado:", JSON.stringify(tipoPressed));

// Bloco da reserva: texto + existe select?
const blocoReserva = await page.locator('label:has-text("Reserva")').first().innerText().catch(()=> "(sem bloco)");
console.log("bloco Reserva:", JSON.stringify(blocoReserva));
console.log("hidden bloqueioId:", JSON.stringify(await page.locator('input[name="bloqueioId"]').inputValue().catch(()=>"(n/a)")));
console.log("hidden leadId:", JSON.stringify(await page.locator('input[name="leadId"]').inputValue().catch(()=>"(n/a)")));

await page.screenshot({ path: "/tmp/repro-prova/deeplink.png", fullPage: true });
await browser.close();
