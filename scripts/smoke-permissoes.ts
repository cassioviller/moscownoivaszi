// scripts/smoke-permissoes.ts
// Smoke da central de permissões contra o banco de dev.
// Uso: node node_modules/tsx/dist/cli.mjs scripts/smoke-permissoes.ts [--cleanup]
import { prisma } from "../src/lib/db";
import { podeNoModulo } from "../src/lib/permissoes/modulos";
import { salvarOverride, removerOverride, listarOverridesDaLoja } from "../src/lib/permissoes/perfis";

const LOJA = "loja-moscow";
const OUTRA = "loja-teste-2";
const PERFIL = "perfil-vendedora";
const VEND = "user-vendedora-pzv";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  const cleanupOnly = process.argv.includes("--cleanup");
  if (cleanupOnly) {
    await removerOverride(LOJA, PERFIL);
    console.log("cleanup: override removido");
    await prisma.$disconnect();
    return;
  }

  // Baseline: sem override, vendedora segue o template (não cria vestido).
  assert((await podeNoModulo(VEND, LOJA, "vestidos", "criar")) === false, "baseline: vendedora NÃO cria (template)");

  // Liga override: vestidos.criar nesta loja.
  await salvarOverride(LOJA, PERFIL, {
    leads: { ver: true, criar: true, editar: true },
    interesses: { ver: true, criar: true, editar: true },
    vestidos: { ver: true, criar: true, editar: false },
    config: { ver: false, criar: false, editar: false },
  });
  assert((await podeNoModulo(VEND, LOJA, "vestidos", "criar")) === true, "override: vendedora PASSA a criar nesta loja");
  assert((await podeNoModulo(VEND, LOJA, "vestidos", "editar")) === false, "override: editar permanece negado");

  // Isolamento: a outra loja não enxerga o override.
  const outra = await listarOverridesDaLoja(OUTRA);
  assert(!outra.has(PERFIL), "isolamento: outra loja NÃO vê o override");

  // Restaurar padrão: volta ao template.
  await removerOverride(LOJA, PERFIL);
  assert((await podeNoModulo(VEND, LOJA, "vestidos", "criar")) === false, "restaurar: vendedora volta a NÃO criar");

  console.log("SMOKE OK");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
