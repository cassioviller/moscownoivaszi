import { execFileSync } from "node:child_process";
import path from "node:path";

// As operações de banco rodam num subprocess `tsx` (scripts/e2e-db.ts), não aqui:
// o client Prisma gerado é CommonJS e o loader do Playwright o trata como ESM, então
// importá-lo direto de dentro do Playwright quebra. Ver o cabeçalho de scripts/e2e-db.ts.
const TSX_CLI = path.join(process.cwd(), "node_modules/tsx/dist/cli.mjs");
const SCRIPT = path.join(process.cwd(), "scripts/e2e-db.ts");

function e2eDb(cmd: string, args: string[] = [], capture = false): string {
  const out = execFileSync(process.execPath, [TSX_CLI, SCRIPT, cmd, ...args], {
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
  return (out ?? "").trim();
}

/** Cria a loja efêmera + admin + pré-requisitos do agendamento. Idempotente. */
export function prepararLojaE2E(): void {
  e2eDb("setup");
}

/** Apaga tudo que o setup criou. Cascade da Loja leva o dado de tenant. */
export function limparLojaE2E(): void {
  e2eDb("teardown");
}

/** Pré-condição de spec: cria uma noiva na loja e2e, retorna o leadId. */
export function criarNoivaE2E(noivaNome: string): string {
  return e2eDb("criar-noiva", [noivaNome], true);
}
