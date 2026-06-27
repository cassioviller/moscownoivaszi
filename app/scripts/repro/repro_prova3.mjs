import { chromium } from "playwright";
const BASE = "http://localhost:5000", LOJA = "loja-moscow";
const browser = await chromium.launch({ executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", "admin@moscownoivas.local"); await page.fill("#senha", "admin123");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 }).catch(()=>{});
await page.waitForLoadState("networkidle");
await page.goto(`${BASE}/selecionar-loja`, { waitUntil: "networkidle" });
await page.check(`input[name="lojaId"][value="${LOJA}"]`).catch(()=>{});
await page.click('button[type="submit"]').catch(()=>{});
await page.waitForURL((u) => !u.pathname.endsWith("/selecionar-loja"), { timeout: 15000 }).catch(()=>{});
await page.waitForLoadState("networkidle");
await page.goto(`${BASE}/loja/${LOJA}/reservas/demo-blq-01`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
console.log("URL:", page.url());
console.log("H1/H2:", JSON.stringify(await page.locator("h1,h2").allInnerTexts()));
const links = await page.locator('a[href*="atendimentos/novo"]').evaluateAll(els => els.map(e => ({ txt: e.textContent.trim(), href: e.getAttribute("href") })));
console.log("links agendar:", JSON.stringify(links, null, 2));

// Segue o deep-link e inspeciona o estado pré-preenchido + troca de noiva
if (links.length) {
  await page.goto(`${BASE}${links[0].href}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const ler = async () => ({
    noiva: await page.locator('select[aria-label="Noiva"] option:checked').innerText().catch(()=> ""),
    reservaVal: await page.locator('select[aria-label="Reserva"]').inputValue().catch(()=> "(sem select)"),
    reservaTxt: await page.locator('select[aria-label="Reserva"] option:checked').innerText().catch(()=> ""),
    hidden: await page.locator('input[name="bloqueioId"]').inputValue().catch(()=> "(n/a)"),
  });
  console.log("\n=== deep-link pré-preenchido ===");
  console.log(JSON.stringify(await ler(), null, 2));
  const sel = page.locator('select[aria-label="Noiva"]');
  const nomes = (await sel.locator("option").allInnerTexts()).filter(t => t && !/Selecione/.test(t));
  const atual = (await ler()).noiva.trim();
  const outra = nomes.find(n => n !== atual);
  console.log(`\n=== troca noiva -> "${outra}" ===`);
  await sel.selectOption({ label: outra }); await page.waitForTimeout(900);
  console.log(JSON.stringify(await ler(), null, 2));
}
await browser.close();
