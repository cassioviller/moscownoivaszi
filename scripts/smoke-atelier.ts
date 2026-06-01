// scripts/smoke-atelier.ts
// Smoke autenticado da fatia Provas & Ajustes. Forja sessão de gerente e de
// costureira, cria fixture marcada em loja-moscow e exercita o fluxo. Com o app
// no ar (BASE_URL, default http://localhost:5000) valida o HTTP — incl. a
// costureira ABRINDO o detalhe da reserva (a correção de acesso). Sem app no ar,
// degrada para checagens só de dados. Limpa tudo no fim.
//
// Uso:
//   1) suba o app numa porta (ex.: porta 5000 do Replit) e então:
//      BASE_URL=http://localhost:5000 node node_modules/tsx/dist/cli.mjs scripts/smoke-atelier.ts
//   2) sem app: node node_modules/tsx/dist/cli.mjs scripts/smoke-atelier.ts
import { prisma } from "../src/lib/db";
import { tenantPrisma } from "../src/lib/tenant";
import { criarSessao, definirLojaAtiva } from "../src/lib/auth/sessao";
import { reservarVestido, vestidosLivresPara, vestidosLivresEntre } from "../src/lib/disponibilidade/reservas";
import { registrarProva, listarProvasDaReserva } from "../src/lib/atelier/provas";
import { adicionarAjuste, alternarStatusAjuste, listarAjustesPendentes } from "../src/lib/atelier/ajustes";

const LOJA = "loja-moscow";
const MARK = "SMOKE-ATELIER";
const BASE = process.env.BASE_URL ?? "http://localhost:5000";
const pass: string[] = [], fail: string[] = [];
const ck = (c: boolean, l: string) => { (c ? pass : fail).push(l); console.log(`${c ? "  ok " : "  XX "}${l}`); };

async function http(cookie: string, path: string): Promise<{ status: number; html: string } | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
    return { status: res.status, html: await res.text() };
  } catch {
    return null; // app fora do ar
  }
}

async function forjarSessao(email: string): Promise<string> {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { email } });
  const s = await criarSessao(u.id);
  await definirLojaAtiva(s.id, LOJA, u.id);
  return s.id;
}

async function main() {
  let sGerente = "";
  let sCostureira = "";
  try {
  // fixture limpa
  await prisma.lead.deleteMany({ where: { lojaId: LOJA, noivaNome: { startsWith: MARK } } });
  await prisma.vestido.deleteMany({ where: { lojaId: LOJA, codigo: { startsWith: MARK } } });

  const db = tenantPrisma(prisma, LOJA);
  const vestido = await db.vestido.create({ data: { codigo: `${MARK}-001`, nome: `${MARK} Vestido Sereia`, precoBase: "3500.00" } as never });
  const outro = await db.vestido.create({ data: { codigo: `${MARK}-OUT`, nome: `${MARK} Outro`, precoBase: "2000.00" } as never });
  const noiva = await db.lead.create({ data: { noivaNome: `${MARK} Ana`, etapa: "EM_PROVAS", casamentoData: new Date("2026-06-30T00:00:00.000Z") } as never });
  const r = await reservarVestido(LOJA, { vestidoId: vestido.id, leadId: noiva.id, casamentoData: "2026-06-30" });
  if (!r.ok) throw new Error("reserva: " + JSON.stringify(r));
  const BID = r.bloqueioId;

  sGerente = await forjarSessao("gerente@moscow.local");
  sCostureira = await forjarSessao("costureira@moscow.local");
  const ckGerente = `moscow_sessao=${sGerente}`;
  const ckCostureira = `moscow_sessao=${sCostureira}`;
  const reservaPath = `/loja/${LOJA}/reservas/${BID}`;
  const ajustesPath = `/loja/${LOJA}/ajustes`;

  console.log("\n[HTTP] (pulado se o app não responder)");
  const probe = await http("", "/login");
  if (probe) {
    const semCookie = await http("", reservaPath);
    ck(semCookie?.status === 307, `detalhe sem cookie -> 307 (foi ${semCookie?.status})`);
    const ger = await http(ckGerente, reservaPath);
    ck(ger?.status === 200 && ger.html.includes(`${MARK} Ana`), "gerente abre o detalhe (200, mostra noiva)");
    const cos = await http(ckCostureira, reservaPath);
    ck(cos?.status === 200 && cos.html.includes("Vestido Sereia"), "COSTUREIRA abre o detalhe (200) - correcao A");
    const filaCos = await http(ckCostureira, ajustesPath);
    ck(filaCos?.status === 200, `costureira abre /ajustes (200; foi ${filaCos?.status})`);
  } else {
    console.log("  -- app fora do ar; pulando HTTP (rode com BASE_URL apontando pro app) --");
  }

  console.log("\n[Fluxo] prova -> ajuste -> fila -> feito (camada real)");
  const p = await registrarProva(LOJA, { bloqueioId: BID, dataReal: "2026-06-16", tipo: "PRIMEIRA", comparecimento: "COMPARECEU" });
  ck(p.ok, "registrarProva ok");
  const provaId = p.ok ? p.provaId : "";
  const a = await adicionarAjuste(LOJA, { provaId, descricao: "Bainha 3cm" });
  ck(a.ok, "adicionarAjuste ok");
  const ajusteId = a.ok ? a.ajusteId : "";
  ck((await listarProvasDaReserva(LOJA, BID))[0]?.ajustes.length === 1, "prova lista 1 ajuste");
  ck((await listarAjustesPendentes(LOJA)).some((x) => x.id === ajusteId), "ajuste aparece na fila global");
  await alternarStatusAjuste(LOJA, ajusteId);
  ck(!(await listarAjustesPendentes(LOJA)).some((x) => x.id === ajusteId), "apos marcar feito, sai da fila");

  console.log("\n[Motor] bloco continuo + prova nao altera disponibilidade");
  ck(!(await vestidosLivresPara(LOJA, "2026-06-30")).some((v) => v.id === vestido.id), "reservado nao aparece livre em 30/06");
  ck((await vestidosLivresPara(LOJA, "2026-06-30")).some((v) => v.id === outro.id), "outro vestido aparece livre");
  ck((await vestidosLivresEntre(LOJA, "2026-06-24", [vestido.id])).length === 0, "bloqueado em 24/06 (sem buraco)");
  const antes = (await vestidosLivresEntre(LOJA, "2026-06-30", [vestido.id])).length;
  await registrarProva(LOJA, { bloqueioId: BID, dataReal: "2026-06-10", tipo: "INTERMEDIARIA", comparecimento: "COMPARECEU" });
  const depois = (await vestidosLivresEntre(LOJA, "2026-06-30", [vestido.id])).length;
  ck(antes === 0 && depois === 0, `prova nao muda disponibilidade (${antes}/${depois})`);
  } finally {
    const ids = [sGerente, sCostureira].filter(Boolean);
    if (ids.length) await prisma.sessao.deleteMany({ where: { id: { in: ids } } });
    await prisma.lead.deleteMany({ where: { lojaId: LOJA, noivaNome: { startsWith: MARK } } });
    await prisma.vestido.deleteMany({ where: { lojaId: LOJA, codigo: { startsWith: MARK } } });
  }

  console.log(`\n=== ${pass.length} ok / ${fail.length} falhas ===`);
  if (fail.length) console.log("FALHAS:\n" + fail.map((f) => " - " + f).join("\n"));
  await prisma.$disconnect();
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(2)); });
