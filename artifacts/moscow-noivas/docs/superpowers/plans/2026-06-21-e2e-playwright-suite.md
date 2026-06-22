# Suíte E2E Playwright (Moscow Noivas) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir uma suíte E2E em browser real (Playwright) que cobre todas as ~19 páginas da SPA, com fluxos, permissões e isolamento entre lojas, contra um banco de teste dedicado.

**Architecture:** Stack isolada — Vite TEST (:5175) → proxy `/api` → api-server TEST (:8090) → Postgres `heliumdb_e2e`. Playwright sobe os dois via `webServer`, semeia o banco e autentica cada papel via `storageState` num projeto `setup`. O banco real `heliumdb` nunca é tocado.

**Tech Stack:** `@playwright/test`, `pg`, `bcryptjs`, Vite, Express (api-server existente), PostgreSQL 16.

**Diretório de trabalho:** todos os caminhos são relativos a `artifacts/moscow-noivas/` salvo indicação. Commitar direto na `main` (convenção do projeto).

---

## Estrutura de arquivos

```
artifacts/moscow-noivas/
  vite.config.ts                 # MODIFICAR: proxy via env API_PROXY_TARGET
  package.json                   # MODIFICAR: devDeps + scripts test:e2e
  .gitignore                     # MODIFICAR: ignorar artefatos e .auth
  playwright.config.ts           # CRIAR
  tests/
    setup/
      constants.ts               # CRIAR: portas, URLs, IDs
      db.ts                      # CRIAR: cria/recria heliumdb_e2e + carrega schema
      seed-e2e.ts                # CRIAR: INSERTs determinísticos
      schema.sql                 # GERAR (pg_dump --schema-only) e commitar
    global.setup.ts              # CRIAR: projeto 'setup' (db + storageState)
    .auth/                       # gerado em runtime (gitignored)
    auth.spec.ts                 # CRIAR
    smoke.spec.ts                # CRIAR
    admin.spec.ts                # CRIAR
    permissoes.spec.ts           # CRIAR
    isolamento.spec.ts           # CRIAR
    loja-fluxos.spec.ts          # CRIAR
    README.md                    # CRIAR
```

---

## Task 1: Dependências + parametrizar proxy do Vite

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts:69-74`
- Modify: `.gitignore`

- [ ] **Step 1: Instalar dependências de teste**

Run (de dentro de `artifacts/moscow-noivas`):
```bash
pnpm add -D @playwright/test pg bcryptjs @types/pg
```
Expected: instala sem erro; `@playwright/test` aparece em `devDependencies`.

- [ ] **Step 2: Baixar o Chromium do Playwright**

Run:
```bash
pnpm exec playwright install chromium
```
Expected: baixa o Chromium para `~/.cache/ms-playwright` (FORA do nix store). **Se falhar com erro de FUSE/transport**, pare e reporte: a suíte ficará pronta para rodar no Replit; siga as demais tasks mesmo assim.

- [ ] **Step 3: Parametrizar o alvo do proxy no `vite.config.ts`**

Substituir o bloco `proxy` (linhas ~69-74):
```ts
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:8080",
        changeOrigin: true,
      },
    },
```
Comportamento de dev é idêntico (default `:8080`); o stack de teste passa `:8090`.

- [ ] **Step 4: Adicionar scripts em `package.json`**

No bloco `"scripts"`, adicionar:
```json
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 5: Ignorar artefatos no `.gitignore`**

Acrescentar ao final:
```
# Playwright E2E
/test-results/
/playwright-report/
/tests/.auth/
```

- [ ] **Step 6: Commit**
```bash
git add package.json pnpm-lock.yaml vite.config.ts .gitignore
git commit -m "test(e2e): adiciona Playwright e parametriza proxy do Vite"
```

---

## Task 2: Gerar e commitar o schema do banco de teste

**Files:**
- Create: `tests/setup/schema.sql`

- [ ] **Step 1: Gerar o schema a partir do banco real (somente schema, sem dados)**

