import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5000";
const LOJA = "loja-moscow";
const OUT = "/tmp/c6";
mkdirSync(OUT, { recursive: true });

const findings = [];
const note = (m) => { console.log(m); findings.push(m); };

// bordô ~ oklch(38% .08 25) → rgb ≈ (122,40,55); aceita variações de contorno/sólido
const ehBordo = (c) => {
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return false;
  const [r, g, b] = [+m[1], +m[2], +m[3]];
  return r > 80 && r < 170 && g < 70 && b > 25 && b < 95;
};

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
try { await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 }); }
catch { note(`login NÃO redirecionou (${page.url()})`); }
await page.waitForLoadState("networkidle");

// 1b) Selecionar loja
await page.goto(`${BASE}/selecionar-loja`, { waitUntil: "networkidle" });
await page.check(`input[name="lojaId"][value="${LOJA}"]`);
await page.click('button[type="submit"]');
try { await page.waitForURL((u) => !u.pathname.endsWith("/selecionar-loja"), { timeout: 15000 }); }
catch { note(`seleção de loja NÃO redirecionou (${page.url()})`); }
await page.waitForLoadState("networkidle");
note(`pós-seleção URL: ${page.url()}`);

const TELAS = [
  { slug: "fluxo", path: `/loja/${LOJA}/financeiro` },
  { slug: "receber", path: `/loja/${LOJA}/financeiro/receber?filtro=todas` },
  { slug: "pagar", path: `/loja/${LOJA}/financeiro/pagar?filtro=todas` },
  { slug: "folha", path: `/loja/${LOJA}/financeiro/pagar/folha` },
  { slug: "comissoes", path: `/loja/${LOJA}/financeiro/comissoes` },
  { slug: "regras", path: `/loja/${LOJA}/financeiro/comissoes/regras` },
];

for (const t of TELAS) {
  await page.goto(`${BASE}${t.path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${t.slug}-desktop.png`, fullPage: true });

  const info = await page.evaluate((ehBordoStr) => {
    const ehBordo = eval(`(${ehBordoStr})`);
    const h1 = document.querySelector("h1");
    const ff = h1 ? getComputedStyle(h1).fontFamily : null;
    // botões sólidos bordô (fundo bordô) vs contorno (texto/borda bordô, fundo claro)
    const botoes = [...document.querySelectorAll("main button, main a[class]")];
    let solidos = 0, contornos = 0;
    for (const b of botoes) {
      const s = getComputedStyle(b);
      const bgBordo = ehBordo(s.backgroundColor);
      const fgBordo = ehBordo(s.color);
      const txt = (b.textContent || "").trim();
      if (!txt) continue;
      if (bgBordo) solidos++;
      else if (fgBordo && /Receber|Pagar|Salvar|Lançar|Gerar|Confirmar|Definir/.test(txt)) contornos++;
    }
    // Aviso (role=status) presente?
    const aviso = document.querySelector('main [role="status"]');
    return {
      h1: h1?.textContent?.trim(),
      serif: ff?.includes("Playfair") || ff?.includes("serif") ? "serif" : ff,
      botoesSolidosBordo: solidos,
      botoesContornoBordo: contornos,
      temAviso: !!aviso,
    };
  }, ehBordo.toString());
  note(`[${t.slug}] ${JSON.stringify(info)}`);

  // 375px overflow
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  await page.screenshot({ path: `${OUT}/${t.slug}-375.png`, fullPage: true });
  note(`[${t.slug}] 375px overflow: ${overflow ? "SIM (ruim)" : "não"}`);
  await page.setViewportSize({ width: 1366, height: 900 });
}

await browser.close();
console.log("\n=== SCREENSHOTS em " + OUT + " ===");
