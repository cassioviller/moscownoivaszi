// Constantes do stack de teste E2E. Importadas pelo playwright.config e pelo setup.
const PG = {
  host: process.env.PGHOST || "helium",
  port: process.env.PGPORT || "5432",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "password",
};

export const TEST_DB = "heliumdb_e2e";
export const VITE_PORT = 5175;
export const API_PORT = 8090;
export const BASE_URL = `http://localhost:${VITE_PORT}`;
export const API_HEALTH_URL = `http://localhost:${API_PORT}/api/healthz`;

// Banco de manutenção (para DROP/CREATE) e o banco de teste em si.
export const ADMIN_DATABASE_URL = `postgresql://${PG.user}:${PG.password}@${PG.host}:${PG.port}/postgres`;
export const TEST_DATABASE_URL = `postgresql://${PG.user}:${PG.password}@${PG.host}:${PG.port}/${TEST_DB}`;

export const SENHA = "teste123";
export const LOJA_A = "loja-a";
export const LOJA_B = "loja-b";
