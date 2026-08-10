import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * DATABASE_URL é o ÚNICO nome que esta biblioteca lê, e isso é invariante.
 *
 * Já houve um segundo (`APP_DATABASE_URL`, com precedência — f0a17d0), e ele
 * durou um commit: banco-virgem, seed e as suítes redirecionam processos
 * FILHOS trocando DATABASE_URL, e com a precedência a troca virava ruído —
 * medido: o filho pedia /heliumdb e o pool conectava em /moscow_base. É a
 * S-M15 uma camada acima. Quem precisa apontar o APP para outro banco usa
 * `APP_DATABASE_NAME` no comando de dev do api-server, que DERIVA a URL e a
 * entrega aqui pelo nome de sempre.
 */
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