Run (ajuste a URL se necessário; usa as envs PG do ambiente):
```bash
mkdir -p tests/setup
pg_dump --schema-only --no-owner --no-privileges \
  "postgresql://${PGUSER:-postgres}:${PGPASSWORD:-password}@${PGHOST:-helium}:${PGPORT:-5432}/${PGDATABASE:-heliumdb}" \
  > tests/setup/schema.sql
```
Expected: `tests/setup/schema.sql` com `CREATE TYPE ... AS ENUM`, `CREATE TABLE "Usuario" ...` etc. **Não deve conter** `CREATE DATABASE` nem `\connect`.

- [ ] **Step 2: Sanidade do dump**

Run:
```bash
grep -c 'CREATE TABLE' tests/setup/schema.sql
grep -E '\\connect|CREATE DATABASE' tests/setup/schema.sql || echo "ok: sem connect/createdb"
```
Expected: contagem de tabelas ≥ 30; segunda linha imprime "ok: sem connect/createdb". Se aparecer `\connect`, remova essas linhas (node-pg não as entende).

- [ ] **Step 3: Commit**
```bash
git add -f tests/setup/schema.sql
git commit -m "test(e2e): schema.sql do banco de teste (pg_dump --schema-only)"
```

---

## Task 3: Constantes compartilhadas

**Files:**
- Create: `tests/setup/constants.ts`

- [ ] **Step 1: Criar `tests/setup/constants.ts`**

```ts
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
```

- [ ] **Step 2: Commit**
```bash
git add tests/setup/constants.ts
git commit -m "test(e2e): constantes do stack de teste"
```

---

## Task 4: Criação/recriação do banco + carga do schema

**Files:**
- Create: `tests/setup/db.ts`

- [ ] **Step 1: Criar `tests/setup/db.ts`**

```ts
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
```

- [ ] **Step 2: Commit**
```bash
git add tests/setup/db.ts
git commit -m "test(e2e): recria heliumdb_e2e e carrega o schema"
```

---

## Task 5: Seed determinístico

**Files:**
- Create: `tests/setup/seed-e2e.ts`

- [ ] **Step 1: Criar `tests/setup/seed-e2e.ts`**

