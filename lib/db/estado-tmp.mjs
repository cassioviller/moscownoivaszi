import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const { rows } = await c.query(`
  SELECT relname AS tabela, n_live_tup AS linhas
  FROM pg_stat_user_tables ORDER BY n_live_tup DESC, relname
`);
const total = rows.reduce((s, r) => s + Number(r.linhas), 0);
console.log(rows.map(r => `${String(r.linhas).padStart(6)}  ${r.tabela}`).join("\n"));
console.log(`\nTOTAL ${total} linhas em ${rows.length} tabelas`);
const lojas = await c.query(`SELECT id, nome, created_at FROM lojas ORDER BY created_at`);
console.log("\nLOJAS:"); lojas.rows.forEach(l => console.log(` ${l.created_at.toISOString().slice(0,10)}  ${l.nome}  (${l.id})`));
await c.end();
