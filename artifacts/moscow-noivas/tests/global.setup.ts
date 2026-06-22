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
