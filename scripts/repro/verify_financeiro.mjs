// Verificação visual das 3 fatias do financeiro (Projeção, Cobrança, DRE) com dados do
// seed-demo. Login + seleção de loja + screenshot de cada tela + asserções de conteúdo.
// Pré-req: app em http://localhost:5000 (com o client Prisma das migrações de Projeção/Cobrança
// — reinicie o dev server após migrar) e `npm run db:seed:demo` rodado.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5000";
const LOJA = "loja-moscow";
const OUT = "/tmp/fin";
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(m);

const browser = await chromium.launch({ executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 1000 } })).newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", "admin@moscownoivas.local");
await page.fill("#senha", "admin123");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 }).catch(() => {});
await page.goto(`${BASE}/selecionar-loja`, { waitUntil: "networkidle" });
await page.check(`input[name="lojaId"][value="${LOJA}"]`).catch(() => {});
await page.click('button[type="submit"]').catch(() => {});
await page.waitForURL((u) => !u.pathname.endsWith("/selecionar-loja"), { timeout: 15000 }).catch(() => {});

let falhas = 0;
async function checa(nome, url, espera) {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const corpo = await page.locator("main").innerText().catch(async () => page.locator("body").innerText());
  // Marcadores do error-boundary do app (evita falso-positivo com valores em R$).
  const erro = /Algo saiu do lugar|Application error|could not be found|Unhandled Runtime/i.test(corpo);
  const arquivo = `${OUT}/${nome}.png`;
  await page.screenshot({ path: arquivo, fullPage: true });
  // innerText vem com text-transform aplicado (uppercase) → compara em minúsculas.
  const corpoLower = corpo.toLowerCase();
  const faltando = espera.filter((t) => !corpoLower.includes(t.toLowerCase()));
  const ok = !erro && faltando.length === 0;
  if (!ok) falhas++;
  log(`\n[${ok ? "OK" : "FALHOU"}] ${nome} — ${url}`);
  if (erro) log("   ⚠ página com erro de runtime");
  if (faltando.length) log(`   ⚠ faltou no conteúdo: ${JSON.stringify(faltando)}`);
  log(`   screenshot: ${arquivo}`);
}

await checa("dre", `/loja/${LOJA}/financeiro/dre`, ["Resultado do mês", "Recebimentos", "Salários"]);
await checa("cobranca", `/loja/${LOJA}/financeiro/cobranca`, ["Cobrança", "Bruna Martins", "60+ dias", "Abrir WhatsApp"]);
await checa("projecao", `/loja/${LOJA}/financeiro/projecao`, ["Projeção de caixa", "Saldo hoje", "Em atraso"]);

log(`\n=================== ${falhas === 0 ? "TUDO VERDE ✅" : `${falhas} TELA(S) COM PROBLEMA`} ===================`);
await browser.close();
process.exit(falhas === 0 ? 0 : 1);
