import { chromium } from "playwright";

const BASE = "http://localhost:5000";
const LOJA = "loja-moscow";
const LEAD = "demo-ld-01";
const OUT = "/tmp/b1";
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });

const findings = [];
const note = (m) => { console.log(m); findings.push(m); };

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
// login via server action → redirect RSC; espera sair de /login (até 15s)
try {
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
} catch {
  const erro = await page.evaluate(() => document.querySelector('[role="alert"]')?.textContent?.trim() ?? null);
  note(`login NÃO redirecionou — erro na tela: ${JSON.stringify(erro)}`);
}
await page.waitForLoadState("networkidle");
note(`pós-login URL: ${page.url()}`);

// 1b) Selecionar loja ativa (admin multi-loja → lojaAtivaId na sessão)
await page.goto(`${BASE}/selecionar-loja`, { waitUntil: "networkidle" });
await page.check(`input[name="lojaId"][value="${LOJA}"]`);
await page.click('button[type="submit"]');
try {
  await page.waitForURL((u) => !u.pathname.endsWith("/selecionar-loja"), { timeout: 15000 });
} catch {
  note(`seleção de loja NÃO redirecionou (ainda em ${page.url()})`);
}
await page.waitForLoadState("networkidle");
note(`pós-seleção URL: ${page.url()}`);

// 2) Lista de noivas (desktop)
await page.goto(`${BASE}/loja/${LOJA}/noivas`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/01-lista-desktop.png`, fullPage: true });

// título em serifa (font-display)?
const tituloDisplay = await page.evaluate(() => {
  const h = document.querySelector("h1, h2");
  if (!h) return null;
  const f = getComputedStyle(h).fontFamily;
  return { texto: h.textContent?.trim().slice(0, 60), fontFamily: f };
});
note(`título lista: ${JSON.stringify(tituloDisplay)}`);

// contagem do casamento + cor bordô
const contagens = await page.evaluate(() => {
  const txt = document.body.innerText;
  const tem = /Em \d+ dias|É hoje|Amanhã/.test(txt);
  // procurar elementos com cor bordô aplicada
  const all = [...document.querySelectorAll("*")];
  const bordoEls = all.filter((e) => {
    const c = getComputedStyle(e).color;
    // bordô ~ rgb(122,24,54) / variações
    const m = c.match(/rgb\((\d+), (\d+), (\d+)\)/);
    if (!m) return false;
    const [r, g, b] = [+m[1], +m[2], +m[3]];
    return r > 80 && r < 160 && g < 60 && b > 30 && b < 90;
  }).map((e) => e.textContent?.trim().slice(0, 40)).filter(Boolean);
  return { temContagem: tem, exemplosBordo: [...new Set(bordoEls)].slice(0, 8) };
});
note(`contagem na lista: ${JSON.stringify(contagens)}`);

// 3) Lista responsiva 375px
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(300);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
await page.screenshot({ path: `${OUT}/02-lista-375.png`, fullPage: true });
note(`lista 375px overflow horizontal: ${overflow ? "SIM (ruim)" : "não"}`);
await page.setViewportSize({ width: 1366, height: 900 });

// 4) Empty state — loja sem noivas (loja-teste-2)
await page.goto(`${BASE}/loja/loja-teste-2/noivas`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
const emptyTxt = await page.evaluate(() => document.querySelector("main")?.innerText?.slice(0, 200) ?? document.body.innerText.slice(0, 200));
await page.screenshot({ path: `${OUT}/03-empty.png`, fullPage: true });
note(`empty state texto: ${JSON.stringify(emptyTxt)}`);

// 5) Detalhe da noiva
await page.goto(`${BASE}/loja/${LOJA}/noivas/${LEAD}`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/04-detalhe-desktop.png`, fullPage: true });
const detalhe = await page.evaluate(() => {
  const txt = document.querySelector("main")?.innerText ?? "";
  return {
    temAgendar: /Agendar/i.test(txt),
    temIniciar: /Iniciar/i.test(txt),
    temCasamento: /Casamento/i.test(txt),
    temContato: /Contato|WhatsApp/i.test(txt),
    temJornada: /Jornada|Consulta|Prova|Ajuste|Entrega/i.test(txt),
  };
});
note(`detalhe blocos: ${JSON.stringify(detalhe)}`);

// 6) Foco de teclado visível no detalhe
const focoVisivel = await page.evaluate(() => {
  const a = document.querySelector("main a, main button");
  if (!a) return null;
  a.focus();
  const s = getComputedStyle(a);
  return { tag: a.tagName, outline: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow.slice(0, 40) };
});
note(`foco 1º elemento interativo: ${JSON.stringify(focoVisivel)}`);

// detalhe 375px
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(300);
const overflowDet = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
await page.screenshot({ path: `${OUT}/05-detalhe-375.png`, fullPage: true });
note(`detalhe 375px overflow horizontal: ${overflowDet ? "SIM (ruim)" : "não"}`);

await browser.close();
console.log("\n=== SCREENSHOTS em " + OUT + " ===");
