/**
 * **E270 — o schema de uma instalação NOVA, aplicado sem tsx e sem drizzle-kit.**
 *
 * O repositório tem dois caminhos para pôr o schema num banco, e os dois são de
 * quem desenvolve: `pnpm --filter @workspace/db run push` (o do dia a dia, o que
 * a régua do banco virgem exercita) e `… run migrate` (o versionado, guardado
 * pela sonda do E115 — ela compara o schema VIVO com o último snapshot de
 * `lib/db/migrations/meta`, e é o que impede a baseline de apodrecer em
 * silêncio). Os dois pedem `drizzle-kit` e `tsx`, que são dependências de
 * desenvolvimento e não existem na imagem de produção.
 *
 * Este script é o terceiro caminho, e é o do contêiner: o migrador do próprio
 * drizzle-orm — o mesmo `lib/db/migrations` que o `migrate` aplica, lido do
 * disco em tempo de execução —, seguido dos extras de SQL que o drizzle não
 * gerencia (`@workspace/db/sql-extras`, o MESMO corpo que o `push` encadeia).
 *
 * **Ele não destrói nada, e isso não é promessa: é o mecanismo.** O migrador
 * grava o que aplicou em `drizzle.__drizzle_migrations` e só executa o que
 * falta — rodar duas vezes é rodar uma. Não há `drop`, não há `--force`, não há
 * ramo que apague. Um deploy que suba sem migração nova não toca o banco.
 *
 * **Ele NÃO serve para adotar um banco que nasceu de `push`** (o de
 * desenvolvimento, por exemplo): ali as tabelas já existem sem a linha do
 * jornal, e o migrador tentaria criar tudo de novo. Para a instalação nova —
 * que é o caso do EasyPanel — ele é o caminho inteiro.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@workspace/db";
import { aplicarExtras } from "@workspace/db/sql-extras";

/**
 * A pasta das migrações versionadas. No contêiner ela é copiada para junto do
 * pacote e o caminho vem por `MIGRACOES_DIR`; fora dele, o default aponta para
 * `lib/db/migrations` a partir de `dist/`, que é onde este arquivo roda.
 */
function pastaDasMigracoes(): string {
  const declarada = process.env.MIGRACOES_DIR;
  if (declarada) return declarada;
  return path.resolve(import.meta.dirname, "..", "..", "..", "lib", "db", "migrations");
}

async function main(): Promise<void> {
  const pasta = pastaDasMigracoes();

  // Pasta errada é o defeito mudo desta rotina: o migrador de uma pasta vazia
  // termina VERDE, e o servidor sobe contra um banco sem tabela nenhuma para
  // morrer no primeiro login. O jornal é o arquivo que o `drizzle-kit generate`
  // mantém, e sem ele não há migração para aplicar.
  const jornal = path.join(pasta, "meta", "_journal.json");
  if (!existsSync(jornal)) {
    throw new Error(
      `Não há migrações em "${pasta}" (falta ${jornal}). ` +
        "Aponte MIGRACOES_DIR para a pasta `lib/db/migrations` da imagem.",
    );
  }

  console.log(`[migrar] aplicando as migrações pendentes de ${pasta}`);
  await migrate(db, { migrationsFolder: pasta });
  console.log("[migrar] migrações em dia");

  await aplicarExtras();
  console.log("[migrar] pronto");
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[migrar] falhou:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
