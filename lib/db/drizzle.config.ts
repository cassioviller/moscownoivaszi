import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  // Relativo de propósito: com caminho ABSOLUTO o drizzle-kit prefixa "./" ao
  // ler o snapshot (`.//home/.../meta/0000_snapshot.json`) e o `generate`
  // morre com ENOENT — o script que o teste do E115 manda rodar quando
  // reprova. Os scripts rodam com cwd em `lib/db`.
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
