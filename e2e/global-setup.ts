import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq, and } from "drizzle-orm";
import {
  db,
  pool,
  lojasTable,
  usuariosTable,
  usuariosLojasTable,
  perfisTable,
  vestidosTable,
  leadsTable,
  cabinesTable,
  regraDisponibilidadeTable,
  orcamentosTable,
  orcamentoItensTable,
  contratosTable,
} from "../lib/db/src/index";

/**
 * Setup de dados E2E — idempotente (IDs fixos "e2e-*"; roda quantas vezes
 * for preciso sem duplicar). Se o banco estiver virgem (sem admin), roda o
 * seed oficial primeiro. Os IDs criados vão para e2e/.state.json, lido
 * pelos specs.
 */

const ADMIN_EMAIL = "admin@moscownoivas.com";
const MARIA_EMAIL = "maria@moscownoivas.com";
const SENHA = "admin123";

async function garantir<T>(atual: T | undefined, criar: () => Promise<unknown>): Promise<void> {
  if (!atual) await criar();
}

export default async function globalSetup() {
  // 0. Banco virgem? Roda o seed oficial do repositório.
  let [admin] = await db.select().from(usuariosTable).where(eq(usuariosTable.email, ADMIN_EMAIL));
  if (!admin) {
    console.log("[e2e-setup] banco sem admin — rodando o seed oficial…");
    execSync("pnpm --filter @workspace/api-server exec tsx src/scripts/seed.ts", {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
    });
    [admin] = await db.select().from(usuariosTable).where(eq(usuariosTable.email, ADMIN_EMAIL));
    if (!admin) throw new Error("[e2e-setup] seed não criou o admin");
  }

  const [loja] = await db.select().from(lojasTable).limit(1);
  if (!loja) throw new Error("[e2e-setup] nenhuma loja no banco");

  const [maria] = await db.select().from(usuariosTable).where(eq(usuariosTable.email, MARIA_EMAIL));
  if (!maria) throw new Error("[e2e-setup] vendedora maria não existe");

  // 1. Vínculo da vendedora à loja (o seed original não cria — bug C12).
  const [perfilVendedora] = await db.select().from(perfisTable).where(eq(perfisTable.nome, "Vendedora"));
  const [vinculo] = await db.select().from(usuariosLojasTable)
    .where(and(eq(usuariosLojasTable.usuarioId, maria.id), eq(usuariosLojasTable.lojaId, loja.id)));
  await garantir(vinculo, () =>
    db.insert(usuariosLojasTable).values({
      usuarioId: maria.id,
      lojaId: loja.id,
      perfilId: perfilVendedora?.id ?? "perfil-vendedora",
    }),
  );

  // 2. Entidades E2E com IDs fixos.
  const [vestido] = await db.select().from(vestidosTable).where(eq(vestidosTable.id, "e2e-vestido-1"));
  await garantir(vestido, () =>
    db.insert(vestidosTable).values({
      id: "e2e-vestido-1",
      lojaId: loja.id,
      codigo: "E2E-V900",
      nome: "E2E Vestido Playwright",
      precoBase: 4200,
      tamanho: "38",
      cor: "Marfim",
      categoria: "Princesa",
    }),
  );

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, "e2e-lead-1"));
  await garantir(lead, () =>
    db.insert(leadsTable).values({
      id: "e2e-lead-1",
      lojaId: loja.id,
      noivaNome: "E2E Noiva Playwright",
      whatsapp: "(11) 90000-0000",
      origem: "LOJA",
    }),
  );

  const [cabine] = await db.select().from(cabinesTable).where(eq(cabinesTable.id, "e2e-cabine-1"));
  await garantir(cabine, () =>
    db.insert(cabinesTable).values({ id: "e2e-cabine-1", lojaId: loja.id, nome: "E2E Cabine" }),
  );

  // Regra de disponibilidade da loja (upsert — unique por loja).
  await db.insert(regraDisponibilidadeTable)
    .values({ id: "e2e-regra-disp", lojaId: loja.id, provaDiasAntes: 14, usoDiasAntes: 3, usoDiasDepois: 2, lavagemDiasDepois: 7 })
    .onConflictDoNothing();

  // Orçamento com item — alvo do teste de detalhe.
  const [orcamento] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, "e2e-orcamento-1"));
  await garantir(orcamento, async () => {
    await db.insert(orcamentosTable).values({
      id: "e2e-orcamento-1",
      lojaId: loja.id,
      leadId: "e2e-lead-1",
      vendedoraId: admin.id,
      status: "RASCUNHO",
    });
    await db.insert(orcamentoItensTable).values({
      id: "e2e-orcitem-1",
      lojaId: loja.id,
      orcamentoId: "e2e-orcamento-1",
      tipo: "VESTIDO",
      descricao: "E2E Item Vestido",
      valorUnitario: 4200,
      quantidade: 1,
    });
  });

  const [contrato] = await db.select().from(contratosTable).where(eq(contratosTable.lojaId, loja.id)).limit(1);

  // 3. Estado compartilhado com os specs.
  const state = {
    lojaId: loja.id,
    lojaNome: loja.nome,
    adminEmail: ADMIN_EMAIL,
    mariaEmail: MARIA_EMAIL,
    senha: SENHA,
    vestidoId: "e2e-vestido-1",
    leadId: "e2e-lead-1",
    orcamentoId: "e2e-orcamento-1",
    contratoId: contrato?.id ?? null,
    cabineId: "e2e-cabine-1",
  };
  mkdirSync(path.join(__dirname, ".auth"), { recursive: true });
  writeFileSync(path.join(__dirname, ".state.json"), JSON.stringify(state, null, 2));
  console.log("[e2e-setup] dados prontos:", JSON.stringify({ loja: loja.nome, contrato: !!contrato }));

  await pool.end();
}
