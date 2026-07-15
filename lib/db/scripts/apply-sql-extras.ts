/**
 * Extras de SQL que o drizzle-kit push não gerencia (extensões, CHECK e
 * EXCLUDE constraints). Idempotente — roda após todo `push`.
 *
 * Uso: tsx scripts/apply-sql-extras.ts (encadeado no script npm "push").
 */
import { pool } from "../src/index";

async function main(): Promise<void> {
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

  console.log("[apply-sql-extras] extensão btree_gist + constraints aplicadas");
}

main()
  .catch((err) => {
    console.error("[apply-sql-extras] falhou:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
