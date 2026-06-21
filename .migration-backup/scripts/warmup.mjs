// scripts/warmup.mjs
// Pré-aquece as rotas do dev server (Next 16 / Turbopack compila cada rota só na 1ª
// visita — 5–10s). Visitando-as no startup, o compile sai do seu clique: você abre a
// tela e ela já está pronta. Não toca em HMR; é só uma sequência de GETs.
//
// Como o gate de auth (exigirAcesso/gateSessaoLojaAtiva) roda DENTRO dos Server
// Components — não há middleware —, o segmento da rota compila ANTES do redirect.
// Logo, o aquecimento NÃO precisa de sessão nem de um lojaId real: o compile é por
// padrão de rota, não por valor de parâmetro. Use um placeholder em [lojaId] etc.
//
// Opcionais via env:
//   WARMUP_URL       base do dev server (default http://localhost:3000 / $PORT)
//   WARMUP_LOJA_ID   valor para os segmentos dinâmicos (default "warmup")
//   WARMUP_COOKIE    cookie de sessão, se quiser aquecer já autenticado
//   WARMUP_CONCURRENCY  nº de requisições simultâneas (default 3)

const PORT = process.env.PORT || "3000";
const BASE = (process.env.WARMUP_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const LOJA = process.env.WARMUP_LOJA_ID || "warmup";
const COOKIE = process.env.WARMUP_COOKIE || "";
const CONCURRENCY = Math.max(1, Number(process.env.WARMUP_CONCURRENCY) || 3);

// Um id placeholder para qualquer 2º segmento dinâmico ([leadId], [vestidoId]…).
const ID = "warmup";

// Rotas representativas — uma por subárvore de segmentos (o que define o custo de
// compile). Não precisa ser exaustivo: segmentos irmãos rasos reaproveitam muito.
const ROTAS = [
  "/",
  "/login",
  "/selecionar-loja",
  "/admin",
  "/admin/perfis",
  "/equipe",
  `/loja/${LOJA}`,
  `/loja/${LOJA}/noivas`,
  `/loja/${LOJA}/noivas/nova`,
  `/loja/${LOJA}/noivas/${ID}`,
  `/loja/${LOJA}/noivas/${ID}/editar`,
  `/loja/${LOJA}/noivas/${ID}/interesses`,
  `/loja/${LOJA}/vestidos`,
  `/loja/${LOJA}/vestidos/novo`,
  `/loja/${LOJA}/vestidos/${ID}`,
  `/loja/${LOJA}/vestidos/${ID}/editar`,
  `/loja/${LOJA}/calendario`,
  `/loja/${LOJA}/agenda`,
  `/loja/${LOJA}/atendimentos`,
  `/loja/${LOJA}/atendimentos/novo`,
  `/loja/${LOJA}/atendimentos/config`,
  `/loja/${LOJA}/provas`,
  `/loja/${LOJA}/ajustes`,
  `/loja/${LOJA}/reservas`,
  `/loja/${LOJA}/reservas/${ID}`,
  `/loja/${LOJA}/contratos`,
  `/loja/${LOJA}/contratos/novo`,
  `/loja/${LOJA}/contratos/${ID}`,
  `/loja/${LOJA}/orcamentos`,
  `/loja/${LOJA}/orcamentos/${ID}`,
  `/loja/${LOJA}/catalogo`,
  `/loja/${LOJA}/catalogo/novo`,
  `/loja/${LOJA}/catalogo/${ID}/editar`,
  `/loja/${LOJA}/financeiro`,
  `/loja/${LOJA}/financeiro/receber`,
  `/loja/${LOJA}/financeiro/pagar`,
  `/loja/${LOJA}/financeiro/pagar/folha`,
  `/loja/${LOJA}/financeiro/comissoes`,
  `/loja/${LOJA}/financeiro/comissoes/regras`,
  `/loja/${LOJA}/permissoes`,
];

const headers = COOKIE ? { cookie: COOKIE } : undefined;
const ms = () => Number(process.hrtime.bigint() / 1_000_000n);

async function esperarServidor(timeoutMs = 90_000) {
  const inicio = ms();
  while (ms() - inicio < timeoutMs) {
    try {
      // redirect:manual — qualquer resposta (200/3xx/4xx) significa "de pé".
      await fetch(BASE + "/", { redirect: "manual", headers });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

async function aquecer(rota) {
  const t0 = ms();
  try {
    const res = await fetch(BASE + rota, { redirect: "manual", headers });
    console.log(`[warmup] ${String(res.status).padEnd(3)} ${String(ms() - t0).padStart(6)}ms  ${rota}`);
  } catch (e) {
    console.log(`[warmup] ERR ${String(ms() - t0).padStart(6)}ms  ${rota}  (${e?.cause?.code || e?.message || e})`);
  }
}

// Pool simples de concorrência (sem deps).
async function emPool(itens, n, fn) {
  let i = 0;
  const trabalhadores = Array.from({ length: n }, async () => {
    while (i < itens.length) {
      const idx = i++;
      await fn(itens[idx]);
    }
  });
  await Promise.all(trabalhadores);
}

const inicio = ms();
console.log(`[warmup] aguardando ${BASE} …`);
if (!(await esperarServidor())) {
  console.log("[warmup] servidor não respondeu a tempo — abortando (dev segue normal).");
  process.exit(0);
}
console.log(`[warmup] de pé em ${ms() - inicio}ms · aquecendo ${ROTAS.length} rotas (conc. ${CONCURRENCY})${COOKIE ? " · autenticado" : ""}`);
await emPool(ROTAS, CONCURRENCY, aquecer);
console.log(`[warmup] pronto em ${ms() - inicio}ms — as rotas já estão compiladas.`);
