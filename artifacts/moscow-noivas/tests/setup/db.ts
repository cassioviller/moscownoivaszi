import { Client } from "pg";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ADMIN_DATABASE_URL, TEST_DATABASE_URL, TEST_DB } from "./constants";

// schema.sql é resolvido a partir do cwd (raiz do pacote moscow-noivas).
const SCHEMA_FILE = path.join(process.cwd(), "tests", "setup", "schema.sql");

export async function ensureTestDatabase(): Promise<void> {
  // DROP/CREATE no banco de manutenção. WITH (FORCE) derruba conexões de runs anteriores.
  const admin = new Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();
  if (TEST_DB !== "heliumdb_e2e") {
    throw new Error("Trava de segurança: TEST_DB inesperado — recusando DROP.");
  }
  await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${TEST_DB}"`);
  await admin.end();

  if (!existsSync(SCHEMA_FILE)) {
    throw new Error(
      `schema.sql ausente em ${SCHEMA_FILE}. Gere com:\n` +
        `  pg_dump --schema-only --no-owner --no-privileges "$DATABASE_URL_REAL" > tests/setup/schema.sql`,
    );
  }

  const schema = readFileSync(SCHEMA_FILE, "utf8");
  const db = new Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  await db.query(schema); // node-pg roda múltiplos statements numa query sem parâmetros
  await db.end();
}