```ts
import { Client } from "pg";
import bcrypt from "bcryptjs";
import { TEST_DATABASE_URL, SENHA, LOJA_A, LOJA_B } from "./constants";

// Mesmo formato de acessosModulos do seed de produção (api-server/src/routes/seed.ts).
const ACESSOS = {
  admin: { leads: { ver: true, criar: true, editar: true }, interesses: { ver: true, criar: true, editar: true }, vestidos: { ver: true, criar: true, editar: true }, ajustes: { ver: true, criar: true, editar: true }, config: { ver: true, criar: true, editar: true }, financeiro: { ver: true, criar: true, editar: true } },
  vendedora: { leads: { ver: true, criar: true, editar: true }, interesses: { ver: true, criar: true, editar: true }, vestidos: { ver: true, criar: false, editar: false }, ajustes: { ver: false, criar: false, editar: false }, config: { ver: false, criar: false, editar: false }, financeiro: { ver: false, criar: false, editar: false } },
  recepcao: { leads: { ver: true, criar: true, editar: false }, interesses: { ver: true, criar: false, editar: false }, vestidos: { ver: true, criar: false, editar: false }, ajustes: { ver: false, criar: false, editar: false }, config: { ver: false, criar: false, editar: false }, financeiro: { ver: false, criar: false, editar: false } },
};

export async function seed(): Promise<void> {
  const hash = await bcrypt.hash(SENHA, 12);
  const db = new Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  try {
    // Perfis
    for (const [id, nome, acessos] of [
      ["perfil-admin", "Admin", ACESSOS.admin],
      ["perfil-vendedora", "Vendedora", ACESSOS.vendedora],
      ["perfil-recepcao", "Recepção", ACESSOS.recepcao],
    ] as const) {
      await db.query(
        `INSERT INTO "Perfil" (id, nome, "acessosModulos", "updatedAt") VALUES ($1, $2, $3, NOW())`,
        [id, nome, JSON.stringify(acessos)],
      );
    }

    // Lojas
    await db.query(
      `INSERT INTO "Loja" (id, nome, ativo, "updatedAt") VALUES ($1, 'Atelier SP', true, NOW()), ($2, 'Atelier RJ', true, NOW())`,
      [LOJA_A, LOJA_B],
    );

    // Usuários (senha única; super sem vínculo de loja)
    const usuarios: Array<[string, string, string, boolean]> = [
      ["e2e-super", "Super E2E", "super@e2e.test", true],
      ["e2e-admin-a", "Admin A", "admin-a@e2e.test", false],
      ["e2e-vend-a", "Vendedora A", "vend-a@e2e.test", false],
      ["e2e-recep-a", "Recepção A", "recep-a@e2e.test", false],
      ["e2e-admin-b", "Admin B", "admin-b@e2e.test", false],
    ];
    for (const [id, nome, email, isSuper] of usuarios) {
      await db.query(
        `INSERT INTO "Usuario" (id, nome, email, "senhaHash", ativo, "isSuperAdmin", "updatedAt")
         VALUES ($1, $2, $3, $4, true, $5, NOW())`,
        [id, nome, email, hash, isSuper],
      );
    }

    // Vínculos usuário-loja-perfil
    const vinculos: Array<[string, string, string]> = [
      ["e2e-admin-a", LOJA_A, "perfil-admin"],
      ["e2e-vend-a", LOJA_A, "perfil-vendedora"],
      ["e2e-recep-a", LOJA_A, "perfil-recepcao"],
      ["e2e-admin-b", LOJA_B, "perfil-admin"],
    ];
    for (const v of vinculos) {
      await db.query(
        `INSERT INTO "UsuarioLoja" ("usuarioId", "lojaId", "perfilId") VALUES ($1, $2, $3)`,
        v,
      );
    }

    // Vestidos (loja-a)
    await db.query(
      `INSERT INTO "Vestido" (id, "lojaId", codigo, nome, "precoBase", status, "updatedAt") VALUES
        ('e2e-vest-1', $1, 'VEST-001', 'Vestido Sereia', 4500, 'ativo', NOW()),
        ('e2e-vest-2', $1, 'VEST-002', 'Vestido Princesa', 6200, 'ativo', NOW())`,
      [LOJA_A],
    );

    // Leads/noivas (loja-a) — "Ana Isolamento" é o marcador do teste de isolamento
    await db.query(
      `INSERT INTO "Lead" (id, "lojaId", "noivaNome", "updatedAt") VALUES
        ('e2e-lead-iso', $1, 'Ana Isolamento', NOW()),
        ('e2e-lead-b', $1, 'Beatriz Teste', NOW())`,
      [LOJA_A],
    );

    // Contrato (loja-a) — vendedora = admin-a, lead = Beatriz
    await db.query(
      `INSERT INTO "Contrato" (id, "lojaId", "leadId", "vendedoraId", "valorTotal", "updatedAt")
       VALUES ('e2e-contrato-1', $1, 'e2e-lead-b', 'e2e-admin-a', 8000, NOW())`,
      [LOJA_A],
    );
  } finally {
    await db.end();
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add tests/setup/seed-e2e.ts
git commit -m "test(e2e): seed determinístico (perfis, lojas, papéis, dados)"
```

---

