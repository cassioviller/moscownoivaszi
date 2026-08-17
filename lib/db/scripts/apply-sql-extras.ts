/**
 * Extras de SQL que o drizzle-kit push não gerencia (extensões, CHECK e
 * EXCLUDE constraints). Idempotente — roda após todo `push`.
 *
 * Uso: tsx scripts/apply-sql-extras.ts (encadeado no script npm "push").
 *
 * **E270 — e também `import`, porque a produção não tem tsx.** No contêiner
 * quem aplica o schema é `dist/migrar.mjs`, um pacote de esbuild: ele importa
 * `aplicarExtras` por `@workspace/db/sql-extras` e a chama depois do migrador
 * do drizzle. O `main()` de linha de comando fica, e é o mesmo corpo — senão as
 * duas formas de provisionar um banco divergiriam sem ninguém ver.
 */
import { pool } from "../src/index";

export async function aplicarExtras(): Promise<void> {
  // 1. btree_gist: necessário para EXCLUDE USING gist com igualdade em text.
  await pool.query(`CREATE EXTENSION IF NOT EXISTS btree_gist;`);

  // 2. CHECK: RESERVA_CASAMENTO exige casamento_data.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'bloqueio_vestidos_reserva_exige_casamento_data'
          AND conrelid = 'bloqueio_vestidos'::regclass
      ) THEN
        ALTER TABLE bloqueio_vestidos
          ADD CONSTRAINT bloqueio_vestidos_reserva_exige_casamento_data
          CHECK (tipo <> 'RESERVA_CASAMENTO' OR casamento_data IS NOT NULL);
      END IF;
    END
    $$;
  `);

  // 3. EXCLUDE: dois bloqueios ativos do mesmo vestido não podem sobrepor o
  //    envelope físico. ocupacao_fim null = range aberto (retirada sem
  //    devolução conflita com tudo à frente).
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'bloqueio_vestidos_sem_sobreposicao'
          AND conrelid = 'bloqueio_vestidos'::regclass
      ) THEN
        ALTER TABLE bloqueio_vestidos
          ADD CONSTRAINT bloqueio_vestidos_sem_sobreposicao
          EXCLUDE USING gist (
            vestido_id WITH =,
            daterange(ocupacao_inicio, ocupacao_fim, '[]') WITH &&
          )
          WHERE (ocupacao_inicio IS NOT NULL AND cancelado_em IS NULL);
      END IF;
    END
    $$;
  `);

  // 4. pg_trgm + índices da busca server-side de leads (E7): ILIKE em nomes
  //    e LIKE sobre o whatsapp normalizado — a MESMA expressão da rota, senão
  //    o índice não é usado.
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS leads_noiva_nome_trgm_idx
      ON leads USING gin (noiva_nome gin_trgm_ops);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS leads_noivo_nome_trgm_idx
      ON leads USING gin (noivo_nome gin_trgm_ops);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS leads_whatsapp_digitos_trgm_idx
      ON leads USING gin (regexp_replace(coalesce(whatsapp, ''), '\\D', '', 'g') gin_trgm_ops);
  `);

  console.log("[apply-sql-extras] extensões btree_gist/pg_trgm + constraints + índices aplicados");
}

/**
 * **A linha de comando só roda quando ELA é o comando.**
 *
 * `import.meta.url === argv[1]` seria a forma idiomática e aqui ela MENTIRIA:
 * o esbuild reescreve `import.meta.url` para a URL do PACOTE, e dentro de
 * `dist/migrar.mjs` os dois lados passariam a ser o mesmo arquivo — o migrador
 * chamaria este `main()` no `import`, fecharia o pool com o `finally` e o
 * `migrate` seguinte morreria com o banco já desligado. O nome do arquivo em
 * `argv[1]` sobrevive ao empacotamento porque não é reescrito por ninguém.
 */
if (process.argv[1]?.endsWith("apply-sql-extras.ts")) {
  aplicarExtras()
    .catch((err) => {
      console.error("[apply-sql-extras] falhou:", err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