## Task 6: Playwright config + projeto `setup` (db + storageState)

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/global.setup.ts`

- [ ] **Step 1: Criar `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, API_HEALTH_URL, API_PORT, VITE_PORT, TEST_DATABASE_URL } from "./tests/setup/constants";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
  ],
  webServer: [
    {
      // api-server de teste apontando para heliumdb_e2e
      command: "pnpm --dir ../api-server run build && node ../api-server/dist/index.mjs",
      url: API_HEALTH_URL,
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      env: { PORT: String(API_PORT), DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: "test" },
    },
    {
      // Vite servindo a SPA, proxy /api -> api-server de teste
      command: "vite --config vite.config.ts --port " + VITE_PORT,
      url: BASE_URL,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      env: { PORT: String(VITE_PORT), BASE_PATH: "/", API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
```

- [ ] **Step 2: Criar `tests/global.setup.ts`**

```ts
import { test as setup, request } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { ensureTestDatabase } from "./setup/db";
import { seed } from "./setup/seed-e2e";
import { BASE_URL, SENHA, LOJA_A, LOJA_B } from "./setup/constants";

setup("preparar banco de teste e autenticar papéis", async () => {
  await ensureTestDatabase();
  await seed();

  mkdirSync("tests/.auth", { recursive: true });
  await salvarAuth("super", "super@e2e.test", null);
  await salvarAuth("admin-a", "admin-a@e2e.test", LOJA_A);
  await salvarAuth("vend-a", "vend-a@e2e.test", LOJA_A);
  await salvarAuth("recep-a", "recep-a@e2e.test", LOJA_A);
  await salvarAuth("admin-b", "admin-b@e2e.test", LOJA_B);
});

async function salvarAuth(papel: string, email: string, lojaId: string | null): Promise<void> {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const login = await ctx.post("/api/auth/login", { data: { email, senha: SENHA } });
  if (!login.ok()) throw new Error(`login ${email} falhou: ${login.status()} ${await login.text()}`);
  if (lojaId) {
    const sel = await ctx.post("/api/auth/selecionar-loja", { data: { lojaId } });
    if (!sel.ok()) throw new Error(`selecionar-loja ${email} falhou: ${sel.status()}`);
  }
  await ctx.storageState({ path: `tests/.auth/${papel}.json` });
  await ctx.dispose();
}
```

- [ ] **Step 3: Rodar só o setup para validar a fundação**

Run:
```bash
pnpm test:e2e -- --project=setup
```
Expected: PASS. Sobe api-server + Vite, recria `heliumdb_e2e`, semeia e gera `tests/.auth/*.json` (5 arquivos). Se falhar no login → ver a mensagem (banco/seed/porta).

- [ ] **Step 4: Commit**
```bash
git add playwright.config.ts tests/global.setup.ts
git commit -m "test(e2e): config + setup (banco + storageState por papel)"
```

---

## Task 7: Specs de autenticação (inclui regressão do super-admin)

**Files:**
- Create: `tests/auth.spec.ts`

- [ ] **Step 1: Criar `tests/auth.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

// Login real pela UI (sem storageState) — valida o redirecionamento pós-login.
test.describe("autenticação", () => {
  test("super-admin cai em /admin (regressão do bug de roteamento)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("super@e2e.test");
    await page.getByLabel("Senha").fill("teste123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
  });

  test("admin vai para a loja após login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("admin-a@e2e.test");
    await page.getByLabel("Senha").fill("teste123");
    await page.getByRole("button", { name: "Entrar" }).click();
    // 1 loja vinculada → auto-seleção → /loja/loja-a
    await expect(page).toHaveURL(/\/loja\/loja-a/);
    await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();
  });

  test("credenciais inválidas mostram erro e ficam no login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("super@e2e.test");
    await page.getByLabel("Senha").fill("senha-errada");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
```

- [ ] **Step 2: Rodar**

Run:
```bash
pnpm test:e2e -- tests/auth.spec.ts
```
Expected: 3 PASS. (O 1º é a regressão do bug que originou o trabalho.)

- [ ] **Step 3: Commit**
```bash
git add tests/auth.spec.ts
git commit -m "test(e2e): autenticação + regressão super-admin -> /admin"
```

---

## Task 8: Smoke de todas as páginas

**Files:**
- Create: `tests/smoke.spec.ts`

- [ ] **Step 1: Criar `tests/smoke.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

const NAO_ENCONTRADO = "404 Page Not Found";

test.describe("smoke · super-admin", () => {
  test.use({ storageState: "tests/.auth/super.json" });

  for (const [path, heading] of [
    ["/admin", /Administração/],
    ["/admin/perfis", null],
  ] as Array<[string, RegExp | null]>) {
    test(`abre ${path}`, async ({ page }) => {
      const erros: string[] = [];
      page.on("pageerror", (e) => erros.push(String(e)));
      await page.goto(path);
      await expect(page.getByText(NAO_ENCONTRADO)).toHaveCount(0);
      if (heading) await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      await page.screenshot({ path: `test-results/smoke-super${path.replace(/\//g, "_")}.png` });
      expect(erros, `erros JS em ${path}`).toEqual([]);
    });
  }
});

test.describe("smoke · admin da loja", () => {
  test.use({ storageState: "tests/.auth/admin-a.json" });
  const L = "/loja/loja-a";

  const paginas: Array<[string, RegExp | null]> = [
    [`${L}`, /Início/],
    [`${L}/noivas`, /Noivas/],
    [`${L}/vestidos`, /Vestidos/],
    [`${L}/contratos`, /Contratos/],
    [`${L}/atendimentos/novo`, null],
    [`${L}/calendario`, /Calendário/],
    [`${L}/reservas`, /Reservas/],
    [`${L}/financeiro`, /Fluxo de caixa/],
    [`${L}/financeiro/receber`, /Contas a receber/],
    [`${L}/financeiro/pagar`, /Contas a pagar/],
    [`${L}/financeiro/comissoes`, /Comissões/],
    [`${L}/permissoes`, /Permissões/],
    ["/equipe", /Equipe/],
  ];

  for (const [path, heading] of paginas) {
    test(`abre ${path}`, async ({ page }) => {
      const erros: string[] = [];
      page.on("pageerror", (e) => erros.push(String(e)));
      await page.goto(path);
      await expect(page.getByText(NAO_ENCONTRADO)).toHaveCount(0);
      if (heading) await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      await page.screenshot({ path: `test-results/smoke-admin${path.replace(/\//g, "_")}.png` });
      expect(erros, `erros JS em ${path}`).toEqual([]);
    });
  }

  // Documenta o gap conhecido: links do menu sem rota na SPA caem em 404.
  test("links de menu sem rota viram 404 (gap conhecido da migração)", async ({ page }) => {
    for (const sufixo of ["/provas", "/ajustes", "/catalogo"]) {
      await page.goto(`/loja/loja-a${sufixo}`);
      await expect(page.getByText(NAO_ENCONTRADO)).toBeVisible();
    }
  });
});
```

- [ ] **Step 2: Rodar**

Run:
```bash
pnpm test:e2e -- tests/smoke.spec.ts
```
Expected: todos PASS. Screenshots em `test-results/`. Se alguma página real falhar (pageerror ou heading ausente), é um **bug encontrado** — anotar e investigar antes de seguir.

- [ ] **Step 3: Commit**
```bash
git add tests/smoke.spec.ts
git commit -m "test(e2e): smoke de todas as páginas + gap de links mortos"
```

---

## Task 9: Console do super-admin (fluxos de admin)

**Files:**
- Create: `tests/admin.spec.ts`

- [ ] **Step 1: Criar `tests/admin.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test.describe("console super-admin", () => {
  test.use({ storageState: "tests/.auth/super.json" });

  test("cria uma loja", async ({ page }) => {
    await page.goto("/admin");
    await page.getByPlaceholder("Nome da nova loja").fill("Atelier Teste E2E");
    await page.getByRole("button", { name: "Criar loja" }).click();
    await expect(page.getByText("Atelier Teste E2E")).toBeVisible();
  });

  test("cadastra um admin de loja", async ({ page }) => {
    await page.goto("/admin");
    // Labels do form de admin não têm htmlFor; seleciona pelos tipos de input.
    await page.locator('input[type="text"]:not([placeholder])').fill("Admin Novo E2E");
    await page.locator('input[type="email"]').fill("novo-admin@e2e.test");
    await page.locator('input[type="password"]').fill("teste123");
    await page.locator("select[multiple]").selectOption({ label: "Atelier SP" });
    await page.getByRole("button", { name: "Cadastrar admin" }).click();
    await expect(page.getByText("Admin cadastrado.")).toBeVisible();
  });

  test("abre a tela de perfis", async ({ page }) => {
    await page.goto("/admin/perfis");
    await expect(page.getByText("404 Page Not Found")).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Rodar**

Run:
```bash
pnpm test:e2e -- tests/admin.spec.ts
```
Expected: 3 PASS.

- [ ] **Step 3: Commit**
```bash
git add tests/admin.spec.ts
git commit -m "test(e2e): fluxos do console super-admin (criar loja/admin)"
```

---

## Task 10: Permissões por papel

**Files:**
- Create: `tests/permissoes.spec.ts`

- [ ] **Step 1: Criar `tests/permissoes.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test.describe("permissões · vendedora", () => {
  test.use({ storageState: "tests/.auth/vend-a.json" });

  test("não vê links de financeiro/equipe/permissões", async ({ page }) => {
    await page.goto("/loja/loja-a");
    await expect(page.getByRole("heading", { name: /Início/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Contas a receber" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Equipe" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Permissões" })).toHaveCount(0);
  });

  test("URL de financeiro proibida redireciona para a loja", async ({ page }) => {
    await page.goto("/loja/loja-a/financeiro/receber");
    await expect(page).toHaveURL(/\/loja\/loja-a$/);
  });

  test("não acessa a tela de Equipe", async ({ page }) => {
    await page.goto("/equipe");
    await expect(page).not.toHaveURL(/\/equipe/);
  });
});

test.describe("permissões · recepção", () => {
  test.use({ storageState: "tests/.auth/recep-a.json" });

  test("vê Noivas mas não vê Financeiro", async ({ page }) => {
    await page.goto("/loja/loja-a");
    await expect(page.getByRole("link", { name: "Noivas" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Contas a receber" })).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Rodar**

Run:
```bash
pnpm test:e2e -- tests/permissoes.spec.ts
```
Expected: 4 PASS. Se a vendedora **conseguir** ver financeiro, é falha de permissão real — anotar.

- [ ] **Step 3: Commit**
```bash
git add tests/permissoes.spec.ts
git commit -m "test(e2e): permissões por papel (vendedora/recepção)"
```

---

## Task 11: Isolamento entre lojas

**Files:**
- Create: `tests/isolamento.spec.ts`

- [ ] **Step 1: Criar `tests/isolamento.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

// admin-b tem lojaAtiva = loja-b; não pode operar a loja-a.
test.describe("isolamento entre lojas", () => {
  test.use({ storageState: "tests/.auth/admin-b.json" });

  test("admin-b é expulso ao tentar abrir uma página da loja-a", async ({ page }) => {
    await page.goto("/loja/loja-a/noivas");
    await expect(page).toHaveURL(/\/loja\/loja-b/);
  });

  test("admin-b não vê a noiva cadastrada na loja-a", async ({ page }) => {
    await page.goto("/loja/loja-b/noivas");
    await expect(page.getByRole("heading", { name: /Noivas/ })).toBeVisible();
    await expect(page.getByText("Ana Isolamento")).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Rodar**

Run:
```bash
pnpm test:e2e -- tests/isolamento.spec.ts
```
Expected: 2 PASS. Se "Ana Isolamento" aparecer para admin-b, é vazamento entre tenants — bug grave, anotar.

- [ ] **Step 3: Commit**
```bash
git add tests/isolamento.spec.ts
git commit -m "test(e2e): isolamento entre lojas (tenant)"
```

---

## Task 12: Fluxo que mexe em dados (criar noiva) + README

**Files:**
- Create: `tests/loja-fluxos.spec.ts`
- Create: `tests/README.md`

- [ ] **Step 1: Criar `tests/loja-fluxos.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test.describe("fluxo · criar noiva (write path real)", () => {
  test.use({ storageState: "tests/.auth/admin-a.json" });

  test("cria uma noiva e ela aparece na lista", async ({ page }) => {
    await page.goto("/loja/loja-a/noivas");
    await page.getByRole("button", { name: "+ Nova noiva" }).click();

    const form = page.locator("form", {
      has: page.getByRole("heading", { name: "Nova noiva" }),
    });
    await form.getByRole("textbox").first().fill("Carla E2E");
    await form.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByText("Carla E2E")).toBeVisible();
  });
});
```

- [ ] **Step 2: Rodar**

Run:
```bash
pnpm test:e2e -- tests/loja-fluxos.spec.ts
```
Expected: 1 PASS (form → API → lista).

- [ ] **Step 3: Criar `tests/README.md`**

````markdown
# Testes E2E (Playwright)

Suíte em browser real cobrindo todas as páginas da SPA, fluxos, permissões e isolamento entre lojas.

## Rodar

```bash
pnpm install
pnpm exec playwright install chromium   # baixa o Chromium (1ª vez)
pnpm test:e2e                            # roda tudo
pnpm test:e2e -- tests/auth.spec.ts      # um arquivo
pnpm test:e2e:ui                         # modo interativo
```

## Como funciona

- Stack isolada: Vite `:5175` → proxy `/api` → api-server `:8090` → Postgres `heliumdb_e2e`.
- O projeto `setup` (`tests/global.setup.ts`) recria o banco de teste, carrega `tests/setup/schema.sql`, roda o seed determinístico (`tests/setup/seed-e2e.ts`) e salva o `storageState` de cada papel em `tests/.auth/`.
- O banco real (`heliumdb`) **nunca é tocado**.

## Regerar o schema (após mudanças no modelo)

```bash
pg_dump --schema-only --no-owner --no-privileges "$DATABASE_URL_REAL" > tests/setup/schema.sql
```

## Extensões mapeadas (a fazer)

Fluxos profundos ainda não escritos (escopo registrado no spec):
- **Contrato → Pagamento**: começar lendo `src/pages/loja/AtendimentosNovoPage.tsx`,
  `src/pages/loja/ContratosPage.tsx`, `src/pages/loja/ContratoPage.tsx` e
  `src/pages/loja/FinanceiroReceberPage.tsx` para mapear os seletores, e seguir o
  padrão de `loja-fluxos.spec.ts`.
````

- [ ] **Step 4: Commit**
```bash
git add tests/loja-fluxos.spec.ts tests/README.md
git commit -m "test(e2e): fluxo criar-noiva + README"
```

---

## Task 13: Rodar a suíte inteira

- [ ] **Step 1: Executar tudo**

Run:
```bash
pnpm test:e2e
```
Expected: todos os projetos passam (`setup` → `chromium`). Relatório em `playwright-report/`, screenshots em `test-results/`.

- [ ] **Step 2: Inspecionar o relatório**

Run:
```bash
pnpm exec playwright show-report
```
Expected: lista verde. Qualquer vermelho que represente bug real do app deve ser anotado e levado ao dono (não "consertar o teste para passar").

- [ ] **Step 3: Commit final (se houver ajustes)**
```bash
git add -A
git commit -m "test(e2e): suíte completa verde"
```

---

## Self-Review (cobertura vs. spec)

- **Smoke (todas as páginas):** Task 8 cobre super (2), admin-loja (13) + gap de links. ✓
- **Fluxos que mexem em dados:** Task 9 (criar loja/admin) + Task 12 (criar noiva). Contrato/pagamento = extensão mapeada e registrada (spec + README), não omitida. ✓
- **Permissões:** Task 10 (vendedora + recepção). ✓
- **Negativos:** Task 7 (login inválido), Task 10 (URL proibida → redirect). ✓
- **Isolamento:** Task 11. ✓
- **Banco dedicado + seed + storageState:** Tasks 2-6. ✓
- **Só uma mudança em produção (proxy):** Task 1. ✓
- **Fallback Replit:** README (Task 12) + nota na Task 1 Step 2. ✓

Riscos conhecidos (documentados, não placeholders):
- `playwright install` pode falhar no FUSE do sandbox → suíte roda no Replit.
- `schema.sql` carregado via node-pg; se o dump trouxer meta-comandos `\connect`, removê-los (Task 2 Step 2).
- Seletores do form de admin dependem dos tipos de input (labels sem `htmlFor`).
